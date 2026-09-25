"""
Management command: python manage.py strip_booking_image_url_signatures

Strip GCS V4 (and other) query signatures from stored BookedAppointmentImage
image_url values so the image proxy can re-authenticate at request time.
"""
from django.core.management.base import BaseCommand

from main.models import BookedAppointmentImage
from main.utils.booking_image_sync import canonicalize_booking_image_url


class Command(BaseCommand):
    help = "Strip query signatures from BookedAppointmentImage.image_url rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--booking-reference",
            dest="booking_reference",
            help="Only update images for this booking reference.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report how many rows would change without writing.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Rows to bulk_update per batch (default 500).",
        )

    def handle(self, *args, **options):
        booking_reference = (options.get("booking_reference") or "").strip()
        dry_run = bool(options.get("dry_run"))
        batch_size = max(1, int(options.get("batch_size") or 500))

        qs = BookedAppointmentImage.objects.all().order_by("created_at")
        if booking_reference:
            qs = qs.filter(booking__booking_reference=booking_reference)

        # Only rows that look signed / have query or fragment noise.
        qs = qs.filter(image_url__contains="?")

        scanned = 0
        updated = 0
        batch: list[BookedAppointmentImage] = []

        for row in qs.iterator(chunk_size=batch_size):
            scanned += 1
            canonical = canonicalize_booking_image_url(row.image_url)
            if not canonical or canonical == row.image_url:
                continue

            if dry_run:
                updated += 1
                if updated <= 20:
                    self.stdout.write(
                        f"{row.booking_id} {row.id}: "
                        f"{row.image_url[:80]}… → {canonical[:80]}"
                    )
                continue

            row.image_url = canonical
            batch.append(row)
            if len(batch) >= batch_size:
                BookedAppointmentImage.objects.bulk_update(batch, ["image_url"])
                updated += len(batch)
                batch = []

        if not dry_run and batch:
            BookedAppointmentImage.objects.bulk_update(batch, ["image_url"])
            updated += len(batch)

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry run: would update {updated} of {scanned} signed URL row(s)"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Updated {updated} of {scanned} signed URL row(s)"
                )
            )
