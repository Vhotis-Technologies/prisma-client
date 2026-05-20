"""
Support tickets mirrored on the client server for the consumer app.

Tickets are created locally and synced with the support platform via Redis;
``support_ticket_id`` links to the canonical row on the support server.
"""
import uuid
from django.db import models
from django.conf import settings


class Ticket(models.Model):
    """Support ticket created by the client user. Synced from support via Redis."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("in_progress", "In progress"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="support_tickets",
    )
    booking_reference = models.CharField(max_length=64, blank=True, null=True)
    issue_type = models.CharField(max_length=32)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    ticket_code = models.CharField(max_length=8, unique=True, db_index=True)
    support_ticket_id = models.CharField(max_length=64, blank=True, null=True)
    resolution_email_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        """Generate a unique human-readable ``ticket_code`` before first persist."""
        if not self.ticket_code:
            from main.utils.ticket_code import generate_unique_ticket_code

            self.ticket_code = generate_unique_ticket_code()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Ticket {self.id} ({self.status})"


class TicketUpdate(models.Model):
    """Timeline entry for status changes and support replies."""

    KIND_CHOICES = [
        ("status_change", "Status change"),
        ("reply", "Reply"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="updates",
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    status_to = models.CharField(max_length=20, blank=True, null=True)
    message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.get_kind_display()} for {self.ticket_id}"
