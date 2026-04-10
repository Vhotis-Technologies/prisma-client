from celery import shared_task
from django.template.loader import render_to_string
from django.conf import settings
from datetime import datetime
from main.util.graph_mail import send_mail as graph_send_mail
from main.models import BulkOrder


@shared_task
def send_booking_confirmation_email(user_email, customer_name, booking_reference, vehicle_make, vehicle_model, booking_date, start_time, service_type_name, valet_type_name, total_cost, detailer_name):
    subject = f'Booking Confirmation - #{booking_reference}'
    base = getattr(settings, 'FRONTEND_BASE_URL', None) or ''
    context = {
        'customer_name': customer_name,
        'booking_reference': booking_reference,
        'vehicle_make': vehicle_make,
        'vehicle_model': vehicle_model,
        'booking_date': booking_date.strftime('%B %d, %Y') if booking_date else '',
        'start_time': start_time.strftime('%I:%M %p') if start_time else '',
        'service_type_name': service_type_name,
        'valet_type_name': valet_type_name,
        'total_cost': total_cost,
        'detailer_name': detailer_name,
        'privacy_policy_url': 'https://prismavalet.com/privacy',
        'terms_of_service_url': 'https://prismavalet.com/terms',
        'current_year': str(booking_date.year if booking_date else datetime.now().year),
    }
    html_message = render_to_string('booking_confirmation.html', context)
    try:
        graph_send_mail(subject, html_message, user_email)
        return f"Booking confirmation email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send booking confirmation email: {str(e)}"


def _bulk_order_date_time(order_data):
    """Parse appointment date and start_time from bulk order_data. Returns (date_str, time_str)."""
    date_str = ''
    time_str = ''
    d = order_data.get('date') or order_data.get('appointment_date', '')
    if isinstance(d, str) and len(d) >= 10:
        try:
            dt = datetime.strptime(d[:10], '%Y-%m-%d')
            date_str = dt.strftime('%B %d, %Y')
        except (ValueError, TypeError):
            date_str = d[:10]
    t = order_data.get('start_time') or order_data.get('best_start_time', '')
    if t:
        if isinstance(t, str):
            if len(t) == 5:
                t = t + ':00'
            for fmt in ('%H:%M:%S', '%H:%M'):
                try:
                    parsed = datetime.strptime(t.split('.')[0], fmt)
                    time_str = parsed.strftime('%I:%M %p')
                    break
                except ValueError:
                    continue
    return date_str, time_str


def _bulk_service_valet_names(order_data):
    """Get service_type_name and valet_type_name from order_data."""
    st = order_data.get('service_type')
    vt = order_data.get('valet_type')
    service_name = (st.get('name') if isinstance(st, dict) else (st if isinstance(st, str) else '')) or 'Valet'
    valet_name = (vt.get('name') if isinstance(vt, dict) else (vt if isinstance(vt, str) else '')) or 'Standard'
    return service_name, valet_name


@shared_task
def send_bulk_booking_confirmation_email(bulk_order_id):
    """Send a single confirmation email for a bulk order (multiple vehicles)."""
    try:
        bulk_order = BulkOrder.objects.get(id=bulk_order_id)
    except BulkOrder.DoesNotExist:
        return f"BulkOrder {bulk_order_id} not found"
    order_data = getattr(bulk_order, 'order_data', None) or {}
    user = bulk_order.user
    base = getattr(settings, 'FRONTEND_BASE_URL', None) or ''
    booking_date_str, start_time_str = _bulk_order_date_time(order_data)
    service_type_name, valet_type_name = _bulk_service_valet_names(order_data)
    assigned = getattr(bulk_order, 'assigned_detailers', None) or []
    if not isinstance(assigned, list):
        assigned = []
    detailer_names = [d.get('name') or '' for d in assigned if isinstance(d, dict) and d.get('name')]
    detailer_display = ', '.join(detailer_names) if detailer_names else 'Your assigned team'
    total_cost = bulk_order.total_amount
    if total_cost is not None:
        total_cost = str(total_cost)
    context = {
        'customer_name': user.name if user else 'Customer',
        'booking_reference': bulk_order.booking_reference,
        'number_of_vehicles': int(bulk_order.number_of_vehicles or 0),
        'booking_date': booking_date_str,
        'start_time': start_time_str,
        'service_type_name': service_type_name,
        'valet_type_name': valet_type_name,
        'total_cost': total_cost or '0',
        'detailer_name': detailer_display,
        'privacy_policy_url': 'https://prismavalet.com/privacy',
        'terms_of_service_url': 'https://prismavalet.com/terms',
        'current_year': str(datetime.now().year),
    }
    html_message = render_to_string('bulk_booking_confirmation.html', context)
    subject = f'Bulk Booking Confirmation - #{bulk_order.booking_reference}'
    try:
        graph_send_mail(subject, html_message, user.email)
        return f"Bulk booking confirmation email sent successfully to {user.email}"
    except Exception as e:
        return f"Failed to send bulk booking confirmation email: {str(e)}"


def deliver_single_booking_reminder_6h_email(appointment):
    """
    Send the 6-hour reminder email for a standard (non-bulk) booking.
    Caller is responsible for allow_email_notifications and dedupe flags.
    Returns True if an email was handed to the mail backend.
    """
    user = appointment.user
    if not user or not user.email:
        return False
    vehicle = getattr(appointment, "vehicle", None)
    vmake = getattr(vehicle, "make", None) or "Vehicle"
    vmodel = getattr(vehicle, "model", None) or ""
    st = getattr(appointment.service_type, "name", None) or "Service"
    vt = getattr(appointment.valet_type, "name", None) or "Standard"
    context = {
        "customer_name": user.name or "Customer",
        "is_bulk": False,
        "booking_reference": appointment.booking_reference,
        "booking_date": appointment.appointment_date.strftime("%B %d, %Y") if appointment.appointment_date else "",
        "start_time": appointment.start_time.strftime("%I:%M %p") if appointment.start_time else "",
        "service_type_name": st,
        "valet_type_name": vt,
        "vehicle_make": vmake,
        "vehicle_model": vmodel,
        "number_of_vehicles": None,
        "detailer_name": getattr(appointment.detailer, "name", None) or "Your assigned detailer",
        "privacy_policy_url": "https://prismavalet.com/privacy",
        "terms_of_service_url": "https://prismavalet.com/terms",
        "current_year": str(datetime.now().year),
    }
    html_message = render_to_string("booking_reminder_6h.html", context)
    subject = f"Reminder: your valet is in 6 hours – #{appointment.booking_reference}"
    graph_send_mail(subject, html_message, user.email)
    return True


def deliver_bulk_booking_reminder_6h_email(bulk_order, sample_appointment):
    """
    Send one 6-hour reminder email for an entire bulk order.
    sample_appointment: any linked BookedAppointment (same date/time as bulk window).
    """
    user = bulk_order.user
    if not user or not user.email:
        return False
    order_data = getattr(bulk_order, "order_data", None) or {}
    booking_date_str, start_time_str = _bulk_order_date_time(order_data)
    if sample_appointment and sample_appointment.appointment_date:
        booking_date_str = sample_appointment.appointment_date.strftime("%B %d, %Y")
    if sample_appointment and sample_appointment.start_time:
        start_time_str = sample_appointment.start_time.strftime("%I:%M %p")
    service_type_name, valet_type_name = _bulk_service_valet_names(order_data)
    assigned = getattr(bulk_order, "assigned_detailers", None) or []
    if not isinstance(assigned, list):
        assigned = []
    detailer_names = [d.get("name") or "" for d in assigned if isinstance(d, dict) and d.get("name")]
    detailer_display = ", ".join(detailer_names) if detailer_names else "Your assigned team"
    context = {
        "customer_name": user.name or "Customer",
        "is_bulk": True,
        "booking_reference": bulk_order.booking_reference,
        "booking_date": booking_date_str,
        "start_time": start_time_str,
        "service_type_name": service_type_name,
        "valet_type_name": valet_type_name,
        "vehicle_make": "",
        "vehicle_model": "",
        "number_of_vehicles": int(bulk_order.number_of_vehicles or 0),
        "detailer_name": detailer_display,
        "privacy_policy_url": "https://prismavalet.com/privacy",
        "terms_of_service_url": "https://prismavalet.com/terms",
        "current_year": str(datetime.now().year),
    }
    html_message = render_to_string("booking_reminder_6h.html", context)
    subject = f"Reminder: your bulk valet is in 6 hours – #{bulk_order.booking_reference}"
    graph_send_mail(subject, html_message, user.email)
    return True
