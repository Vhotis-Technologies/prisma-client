"""
Management command: python manage.py dedupe_booking_images

Remove duplicate BookedAppointmentImage rows caused by repeated Redis syncs
with different URL formats for the same storage file.
"""
from django.core.management.base import BaseCommand

from main.models import BookedAppointment
from main.utils.booking_image_sync import dedupe_booking_images_for_booking


class Command(BaseCommand):
    help = "Remove duplicate booking job images (same file, different URL format)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--booking-reference",
            dest="booking_reference",
            help="Only dedupe images for this booking reference.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report how many rows would be removed without deleting.",
        )

    def handle(self, *args, **options):
        booking_reference = (options.get("booking_reference") or "").strip()
        dry_run = bool(options.get("dry_run"))

        qs = BookedAppointment.objects.all().order_by("booking_date")
        if booking_reference:
            qs = qs.filter(booking_reference=booking_reference)

        total_deleted = 0
        affected = 0

        for booking in qs.iterator():
            if dry_run:
                before = booking.job_images.count()
                # Simulate without deleting — count extras per normalized key
                from collections import defaultdict

                from main.utils.booking_image_sync import normalize_booking_image_url

                groups: dict[tuple[str, str, str], int] = defaultdict(int)
                for row in booking.job_images.all():
                    norm = normalize_booking_image_url(row.image_url)
                    if not norm:
                        continue
                    key = (row.image_type, row.segment or "exterior", norm)
                    groups[key] += 1
                would_delete = sum(max(0, count - 1) for count in groups.values())
                if would_delete:
                    affected += 1
                    total_deleted += would_delete
                    self.stdout.write(
                        f"{booking.booking_reference}: would remove {would_delete} "
                        f"duplicate(s) (currently {before} image rows)"
                    )
            else:
                deleted = dedupe_booking_images_for_booking(booking)
                if deleted:
                    affected += 1
                    total_deleted += deleted
                    self.stdout.write(
                        f"{booking.booking_reference}: removed {deleted} duplicate(s)"
                    )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry run: {total_deleted} duplicate row(s) across {affected} booking(s)"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Removed {total_deleted} duplicate row(s) across {affected} booking(s)"
                )
            )
