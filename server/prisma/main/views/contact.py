"""
Public marketing-site contact form.

POST ``contact/submit/`` emails support with the visitor's message.
AllowAny + IP rate limit to reduce spam.
"""
from __future__ import annotations

import re

from django.conf import settings
from django.core.mail import EmailMessage
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from main.utils.ratelimit_helpers import rate_limit_json_response

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_SUBJECT = 200
MAX_MESSAGE = 5000
MAX_NAME = 120


def _support_inbox() -> str:
    return (
        getattr(settings, "SUPPORT_INBOUND_EMAIL", None)
        or "support@prismavalet.com"
    )


@method_decorator(
    ratelimit(key="ip", rate="5/m", method="POST", block=rate_limit_json_response),
    name="post",
)
class ContactView(APIView):
    """
    Public contact endpoint for prismahome / marketing site.

    ``POST contact/submit/`` body:
      name, email, subject, message
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    action_handlers = {
        "submit": "submit",
    }

    def post(self, request, *args, **kwargs):
        action = kwargs.get("action")
        if action not in self.action_handlers:
            return Response(
                {"error": "Invalid action"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def submit(self, request):
        data = request.data if hasattr(request, "data") else {}
        name = str(data.get("name") or "").strip()
        email = str(data.get("email") or "").strip()
        subject = str(data.get("subject") or "").strip()
        message = str(data.get("message") or data.get("description") or "").strip()

        errors = {}
        if not name or len(name) > MAX_NAME:
            errors["name"] = "Please enter your name."
        if not email or not EMAIL_RE.match(email) or len(email) > 254:
            errors["email"] = "Please enter a valid email address."
        if not subject or len(subject) > MAX_SUBJECT:
            errors["subject"] = "Please enter a subject."
        if not message or len(message) > MAX_MESSAGE:
            errors["message"] = "Please enter a message."

        if errors:
            return Response(
                {"error": "Validation failed", "fields": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inbox = _support_inbox()
        mail_subject = f"[Prisma website] {subject}"
        body = (
            f"New message from the Prisma website contact form.\n\n"
            f"Name: {name}\n"
            f"Email: {email}\n"
            f"Subject: {subject}\n\n"
            f"Message:\n{message}\n"
        )

        try:
            email_msg = EmailMessage(
                subject=mail_subject,
                body=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[inbox],
                reply_to=[email],
            )
            email_msg.send(fail_silently=False)
        except Exception:
            return Response(
                {
                    "error": "Unable to send message right now. Please try again later.",
                    "code": "email_failed",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {"ok": True, "detail": "Message sent. We'll get back to you soon."},
            status=status.HTTP_200_OK,
        )
