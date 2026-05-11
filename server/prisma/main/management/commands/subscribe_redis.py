"""
Management command: python manage.py subscribe_redis

Consumes Redis stream job_events (job_acceptance, job_started, job_completed); updates BookedAppointment,
sends push/email, syncs images and bulk slots. Long-running consumer loop.
"""
from django.core.management.base import BaseCommand
import json
import logging
import re

from main.models import BookedAppointment, BookedAppointmentImage, Notification, User, Address, BulkOrder
from main.tasks import send_booking_confirmation_email, send_push_notification
from main.utils.bulk_appointments import get_or_create_bulk_appointment_for_slot
from main.utils.bulk_notifications import try_send_bulk_client_confirmation_notifications
from main.services.NotificationServices import NotificationService
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from main.utils.redis_streams import (
    STREAM_JOB_EVENTS,
    ensure_consumer_group,
    read_group_blocking,
    read_pending,
    ack,
)

logger = logging.getLogger(__name__)

CLIENT_GROUP = "client_group"
CONSUMER_NAME = "subscribe_redis"


class Command(BaseCommand):
    help = "Read from Redis stream job_events (job_acceptance, job_started, job_completed) and process messages."

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.notification_service = NotificationService()

    def _sync_before_booking_images(self, booking, before_images):
        """Persist before images from Redis payload; skip empty URLs and duplicates."""
        if not before_images:
            return 0
        created = 0
        for img_data in before_images:
            if not isinstance(img_data, dict):
                continue
            url = (img_data.get("image_url") or "").strip()
            if not url:
                continue
            seg = img_data.get("segment")
            if seg not in ("interior", "exterior"):
                seg = "exterior"
            try:
                if BookedAppointmentImage.objects.filter(
                    booking=booking, image_type="before", image_url=url
                ).exists():
                    continue
                BookedAppointmentImage.objects.create(
                    booking=booking,
                    image_type="before",
                    image_url=url,
                    segment=seg,
                )
                created += 1
            except Exception as e:
                self.stderr.write(f"Error saving before image: {e}")
        if created:
            self.stdout.write(
                f"Synced {created} new before image(s) for {booking.booking_reference}"
            )
        return created

    def _sync_after_booking_images(self, booking, after_images):
        """Persist after images from Redis payload; skip empty URLs and duplicates."""
        if not after_images:
            return 0
        created = 0
        for img_data in after_images:
            if not isinstance(img_data, dict):
                continue
            url = (img_data.get("image_url") or "").strip()
            if not url:
                continue
            seg = img_data.get("segment")
            if seg not in ("interior", "exterior"):
                seg = "exterior"
            try:
                if BookedAppointmentImage.objects.filter(
                    booking=booking, image_type="after", image_url=url
                ).exists():
                    continue
                BookedAppointmentImage.objects.create(
                    booking=booking,
                    image_type="after",
                    image_url=url,
                    segment=seg,
                )
                created += 1
            except Exception as e:
                self.stderr.write(f"Error saving after image: {e}")
        if created:
            self.stdout.write(
                f"Synced {created} new after image(s) for {booking.booking_reference}"
            )
        return created

    def handle(self, *args, **options):
        ensure_consumer_group(STREAM_JOB_EVENTS, CLIENT_GROUP)
        self.stdout.write(self.style.SUCCESS("Subscribed to job_events stream (client_group)"))

        channel_layer = get_channel_layer()

        # Process any pending messages from previous run
        for msg_id, fields in read_pending(STREAM_JOB_EVENTS, CLIENT_GROUP, CONSUMER_NAME):
            self._process_message(msg_id, fields, channel_layer)

        try:
            while True:
                entries = read_group_blocking(STREAM_JOB_EVENTS, CLIENT_GROUP, CONSUMER_NAME, block_ms=5000)
                for msg_id, fields in entries:
                    self._process_message(msg_id, fields, channel_layer)
        except KeyboardInterrupt:
            self.stdout.write(self.style.SUCCESS("subscribe_redis stopped"))

    def _process_message(self, msg_id, fields, channel_layer):
        event = fields.get("event")
        raw = fields.get("payload", "{}")
        if event not in ("job_acceptance", "job_started", "job_completed"):
            ack(STREAM_JOB_EVENTS, CLIENT_GROUP, msg_id)
            return
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                booking_reference = data.get("booking_reference", data)
                detailers_list = data.get("detailers")
                if isinstance(detailers_list, list) and detailers_list:
                    detailer_data = None  # use list path
                else:
                    detailer_data = data.get("detailer", {})
            else:
                booking_reference = str(data).strip().strip('"').strip("'")
                detailers_list = []
                detailer_data = {}
                data = {}
        except Exception:
            booking_reference = str(raw).strip().strip('"').strip("'")
            detailers_list = []
            detailer_data = {}
            data = {}

        self.stdout.write(f"Received {event}: {booking_reference}")

        def vehicle_display(booking):
            """Safe vehicle string for notifications (bulk has no vehicle)."""
            vehicle = getattr(booking, "vehicle", None)
            if vehicle is not None:
                make = getattr(vehicle, "make", None)
                model = getattr(vehicle, "model", None)
                if make is not None or model is not None:
                    return f"{make or ''} {model or ''}".strip() or "your vehicle"
            ref = getattr(booking, "booking_reference", "") or ""
            if "-" in ref:
                try:
                    suffix = ref.split("-")[-1]
                    if suffix.isdigit():
                        return f"Vehicle {suffix}"
                except Exception:
                    pass
            return "your vehicle"

        def _job_started_message(booking, vehicle_display_fn):
            """Build job-started push message; never raise (bulk has no vehicle)."""
            try:
                detailer_part = (
                    booking.detailer.name if getattr(booking, "detailer", None) else "The detailer"
                )
                vehicle_part = vehicle_display_fn(booking)
                return f"Your valet service has started. {detailer_part} is now working on your {vehicle_part}"
            except Exception as e:
                self.stderr.write(f"Job started message fallback: {e}")
                return "Your valet service has started. The detailer is now working on your vehicle."

        try:
            booking = BookedAppointment.objects.get(booking_reference=booking_reference)

            if event == "job_acceptance":
                from main.views.payment import assign_detailers_to_booking

                if isinstance(detailers_list, list) and len(detailers_list) > 0:
                    assign_detailers_to_booking(booking, detailers_list)
                    self.stdout.write(f"Assigned {len(detailers_list)} detailer(s) to booking {booking_reference}")
                elif detailer_data and isinstance(detailer_data, dict) and detailer_data.get("phone"):
                    assign_detailers_to_booking(booking, [detailer_data])
                    self.stdout.write(f"Detailer assigned to booking {booking_reference}")

                booking.status = "confirmed"
                booking.save()
                self.stdout.write(f"Updated booking {booking_reference} to confirmed")

                if getattr(booking, "bulk_order_id", None):
                    bulk_order = booking.bulk_order
                    sent = try_send_bulk_client_confirmation_notifications(bulk_order, booking)
                    if sent:
                        self.stdout.write(
                            f"Sent bulk client confirmation (once) for {bulk_order.booking_reference}"
                        )
                else:
                    # Single booking: per-booking email, push, and notification.
                    if booking.user.allow_email_notifications and booking.detailer:
                        vdisp = vehicle_display(booking)
                        parts = vdisp.split(None, 1)
                        vmake = parts[0] if parts else "Vehicle"
                        vmodel = parts[1] if len(parts) > 1 else "—"
                        send_booking_confirmation_email.delay(
                            booking.user.email,
                            booking.user.name,
                            booking.booking_reference,
                            vmake,
                            vmodel,
                            booking.appointment_date,
                            booking.start_time,
                            booking.service_type.name,
                            booking.valet_type.name,
                            booking.total_amount,
                            booking.detailer.name,
                        )
                    send_push_notification.delay(
                        booking.user.id,
                        "Booking Confirmed! 🎉",
                        f"Your valet service is confirmed for {booking.appointment_date} at {booking.start_time}. Your detailer is {booking.detailer.name}",
                        {
                            "type": "booking_confirmed",
                            "booking_reference": booking.booking_reference,
                            "screen": "booking_details",
                        },
                    )
                    self.create_notification(
                        booking.user,
                        "Booking Confirmed",
                        "booking_confirmed",
                        "success",
                        f"Your booking has been confirmed! Your detailer will be with you at the specified time. Your detailer is {booking.detailer.name}",
                    )

            elif event == "job_started":
                before_images = data.get("before_images", []) if isinstance(data, dict) else []
                skip_notify = isinstance(data, dict) and bool(data.get("skip_client_notification"))
                if not skip_notify:
                    booking.status = "in_progress"
                    booking.save()
                    self.stdout.write(f"Updated booking {booking.booking_reference} to in_progress")
                else:
                    self.stdout.write(
                        f"Before-images sync for {booking.booking_reference} "
                        f"(skip duplicate start notification; {len(before_images)} image(s) in payload)"
                    )
                self._sync_before_booking_images(booking, before_images)
                if not skip_notify:
                    send_push_notification.delay(
                        booking.user.id,
                        "Service Started! 🚀",
                        _job_started_message(booking, vehicle_display),
                        {"type": "appointment_started", "booking_reference": booking.booking_reference, "screen": "booking_details"},
                    )
                    self.create_notification(
                        booking.user,
                        "Appointment Started",
                        "appointment_started",
                        "success",
                        "Your appointment has been started! You will be notified when it is completed.",
                    )

            elif event == "job_completed":
                after_images = data.get("after_images", []) if isinstance(data, dict) else []
                fleet_maintenance_data = data.get("fleet_maintenance") if isinstance(data, dict) else None
                skip_notify = isinstance(data, dict) and bool(data.get("skip_client_notification"))
                if not skip_notify:
                    booking.status = "completed"
                    booking.save()
                    self.stdout.write(f"Updated booking {booking.booking_reference} to completed")
                else:
                    self.stdout.write(
                        f"After-images sync for {booking.booking_reference} "
                        f"(skip duplicate completion notification; {len(after_images)} image(s) in payload)"
                    )
                self._sync_after_booking_images(booking, after_images)
                if not skip_notify and fleet_maintenance_data:
                    try:
                        from main.models import EventDataManagement
                        EventDataManagement.objects.update_or_create(
                            booking=booking,
                            defaults={
                                "tire_tread_depth": fleet_maintenance_data.get("tire_tread_depth"),
                                "tire_condition": fleet_maintenance_data.get("tire_condition"),
                                "wiper_status": fleet_maintenance_data.get("wiper_status"),
                                "oil_level": fleet_maintenance_data.get("oil_level"),
                                "coolant_level": fleet_maintenance_data.get("coolant_level"),
                                "brake_fluid_level": fleet_maintenance_data.get("brake_fluid_level"),
                                "battery_condition": fleet_maintenance_data.get("battery_condition"),
                                "headlights_status": fleet_maintenance_data.get("headlights_status"),
                                "taillights_status": fleet_maintenance_data.get("taillights_status"),
                                "indicators_status": fleet_maintenance_data.get("indicators_status"),
                                "vehicle_condition_notes": fleet_maintenance_data.get("vehicle_condition_notes"),
                                "damage_report": fleet_maintenance_data.get("damage_report"),
                            },
                        )
                    except Exception as e:
                        self.stderr.write(f"Error saving fleet maintenance: {e}")
                if not skip_notify:
                    send_push_notification.delay(
                        booking.user.id,
                        "Service Completed! ✨",
                        f"Your valet service has been completed! Thank you for choosing PRISMA VALET.",
                        {"type": "cleaning_completed", "booking_reference": booking.booking_reference, "screen": "service_history"},
                    )
                    self.create_notification(
                        booking.user,
                        "Appointment Completed",
                        "cleaning_completed",
                        "success",
                        "Your appointment has been completed! Thank you for choosing Prisma.",
                    )
            ack(STREAM_JOB_EVENTS, CLIENT_GROUP, msg_id)

        except BookedAppointment.DoesNotExist:
            # May be a bulk job ref (e.g. BULK123-1, BULK123-2)
            match = re.match(r"^(.+)-(\d+)$", str(booking_reference).strip())
            if match and event in ("job_started", "job_completed"):
                base_ref = match.group(1).strip()
                bulk = BulkOrder.objects.filter(booking_reference=base_ref).first()
                if bulk:
                    booking, created = get_or_create_bulk_appointment_for_slot(bulk, booking_reference)
                    if booking:
                        if created:
                            self.stdout.write(f"Created bulk appointment {booking_reference}")
                        if event == "job_started":
                            before_images = data.get("before_images", []) if isinstance(data, dict) else []
                            skip_notify = isinstance(data, dict) and bool(data.get("skip_client_notification"))
                            if not skip_notify:
                                booking.status = "in_progress"
                                booking.save()
                                self.stdout.write(f"Updated booking {booking.booking_reference} to in_progress")
                            else:
                                self.stdout.write(
                                    f"Before-images sync (bulk) for {booking.booking_reference} "
                                    f"({len(before_images)} image(s) in payload)"
                                )
                            self._sync_before_booking_images(booking, before_images)
                            if not skip_notify:
                                send_push_notification.delay(
                                    booking.user.id,
                                    "Service Started! 🚀",
                                    _job_started_message(booking, vehicle_display),
                                    {"type": "appointment_started", "booking_reference": booking.booking_reference, "screen": "booking_details"},
                                )
                                self.create_notification(
                                    booking.user,
                                    "Appointment Started",
                                    "appointment_started",
                                    "success",
                                    "Your appointment has been started! You will be notified when it is completed.",
                                )
                        else:
                            after_images = data.get("after_images", []) if isinstance(data, dict) else []
                            fleet_maintenance_data = data.get("fleet_maintenance") if isinstance(data, dict) else None
                            skip_notify = isinstance(data, dict) and bool(data.get("skip_client_notification"))
                            if not skip_notify:
                                booking.status = "completed"
                                booking.save()
                                self.stdout.write(f"Updated booking {booking.booking_reference} to completed")
                            else:
                                self.stdout.write(
                                    f"After-images sync (bulk) for {booking.booking_reference} "
                                    f"({len(after_images)} image(s) in payload)"
                                )
                            self._sync_after_booking_images(booking, after_images)
                            if not skip_notify and fleet_maintenance_data:
                                try:
                                    from main.models import EventDataManagement
                                    EventDataManagement.objects.update_or_create(
                                        booking=booking,
                                        defaults={
                                            "tire_tread_depth": fleet_maintenance_data.get("tire_tread_depth"),
                                            "tire_condition": fleet_maintenance_data.get("tire_condition"),
                                            "wiper_status": fleet_maintenance_data.get("wiper_status"),
                                            "oil_level": fleet_maintenance_data.get("oil_level"),
                                            "coolant_level": fleet_maintenance_data.get("coolant_level"),
                                            "brake_fluid_level": fleet_maintenance_data.get("brake_fluid_level"),
                                            "battery_condition": fleet_maintenance_data.get("battery_condition"),
                                            "headlights_status": fleet_maintenance_data.get("headlights_status"),
                                            "taillights_status": fleet_maintenance_data.get("taillights_status"),
                                            "indicators_status": fleet_maintenance_data.get("indicators_status"),
                                            "vehicle_condition_notes": fleet_maintenance_data.get("vehicle_condition_notes"),
                                            "damage_report": fleet_maintenance_data.get("damage_report"),
                                        },
                                    )
                                except Exception as e:
                                    self.stderr.write(f"Error saving fleet maintenance: {e}")
                            if not skip_notify:
                                send_push_notification.delay(
                                    booking.user.id,
                                    "Service Completed! ✨",
                                    f"Your valet service has been completed! Thank you for choosing PRISMA VALET.",
                                    {"type": "cleaning_completed", "booking_reference": booking.booking_reference, "screen": "service_history"},
                                )
                                self.create_notification(
                                    booking.user,
                                    "Appointment Completed",
                                    "cleaning_completed",
                                    "success",
                                    "Your appointment has been completed! Thank you for choosing Prisma.",
                                )
                        ack(STREAM_JOB_EVENTS, CLIENT_GROUP, msg_id)
                        return
                else:
                    self.stderr.write(f"Bulk order not found: {base_ref}")
            if event == "job_acceptance" and detailer_data and detailer_data.get("phone"):
                match_accept = re.match(r"^(.+)-(\d+)$", str(booking_reference).strip())
                if match_accept:
                    base_ref = match_accept.group(1).strip()
                    bulk = BulkOrder.objects.filter(booking_reference=base_ref).first()
                    if bulk:
                        from main.models import DetailerProfile
                        from main.util.phone_utils import normalize_phone

                        detailer_name = detailer_data.get("name", "").strip()
                        detailer_phone = detailer_data.get("phone", "").strip()
                        detailer_rating = detailer_data.get("rating", 0.0)
                        normalized_phone = normalize_phone(detailer_phone)
                        if normalized_phone:
                            detailer, _ = DetailerProfile.objects.get_or_create(
                                phone=normalized_phone,
                                defaults={"name": detailer_name, "rating": detailer_rating},
                            )
                            if detailer_rating and detailer_rating != getattr(detailer, "rating", None):
                                detailer.rating = detailer_rating
                                detailer.save()
                            assigned = getattr(bulk, "assigned_detailers", None) or []
                            if not isinstance(assigned, list):
                                assigned = []
                            detailer_id_str = str(detailer.id)
                            if not any(d.get("id") == detailer_id_str for d in assigned):
                                assigned.append({
                                    "id": detailer_id_str,
                                    "name": detailer.name or detailer_name,
                                    "rating": float(getattr(detailer, "rating", 0) or 0),
                                    "phone": detailer.phone or None,
                                    "image": None,
                                })
                                bulk.assigned_detailers = assigned
                                bulk.save()
                                self.stdout.write(f"Detailer {detailer.name} added to bulk order {base_ref}")
                                if len(assigned) == 1:
                                    send_push_notification.delay(
                                        bulk.user.id,
                                        "Bulk booking team assigned",
                                        "Your bulk booking team has been assigned.",
                                        "bulk_team_assigned",
                                    )
                                    self.create_notification(
                                        bulk.user,
                                        "Bulk booking team assigned",
                                        "bulk_team_assigned",
                                        "success",
                                        "Your bulk booking team has been assigned.",
                                    )
                        else:
                            self.stderr.write(f"Invalid phone for bulk detailer: {detailer_name}")
                    else:
                        self.stderr.write(f"Bulk order not found: {base_ref}")
                else:
                    self.stderr.write(f"Booking not found: {booking_reference}")
            else:
                self.stderr.write(f"Booking not found: {booking_reference}")
            ack(STREAM_JOB_EVENTS, CLIENT_GROUP, msg_id)
        except Exception as e:
            self.stderr.write(f"Processing error: {e}")
            ack(STREAM_JOB_EVENTS, CLIENT_GROUP, msg_id)

    def create_notification(self, user, title, type, status, message):
        try:
            Notification.objects.create(user=user, title=title, type=type, status=status, message=message)
            return True
        except Exception as e:
            self.stderr.write(f"Failed to create notification: {e}")
            return False

    def get_currency_symbol(self, user_id):
        user = User.objects.get(id=user_id)
        address = Address.objects.filter(user=user).first()
        if address and address.country and (address.country == "United Kingdom" or address.country.lower() == "united kingdom"):
            return "£"
        if address and address.country and (address.country == "Ireland" or address.country.lower() == "ireland"):
            return "€"
        return "€"
