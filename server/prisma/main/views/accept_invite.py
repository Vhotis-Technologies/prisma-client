"""
Browser HTML flow for accepting a branch-admin invite and setting a password.

GET shows the form; POST sets the password. Public (AllowAny), rate-limited.
"""
from django.http import JsonResponse
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from main.services.invite_services import (
    consume_invite,
    get_valid_invite,
    purpose_label,
    validate_invite_password,
)
from main.utils.legal_urls import email_legal_context


def _invite_rate_limit_block(request):
    """429 JSON when accept-invite POST rate is exceeded."""
    return JsonResponse({"detail": "Too many requests. Try again later."}, status=429)


def _wants_json(request):
    """True when the client prefers JSON over HTML (SPA axios vs browser navigation)."""
    accept = (request.headers.get("Accept") or "").lower()
    if "application/json" not in accept:
        return False
    html_pos = accept.find("text/html")
    json_pos = accept.find("application/json")
    return html_pos == -1 or json_pos < html_pos


@method_decorator(
    ratelimit(key="ip", rate="5/m", method="POST", block=_invite_rate_limit_block),
    name="post",
)
class AcceptInviteView(APIView):
    """GET/POST ``/api/v1/auth/accept-invite/?token=...``."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def _context_for_invite(self, invite, raw_token: str, error: str | None = None):
        user = invite.user
        return email_legal_context(
            token=raw_token,
            user_email=user.email,
            user_name=getattr(user, "name", "") or "",
            purpose=invite.purpose,
            purpose_label=purpose_label(invite.purpose),
            expires_at=invite.expires_at,
            error=error,
        )

    def get(self, request):
        """Render the set-password form, or return JSON validity for the SPA."""
        raw_token = (request.GET.get("token") or "").strip()
        if _wants_json(request):
            if not raw_token:
                return Response(
                    {"valid": False, "error": "This invitation link is missing a token."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            invite = get_valid_invite(raw_token)
            if invite is None:
                return Response(
                    {
                        "valid": False,
                        "error": (
                            "This invitation link is invalid or has expired. "
                            "Ask your fleet owner to resend the invite."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {
                    "valid": True,
                    "user_email": invite.user.email,
                    "purpose_label": purpose_label(invite.purpose),
                },
                status=status.HTTP_200_OK,
            )

        if not raw_token:
            return render(
                request,
                "accept_invite_invalid.html",
                email_legal_context(error="This invitation link is missing a token."),
            )

        invite = get_valid_invite(raw_token)
        if invite is None:
            return render(
                request,
                "accept_invite_invalid.html",
                email_legal_context(
                    error=(
                        "This invitation link is invalid or has expired. "
                        "Ask your fleet owner to resend the invite."
                    ),
                ),
            )

        return render(
            request,
            "accept_invite_form.html",
            self._context_for_invite(invite, raw_token),
        )

    def post(self, request):
        """Validate passwords, consume the invite, and return JWT JSON or HTML success."""
        raw_token = (
            (
                request.POST.get("token")
                or request.data.get("token")
                or request.GET.get("token")
                or ""
            )
            .strip()
        )
        new_password = (request.POST.get("password") or request.data.get("password") or "").strip()
        confirm_password = (
            request.POST.get("confirm_password") or request.data.get("confirm_password") or ""
        ).strip()
        json_mode = _wants_json(request)

        invite = get_valid_invite(raw_token) if raw_token else None
        if invite is None:
            message = (
                "This invitation link is invalid or has expired. "
                "Ask your fleet owner to resend the invite."
            )
            if json_mode:
                return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
            return render(
                request,
                "accept_invite_invalid.html",
                email_legal_context(error=message),
            )

        if not new_password or (not json_mode and not confirm_password):
            error = "All fields are required"
        elif confirm_password and new_password != confirm_password:
            error = "Passwords do not match"
        else:
            error = None
        if error:
            if json_mode:
                return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
            return render(
                request,
                "accept_invite_form.html",
                self._context_for_invite(invite, raw_token, error=error),
            )

        password_error = validate_invite_password(new_password)
        if password_error:
            if json_mode:
                return Response({"error": password_error}, status=status.HTTP_400_BAD_REQUEST)
            return render(
                request,
                "accept_invite_form.html",
                self._context_for_invite(invite, raw_token, error=password_error),
            )

        consume_invite(invite, new_password)

        if json_mode:
            refresh = RefreshToken.for_user(invite.user)
            return Response(
                {
                    "message": "Invitation accepted",
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                },
                status=status.HTTP_200_OK,
            )

        return render(
            request,
            "accept_invite_success.html",
            email_legal_context(
                user_email=invite.user.email,
                user_name=getattr(invite.user, "name", "") or "",
                purpose_label=purpose_label(invite.purpose),
            ),
        )
