"""
Create synthetic BookedAppointment rows for each vehicle in a BulkOrder,
so that job_started/job_completed from the detailer can sync status and images
to the client and each bulk vehicle appears in service history.
"""
from datetime import datetime
from decimal import Decimal

from main.models import BookedAppointment, BulkOrder, ServiceType, ValetType, AddOns


def _resolve_service_type_and_valet_type(order_data):
    """Resolve ServiceType and ValetType from order_data. Returns (service_type, valet_type)."""
    service_type = None
    st = order_data.get('service_type')
    if isinstance(st, dict):
        name = (st.get('name') or '').strip()
        if name:
            service_type = ServiceType.objects.filter(name=name).first()
    elif isinstance(st, str) and st.strip():
        service_type = ServiceType.objects.filter(name=st.strip()).first()
    if not service_type:
        service_type = ServiceType.objects.first()
    if not service_type:
        raise ValueError("No ServiceType found for bulk order")

    valet_type = None
    vt = order_data.get('valet_type')
    if isinstance(vt, dict):
        name = (vt.get('name') or '').strip()
        if name:
            valet_type = ValetType.objects.filter(name=name).first()
    elif isinstance(vt, str) and vt.strip():
        valet_type = ValetType.objects.filter(name=vt.strip()).first()
    if not valet_type:
        valet_type = ValetType.objects.first()
    if not valet_type:
        raise ValueError("No ValetType found for bulk order")

    return service_type, valet_type


def _parse_appointment_date_and_time(order_data):
    """Parse appointment_date and start_time from order_data. Returns (date, time or None)."""
    date_str = order_data.get('date') or order_data.get('appointment_date', '')
    if isinstance(date_str, str) and len(date_str) >= 10:
        date_str = date_str[:10]
    try:
        appointment_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        appointment_date = datetime.now().date()

    start_time = None
    start_time_str = order_data.get('start_time') or order_data.get('best_start_time', '06:00')
    if start_time_str:
        if isinstance(start_time_str, str):
            if len(start_time_str) == 5:  # HH:MM
                start_time_str = start_time_str + ':00'
            for fmt in ('%H:%M:%S', '%H:%M'):
                try:
                    start_time = datetime.strptime(start_time_str.split('.')[0], fmt).time()
                    break
                except ValueError:
                    continue
    return appointment_date, start_time


def _resolve_addons(order_data):
    """Resolve AddOns from order_data.addons. Returns AddOns queryset."""
    addons_data = order_data.get('addons') or []
    if not addons_data:
        return []
    addon_ids = []
    for a in addons_data:
        if isinstance(a, dict) and a.get('id') is not None:
            addon_ids.append(a['id'])
        elif isinstance(a, (int, str)) and a:
            addon_ids.append(a)
    if not addon_ids:
        return []
    return list(AddOns.objects.filter(id__in=addon_ids))


def _build_bulk_appointment_defaults(bulk_order, service_type, valet_type, appointment_date, start_time, total_amount):
    """Build the common defaults for a single bulk slot appointment."""
    if not bulk_order.address_id:
        raise ValueError("BulkOrder must have an address to create appointments")
    return {
        'user': bulk_order.user,
        'bulk_order': bulk_order,
        'vehicle': None,
        'address_id': bulk_order.address_id,
        'service_type': service_type,
        'valet_type': valet_type,
        'appointment_date': appointment_date,
        'start_time': start_time,
        'total_amount': total_amount,
        'duration': getattr(service_type, 'duration', None) or 60,
        'status': 'confirmed',
        'subtotal_amount': total_amount,
        'vat_amount': Decimal('0'),
    }


def create_bulk_appointments(bulk_order):
    """
    Create one BookedAppointment per vehicle for the given BulkOrder.
    Idempotent: uses get_or_create keyed by booking_reference so safe to call twice.
    Sets add_ons from order_data.addons when present.
    """
    if not bulk_order.address_id:
        return
    order_data = getattr(bulk_order, 'order_data', None) or {}
    n = int(bulk_order.number_of_vehicles or 0)
    if n <= 0:
        return
    service_type, valet_type = _resolve_service_type_and_valet_type(order_data)
    appointment_date, start_time = _parse_appointment_date_and_time(order_data)
    amount_per_slot = (bulk_order.total_amount or Decimal('0')) / n
    addons_objs = _resolve_addons(order_data)

    for i in range(1, n + 1):
        booking_reference = f"{bulk_order.booking_reference}-{i}"
        defaults = _build_bulk_appointment_defaults(
            bulk_order, service_type, valet_type,
            appointment_date, start_time, amount_per_slot,
        )
        appointment, _ = BookedAppointment.objects.get_or_create(
            booking_reference=booking_reference,
            defaults=defaults,
        )
        if addons_objs:
            appointment.add_ons.set(addons_objs)


def get_or_create_bulk_appointment_for_slot(bulk_order, booking_reference):
    """
    Get or create the single BookedAppointment for a bulk slot (e.g. BULKxxx-3).
    Used by subscribe_redis when it receives job_started/job_completed for a ref
    that might not have been created yet by create_bulk_appointments.
    Returns (appointment, created).
    """
    order_data = getattr(bulk_order, 'order_data', None) or {}
    n = int(bulk_order.number_of_vehicles or 0)
    if n <= 0 or not bulk_order.address_id:
        return None, False

    try:
        amount_per_slot = (bulk_order.total_amount or Decimal('0')) / n
    except (ValueError, IndexError, TypeError):
        return None, False

    service_type, valet_type = _resolve_service_type_and_valet_type(order_data)
    appointment_date, start_time = _parse_appointment_date_and_time(order_data)
    defaults = _build_bulk_appointment_defaults(
        bulk_order, service_type, valet_type,
        appointment_date, start_time, amount_per_slot,
    )
    return BookedAppointment.objects.get_or_create(
        booking_reference=booking_reference,
        defaults=defaults,
    )
