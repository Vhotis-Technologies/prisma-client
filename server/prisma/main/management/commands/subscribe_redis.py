"""
Management command: python manage.py subscribe_redis

Consumes Redis stream job_events (job_acceptance, job_started, job_completed); updates BookedAppointment,
sends push/email, syncs images and bulk slots. Long-running consumer loop.
"""
from django.core.management.base import BaseCommand
import json
import logging
import re
import time

from main.utils.observability import log_timed, stream_lag_ms

import redis.exceptions

from main.models import BookedAppointment, Notification, User, Address, BulkOrder
from main.utils.booking_image_sync import sync_booking_images
from main.services.bulk_appointments import get_or_create_bulk_appointment_for_slot
from main.services.bulk_notifications import try_send_bulk_client_confirmation_notifications
from main.services.NotificationServices import NotificationService
from main.utils.live_booking import publish_live_booking_update
from main.utils.redis_streams import (
    STREAM_JOB_EVENTS,
    RedisStreamConsumer,
    ensure_consumer_group,
)

logger = logging.getLogger(__name__)

CLIENT_GROUP = "client_group"
CONSUMER_NAME = "subscribe_redis"
MAX_PROCESS_FAILURES = 5
PENDING_ALERT_THRESHOLD = 50


class Command(BaseCommand):
    """
    Long-running Redis consumer for detailer job lifecycle events.

    Updates ``BookedAppointment`` status, syncs images, sends client notifications,
    and handles bulk-order slot references (``BULK123-1`` style).
    """

    help = "Read from Redis stream job_events (job_acceptance, job_started, job_completed) and process messages."

    def __init__(self, *args, **kwargs):
        """Initialize command with a shared ``NotificationService`` instance."""
        super().__init__(*args, **kwargs)
        self.notification_service = NotificationService()

    def _sync_before_booking_images(self, booking, before_images):
        """
        Persist before images from Redis payload; skip empty URLs and duplicates.

        Args:
            booking: Target ``BookedAppointment``.
            before_images: List of dicts with ``image_url`` and optional ``segment``.

        Returns:
            int: Count of newly created ``BookedAppointmentImage`` rows.
        """
        created = sync_booking_images(booking, before_images, "before")
        if created:
            self.stdout.write(
                f"Synced {created} new before image(s) for {booking.booking_reference}"
            )
        return created

    def _sync_after_booking_images(self, booking, after_images):
        """
        Persist after images from Redis payload; skip empty URLs and duplicates.

        Args:
            booking: Target ``BookedAppointment``.
            after_images: List of dicts with ``image_url`` and optional ``segment``.

        Returns:
            int: Count of newly created image rows.
        """
        created = sync_booking_images(booking, after_images, "after")
        if created:
            self.stdout.write(
                f"Synced {created} new after image(s) for {booking.booking_reference}"
            )
        return created

    def handle(self, *args, **options):
        """
        Ensure consumer group exists, drain pending messages, then block-read forever.

        Args:
            *args: Unused positional args.
            **options: Unused options dict.

        Returns:
            None (runs until KeyboardInterrupt).
        """
        ensure_consumer_group(STREAM_JOB_EVENTS, CLIENT_GROUP)
        self.stdout.write(self.style.SUCCESS("Subscribed to job_events stream (client_group)"))

        stream = RedisStreamConsumer(block_ms=5000)
        idle_loops = 0
        try:
            for msg_id, fields in stream.read_pending(STREAM_JOB_EVENTS, CLIENT_GROUP, CONSUMER_NAME):
                self._finish_message(stream, msg_id, fields)
            while True:
                try:
                    entries = stream.read_group_blocking(
                        STREAM_JOB_EVENTS, CLIENT_GROUP, CONSUMER_NAME
                    )
                except redis.exceptions.TimeoutError:
                    continue
                if not entries:
                    idle_loops += 1
                    if idle_loops % 12 == 0:
                        pending = stream.pending_count(STREAM_JOB_EVENTS, CLIENT_GROUP)
                        if pending >= PENDING_ALERT_THRESHOLD:
                            self.stderr.write(
                                f"ALERT: {pending} pending job_events in client_group "
                                "(subscriber may be stuck)"
                            )
                    continue
                idle_loops = 0
                for msg_id, fields in entries:
                    self._finish_message(stream, msg_id, fields)
        except KeyboardInterrupt:
            self.stdout.write(self.style.SUCCESS("subscribe_redis stopped"))
        finally:
            stream.close()

    def _finish_message(self, stream, msg_id, fields):
        """Process one entry; ACK only after success or a dead-letter drop."""
        for attempt in range(1, MAX_PROCESS_FAILURES + 1):
            if self._process_message(msg_id, fields):
                stream.ack(STREAM_JOB_EVENTS, CLIENT_GROUP, msg_id)
                return
            self.stderr.write(f"Retry {attempt}/{MAX_PROCESS_FAILURES} for {msg_id}")
        self.stderr.write(f"Dead-letter ACK for {msg_id} after {MAX_PROCESS_FAILURES} failures")
        stream.ack(STREAM_JOB_EVENTS, CLIENT_GROUP, msg_id)

    def _process_message(self, msg_id, fields):
        """
        Dispatch one Redis stream entry: parse payload, update booking, notify user.

        Returns True when the message is done (ACK). False means retry later.
        """
        started = time.monotonic()
        event = fields.get("event")
        raw = fields.get("payload", "{}")
        request_id = fields.get("request_id")
        booking_reference = fields.get("booking_reference") or ""
        ok = False
        try:
            result = self._dispatch_job_event(msg_id, fields, event, raw)
            ok = bool(result)
            return result
        finally:
            if not request_id or not booking_reference:
                try:
                    payload = json.loads(raw) if raw else {}
                    if isinstance(payload, dict):
                        request_id = request_id or payload.get("request_id")
                        booking_reference = booking_reference or payload.get("booking_reference") or ""
                except Exception:
                    pass
            log_timed(
                "subscribe_redis.process",
                started,
                event=event,
                booking_reference=booking_reference or fields.get("booking_reference"),
                request_id=request_id,
                consumer_lag_ms=stream_lag_ms(msg_id),
                ok=ok,
            )

    def _dispatch_job_event(self, msg_id, fields, event, raw):
        """Apply one job_events payload. Returns True to ACK."""
        if event not in (
            "job_acceptance",
            "job_started",
            "job_completed",
            "job_reassigned",
            "booking_reassigned",
        ):
            return True
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

        if event in ("booking_reassigned", "job_reassigned"):
            self._handle_reassignment(event, data, booking_reference)
            return True

        try:
            booking = BookedAppointment.objects.get(booking_reference=booking_reference)

            if event == "job_acceptance":
                from main.tasks.bookings.events import notify_client_booking_confirmed
                from main.views.payment import assign_detailers_to_booking

                already_assigned = isinstance(booking.assigned_detailers, list) and bool(
                    booking.assigned_detailers
                )

                if isinstance(detailers_list, list) and len(detailers_list) > 0:
                    assign_detailers_to_booking(booking, detailers_list)
                    self.stdout.write(f"Assigned {len(detailers_list)} detailer(s) to booking {booking_reference}")
                elif detailer_data and isinstance(detailer_data, dict) and detailer_data.get("phone"):
                    assign_detailers_to_booking(booking, [detailer_data])
                    self.stdout.write(f"Detailer assigned to booking {booking_reference}")

                if booking.status != "confirmed":
                    booking.status = "confirmed"
                    booking.save(update_fields=["status"])
                    self.stdout.write(f"Updated booking {booking_reference} to confirmed")

                # HTTP/Celery assign is primary. Redis is backup: notify only if we were first.
                if already_assigned:
                    self.stdout.write(
                        f"Skipped duplicate confirmation for {booking_reference} (already assigned)"
                    )
                elif getattr(booking, "bulk_order_id", None):
                    bulk_order = booking.bulk_order
                    sent = try_send_bulk_client_confirmation_notifications(bulk_order, booking)
                    if sent:
                        self.stdout.write(
                            f"Sent bulk client confirmation (once) for {bulk_order.booking_reference}"
                        )
                else:
                    booking.refresh_from_db()
                    notify_client_booking_confirmed(booking)
                publish_live_booking_update(
                    booking.user_id, booking.booking_reference, event, booking.status
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
                    self.send_push_notification(
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
                publish_live_booking_update(
                    booking.user_id, booking.booking_reference, event, booking.status
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
                from main.services.guest import maybe_notify_guest_results_ready

                # Idempotent: emails the guest once when photos or a health check exist.
                maybe_notify_guest_results_ready(booking)
                if not skip_notify:
                    self.send_push_notification(
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
                        "Your appointment has been completed! Thank you for choosing Prisma Car Care.",
                    )
                publish_live_booking_update(
                    booking.user_id, booking.booking_reference, event, booking.status
                )
            return True

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
                                self.send_push_notification(
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
                            from main.services.guest import maybe_notify_guest_results_ready

                            # Idempotent: emails the guest once when photos or a health check exist.
                            maybe_notify_guest_results_ready(booking)
                            if not skip_notify:
                                self.send_push_notification(
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
                                    "Your appointment has been completed! Thank you for choosing Prisma Car Care.",
                                )
                        publish_live_booking_update(
                            booking.user_id, booking.booking_reference, event, booking.status
                        )
                        return True
                else:
                    self.stderr.write(f"Bulk order not found: {base_ref}")
            if event == "job_acceptance" and detailer_data and detailer_data.get("phone"):
                match_accept = re.match(r"^(.+)-(\d+)$", str(booking_reference).strip())
                if match_accept:
                    base_ref = match_accept.group(1).strip()
                    bulk = BulkOrder.objects.filter(booking_reference=base_ref).first()
                    if bulk:
                        from main.models import DetailerProfile
                        from main.utils.phone_utils import normalize_phone

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
                            already_had_team = bool(assigned)
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
                                if not already_had_team:
                                    sent = try_send_bulk_client_confirmation_notifications(
                                        bulk,
                                        BookedAppointment.objects.filter(bulk_order=bulk).first(),
                                    )
                                    if sent:
                                        self.stdout.write(
                                            f"Sent bulk client confirmation (once) for {base_ref}"
                                        )
                        else:
                            self.stderr.write(f"Invalid phone for bulk detailer: {detailer_name}")
                    else:
                        self.stderr.write(f"Bulk order not found: {base_ref}")
                else:
                    self.stderr.write(f"Booking not found: {booking_reference}")
            else:
                self.stderr.write(f"Booking not found: {booking_reference}")
            return True
        except Exception as e:
            self.stderr.write(f"Processing error: {e}")
            return False

    def _handle_reassignment(self, event, data, booking_reference):
        """Silent swap of ``assigned_detailers`` for a booking or every appointment in a bulk order.

        Idempotent — if the new payload already matches what's stored we skip writes. We never
        send customer emails / pushes here; reassignment is purely an operational change for the
        client app's UI to reflect.
        """
        from main.views.payment import assign_detailers_to_booking

        detailers = data.get("detailers") if isinstance(data, dict) else None
        is_bulk = bool(isinstance(data, dict) and data.get("is_bulk"))
        if not isinstance(detailers, list) or not detailers:
            self.stderr.write(f"{event}: empty detailers payload for {booking_reference}")
            return

        def already_applied(current, incoming):
            """True when assigned detailer id lists match (skip redundant Redis replay writes)."""
            if not isinstance(current, list):
                return False
            current_ids = sorted([str((d or {}).get("id") or "") for d in current])
            incoming_ids = sorted([str((d or {}).get("id") or "") for d in incoming])
            return current_ids and current_ids == incoming_ids

        if is_bulk:
            bulk = BulkOrder.objects.filter(booking_reference=booking_reference).first()
            if not bulk:
                self.stderr.write(f"{event}: bulk order {booking_reference} not found")
                return
            if not already_applied(getattr(bulk, "assigned_detailers", []) or [], detailers):
                bulk.assigned_detailers = detailers
                bulk.save(update_fields=["assigned_detailers"])
                self.stdout.write(f"{event}: updated bulk order {booking_reference}")
            for appt in BookedAppointment.objects.filter(bulk_order=bulk):
                if already_applied(appt.assigned_detailers or [], detailers):
                    continue
                assign_detailers_to_booking(appt, detailers)
            if bulk.user_id:
                publish_live_booking_update(
                    bulk.user_id, booking_reference, event, "confirmed"
                )
            return

        booking = BookedAppointment.objects.filter(booking_reference=booking_reference).first()
        if not booking:
            self.stderr.write(f"{event}: booking {booking_reference} not found")
            return
        if already_applied(booking.assigned_detailers or [], detailers):
            self.stdout.write(f"{event}: {booking_reference} already in sync, skipping")
            return
        assign_detailers_to_booking(booking, detailers)
        self.stdout.write(f"{event}: updated booking {booking_reference}")
        publish_live_booking_update(
            booking.user_id, booking.booking_reference, event, booking.status
        )

    # Create a notification for the user   
    def create_notification(self, user, title, type, status, message):
        """
        Create an in-app ``Notification`` for the user.

        Args:
            user: Recipient ``User``.
            title: Notification heading.
            type: App routing type string.
            status: UI status (success, info, etc.).
            message: Body text.

        Returns:
            bool: True when ORM create succeeds.
        """
        try:
            Notification.objects.create(user=user, title=title, type=type, status=status, message=message)
            return True
        except Exception as e:
            self.stderr.write(f"Failed to create notification: {e}")
            return False


    def send_push_notification(self, user_id, title, message, type):
        """
        Send an Expo push to a registered user.

        Guests have no app install; skip so job-completed Redis events do not
        treat a missing token as an error.

        Args:
            user_id: Recipient ``User`` id.
            title: Push title.
            message: Push body.
            type: Payload passed to ``_normalize_push_data`` (string or dict).
        """
        try:
            from main.models import User
            from main.tasks.notifications.push import _normalize_push_data
            from exponent_server_sdk import PushClient, PushMessage

            user = User.objects.filter(id=user_id).first()
            if user is None:
                return f"Push notification not sent: User {user_id} not found"
            if getattr(user, "is_guest", False):
                return "Push notification skipped: guest user"

            if not user.notification_token:
                return f"Push notification not sent: User {user_id} has no notification token"

            if not user.allow_push_notifications:
                return f"Push notification not sent: User {user_id} has disabled push notifications"

            push_data = _normalize_push_data(type, title, message)
            push_client = PushClient()
            response = push_client.publish(
                PushMessage(
                    to=user.notification_token,
                    title=title,
                    body=message,
                    data=push_data,
                )
            )

            # Validate ticket when the SDK exposes validate_response.
            if response is not None:
                validate = getattr(response, "validate_response", None)
                if callable(validate):
                    validate()

            if response and hasattr(response, "data") and response.data:
                return f"Push notification sent successfully to user {user_id}"
            return f"Push notification failed for user {user_id}: Invalid response"

        except Exception as e:
            error_msg = f"Failed to send push notification to user {user_id}: {str(e)}"
            return error_msg


    def get_currency_symbol(self, user_id):
        """
        Return £ or € based on the user's primary address country.

        Args:
            user_id: ``User`` primary key.

        Returns:
            str: Currency symbol (defaults to €).
        """
        user = User.objects.get(id=user_id)
        address = Address.objects.filter(user=user).first()
        if address and address.country and (address.country == "United Kingdom" or address.country.lower() == "united kingdom"):
            return "£"
        if address and address.country and (address.country == "Ireland" or address.country.lower() == "ireland"):
            return "€"
        return "€"
