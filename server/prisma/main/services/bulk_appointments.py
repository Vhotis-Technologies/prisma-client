"""
Create synthetic BookedAppointment rows for each vehicle in a BulkOrder.

Lets detailer job_started/job_completed events sync status and images to the client
and exposes each bulk slot in service history.
"""
from datetime import datetime
from decimal import Decimal

from main.models import BookedAppointment, BulkOrder, ServiceType, ValetType, AddOns


def _resolve_service_type_and_valet_type(order_data):
    """
    Resolve ``ServiceType`` and ``ValetType`` from bulk ``order_data``.

    Accepts dict or string names; falls back to first DB row when name missing.

    Args:
        order_data: Bulk order JSON (``service_type``, ``valet_type`` keys).

    Returns:
        tuple: ``(service_type, valet_type)`` model instances.

    Raises:
        ValueError: When no ``ServiceType`` or ``ValetType`` exists in the database.
    """
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
    """
    Parse appointment date and start time from bulk ``order_data``.

    Args:
        order_data: Dict with ``date``/``appointment_date`` and ``start_time``/``best_start_time``.

    Returns:
        tuple: ``(date, time | None)`` — time None when unparseable.
    """
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
    """
    Resolve ``AddOns`` queryset from ``order_data.addons`` (ids as dicts or scalars).

    Args:
        order_data: Bulk order JSON.

    Returns:
        list: ``AddOns`` instances (empty list when no addons).
    """
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
    """
    Build ``get_or_create`` defaults for a single bulk slot appointment.

    Args:
        bulk_order: Parent ``BulkOrder`` (must have ``address_id``).
        service_type, valet_type: Resolved service models.
        appointment_date, start_time: Scheduled slot timing.
        total_amount: Per-vehicle share of bulk total.

    Returns:
        dict: Field defaults for ``BookedAppointment``.

    Raises:
        ValueError: When ``bulk_order`` has no address.
    """
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
    Create one ``BookedAppointment`` per vehicle for the given ``BulkOrder``.

    Idempotent via ``get_or_create`` on ``booking_reference`` (``{ref}-{i}``).
    Attaches add-ons from ``order_data`` when present.

    Args:
        bulk_order: ``BulkOrder`` with ``number_of_vehicles`` and ``order_data``.
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
    Get or create the ``BookedAppointment`` for one bulk slot reference.

    Used by ``subscribe_redis`` when job events arrive before ``create_bulk_appointments``.

    Args:
        bulk_order: Parent bulk order.
        booking_reference: Slot ref (e.g. ``BULKxxx-3``).

    Returns:
        tuple: ``(appointment, created)`` or ``(None, False)`` when bulk invalid.
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
