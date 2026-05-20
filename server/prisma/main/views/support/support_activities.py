"""
Support activity feed: recent domain events derived from live models (no separate activity store).

**Auth:** ``SupportPermissionAccess`` (internal key).

**Contract:** ``get_activity_feed`` returns a time-ordered list of rows shaped for the support app
``ActivityInterface``. Query params:

- ``limit`` — max rows after merge (default 50, cap 100).
- ``since`` — optional ISO 8601 datetime; rows are included only if their event time is >= ``since``.
  If omitted, a default lookback of 30 days applies (event time <= now).

Per-type queries fetch at most ``limit`` rows; results are merged, sorted by timestamp descending,
then truncated to ``limit``.

Includes booking lifecycle (cancelled; non-cancel updates after a short grace period from
``created_at`` are titled “Booking rescheduled” but may include other substantive booking edits),
branches, garage vehicles, fleet vehicles, transfer requests, and partner payout requests, in addition
to the original “created” slices.

**detailer**-type activities are not emitted here (detailer API merge is a follow-up).
"""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal

from django.db.models import F
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import (
    BookedAppointment,
    Branch,
    Fleet,
    FleetSubscription,
    FleetVehicle,
    Partner,
    PartnerPayoutRequest,
    Vehicle,
    VehicleTransfer,
)
from main.views.support.support_bookings import _fmt_appointment, _service_description
from main.views.support.support_dashboard import SupportDashboardView
from main.views.support.support_permission_access import SupportPermissionAccess

logger = logging.getLogger(__name__)

DEFAULT_LOOKBACK_DAYS = 30
MAX_LIMIT = 100
DEFAULT_LIMIT = 50
# Ignore booking.updated_at within this delta of created_at (post-create saves, immediate edits).
BOOKING_UPDATE_MIN_AGE = timedelta(minutes=2)


def _parse_since_param(raw: str | None):
    """
    Parse optional ``since`` query param as timezone-aware datetime.

    Args:
        raw: ISO 8601 string from query params, or empty.

    Returns:
        Aware ``datetime`` or ``None`` if missing/invalid.
    """
    if not raw or not str(raw).strip():
        return None
    dt = parse_datetime(str(raw).strip())
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _activity_row(*, id_str: str, activity_type: str, title: str, summary: str, ts, entity_id):
    """
    Build one activity feed row for the support app ``ActivityInterface``.

    Args:
        id_str: Stable unique id (e.g. ``booking:{uuid}``).
        activity_type: Category key (customer, booking, fleet, …).
        title: Short headline.
        summary: One-line detail.
        ts: Event timestamp (serialized to ISO).
        entity_id: Related entity pk for deep links, or ``None``.

    Returns:
        Dict with ``id``, ``activity_type``, ``title``, ``summary``, ``timestamp``, ``entity_id``.
    """
    return {
        "id": id_str,
        "activity_type": activity_type,
        "title": title,
        "summary": summary,
        "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
        "entity_id": str(entity_id) if entity_id is not None else None,
    }


def _booking_summary_line(b: BookedAppointment) -> str:
    """One-line booking context for activity summaries (vehicle, slot, service, status)."""
    vehicle_snippet = ""
    if b.vehicle_id and b.vehicle:
        vehicle_snippet = f"{b.vehicle.make or ''} {b.vehicle.model or ''}".strip()
    svc = (_service_description(b) or "")[:120]
    appt = _fmt_appointment(b)
    status_label = b.get_status_display()
    parts = [x for x in (vehicle_snippet, appt, svc, status_label) if x]
    return " · ".join(parts) if parts else (b.booking_reference or str(b.id))


def _vehicle_snippet(vehicle: Vehicle | None) -> str:
    """Compact make/model + registration label for vehicle-related activities."""
    if vehicle is None:
        return ""
    reg = (vehicle.registration_number or "").strip()
    mm = f"{vehicle.make or ''} {vehicle.model or ''}".strip()
    if reg and mm:
        return f"{mm} ({reg})"
    return reg or mm or str(vehicle.id)


class SupportActivitiesView(APIView):
    """GET ``get_activity_feed`` only."""

    permission_classes = [SupportPermissionAccess]
    action_handler = {"get_activity_feed": "_get_activity_feed"}

    def get(self, request, *args, **kwargs):
        """
        Dispatch GET by URL ``action`` (``get_activity_feed`` only).

        Returns:
            DRF ``Response`` from the handler, or 400 for unknown actions.
        """
        action = kwargs.get("action")
        if action not in self.action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        return getattr(self, self.action_handler[action])(request)

    def _get_activity_feed(self, request):
        """
        Merge recent domain events into a single time-ordered activity list.

        Query params: ``limit`` (default 50, max 100), optional ``since`` (ISO datetime).

        Returns:
            ``{'data': {'activities': [...], 'meta': {...}}}``; 400 if ``since`` is invalid.
        """
        try:
            limit = int(request.query_params.get("limit") or DEFAULT_LIMIT)
        except (TypeError, ValueError):
            limit = DEFAULT_LIMIT
        limit = max(1, min(limit, MAX_LIMIT))

        raw_since = request.query_params.get("since")
        if raw_since and str(raw_since).strip():
            since = _parse_since_param(raw_since)
            if since is None:
                return Response(
                    {"error": "Invalid since", "detail": "Use ISO 8601 datetime"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            window_start = since
        else:
            # Default window: last N days when caller does not pin ``since``.
            window_start = timezone.now() - timedelta(days=DEFAULT_LOOKBACK_DAYS)

        now = timezone.now()
        rows: list[dict] = []

        user_qs = (
            SupportDashboardView._client_users_qs()
            .filter(created_at__gte=window_start, created_at__lte=now)
            .order_by("-created_at")[:limit]
        )
        for u in user_qs:
            rows.append(
                _activity_row(
                    id_str=f"customer:{u.id}",
                    activity_type="customer",
                    title="New account",
                    summary=f"{u.name} · {u.email}",
                    ts=u.created_at,
                    entity_id=u.id,
                )
            )

        booking_qs = (
            BookedAppointment.objects.select_related("user", "vehicle", "service_type")
            .filter(created_at__gte=window_start, created_at__lte=now)
            .order_by("-created_at")[:limit]
        )
        for b in booking_qs:
            rows.append(
                _activity_row(
                    id_str=f"booking:{b.id}",
                    activity_type="booking",
                    title="New booking",
                    summary=_booking_summary_line(b),
                    ts=b.created_at,
                    entity_id=b.id,
                )
            )

        booking_cancel_qs = (
            BookedAppointment.objects.select_related("user", "vehicle", "service_type")
            .filter(
                status="cancelled",
                updated_at__gte=window_start,
                updated_at__lte=now,
            )
            .order_by("-updated_at")[:limit]
        )
        for b in booking_cancel_qs:
            rows.append(
                _activity_row(
                    id_str=f"booking:cancelled:{b.id}",
                    activity_type="booking",
                    title="Booking cancelled",
                    summary=_booking_summary_line(b),
                    ts=b.updated_at,
                    entity_id=b.id,
                )
            )

        booking_update_qs = (
            BookedAppointment.objects.select_related("user", "vehicle", "service_type")
            .filter(
                updated_at__gte=window_start,
                updated_at__lte=now,
                updated_at__gt=F("created_at") + BOOKING_UPDATE_MIN_AGE,
            )
            .exclude(status="cancelled")
            .order_by("-updated_at")[:limit]
        )
        for b in booking_update_qs:
            rows.append(
                _activity_row(
                    id_str=f"booking:updated:{b.id}",
                    activity_type="booking",
                    title="Booking rescheduled",
                    summary=_booking_summary_line(b),
                    ts=b.updated_at,
                    entity_id=b.id,
                )
            )

        fleet_qs = (
            Fleet.objects.select_related("owner")
            .filter(created_at__gte=window_start, created_at__lte=now)
            .order_by("-created_at")[:limit]
        )
        for f in fleet_qs:
            owner_name = f.owner.name if f.owner_id else ""
            rows.append(
                _activity_row(
                    id_str=f"fleet:{f.id}",
                    activity_type="fleet",
                    title="New fleet",
                    summary=f"{f.name}" + (f" · {owner_name}" if owner_name else ""),
                    ts=f.created_at,
                    entity_id=f.id,
                )
            )

        partner_qs = (
            Partner.objects.select_related("user")
            .filter(created_at__gte=window_start, created_at__lte=now)
            .order_by("-created_at")[:limit]
        )
        for p in partner_qs:
            rows.append(
                _activity_row(
                    id_str=f"partner:{p.id}",
                    activity_type="partner",
                    title="New partner",
                    summary=f"{p.business_name} · {p.get_partner_type_display()}",
                    ts=p.created_at,
                    entity_id=p.id,
                )
            )

        sub_qs = (
            FleetSubscription.objects.select_related("fleet", "plan", "plan__tier")
            .filter(start_date__gte=window_start, start_date__lte=now)
            .order_by("-start_date")[:limit]
        )
        for s in sub_qs:
            fleet_name = s.fleet.name if s.fleet_id else ""
            tier_name = ""
            if s.plan_id and s.plan and s.plan.tier_id:
                tier_name = s.plan.tier.name or ""
            summary = " · ".join(x for x in (fleet_name, tier_name, s.get_status_display()) if x)
            rows.append(
                _activity_row(
                    id_str=f"subscription:{s.id}",
                    activity_type="subscription",
                    title="Subscription started",
                    summary=summary or str(s.id),
                    ts=s.start_date,
                    entity_id=s.fleet_id,
                )
            )

        branch_qs = (
            Branch.objects.select_related("fleet")
            .filter(created_at__gte=window_start, created_at__lte=now)
            .order_by("-created_at")[:limit]
        )
        for br in branch_qs:
            fleet_name = br.fleet.name if br.fleet_id and br.fleet else ""
            label = (br.name or "").strip() or "Branch"
            summary = " · ".join(x for x in (label, fleet_name) if x)
            rows.append(
                _activity_row(
                    id_str=f"branch:{br.id}",
                    activity_type="branch",
                    title="Branch created",
                    summary=summary or str(br.id),
                    ts=br.created_at,
                    entity_id=br.fleet_id,
                )
            )

        vehicle_qs = (
            Vehicle.objects.filter(created_at__gte=window_start, created_at__lte=now)
            .order_by("-created_at")[:limit]
        )
        for v in vehicle_qs:
            owner = v.get_current_owner()
            summary = _vehicle_snippet(v)
            rows.append(
                _activity_row(
                    id_str=f"vehicle:{v.id}",
                    activity_type="vehicle",
                    title="Vehicle added",
                    summary=summary,
                    ts=v.created_at,
                    entity_id=owner.id if owner else None,
                )
            )

        fleet_vehicle_qs = (
            FleetVehicle.objects.select_related("fleet", "vehicle")
            .filter(added_at__gte=window_start, added_at__lte=now)
            .order_by("-added_at")[:limit]
        )
        for fv in fleet_vehicle_qs:
            fleet_name = fv.fleet.name if fv.fleet_id and fv.fleet else ""
            v_snip = _vehicle_snippet(fv.vehicle) if fv.vehicle_id else ""
            summary = " · ".join(x for x in (v_snip, fleet_name) if x)
            rows.append(
                _activity_row(
                    id_str=f"fleet_vehicle:{fv.id}",
                    activity_type="fleet_vehicle",
                    title="Fleet vehicle added",
                    summary=summary or str(fv.id),
                    ts=fv.added_at,
                    entity_id=fv.fleet_id,
                )
            )

        transfer_qs = (
            VehicleTransfer.objects.select_related("vehicle", "from_owner", "to_owner")
            .filter(requested_at__gte=window_start, requested_at__lte=now)
            .order_by("-requested_at")[:limit]
        )
        for t in transfer_qs:
            reg = _vehicle_snippet(t.vehicle)
            from_n = t.from_owner.name if t.from_owner_id else ""
            to_n = t.to_owner.name if t.to_owner_id else ""
            route = f"{from_n} → {to_n}" if from_n and to_n else (from_n or to_n)
            summary = " · ".join(x for x in (reg, route, t.get_status_display()) if x)
            rows.append(
                _activity_row(
                    id_str=f"transfer:{t.id}",
                    activity_type="transfer",
                    title="Vehicle transfer requested",
                    summary=summary or str(t.id),
                    ts=t.requested_at,
                    entity_id=t.to_owner_id,
                )
            )

        payout_qs = (
            PartnerPayoutRequest.objects.select_related("partner")
            .filter(requested_at__gte=window_start, requested_at__lte=now)
            .order_by("-requested_at")[:limit]
        )
        for pr in payout_qs:
            biz = pr.partner.business_name if pr.partner_id else ""
            amt = pr.amount_requested
            if isinstance(amt, Decimal):
                amt_s = format(amt, "f")
            else:
                amt_s = str(amt)
            summary = " · ".join(
                x for x in (biz, amt_s, pr.get_status_display()) if x
            )
            rows.append(
                _activity_row(
                    id_str=f"payout_request:{pr.id}",
                    activity_type="payout",
                    title="Partner payout requested",
                    summary=summary or str(pr.id),
                    ts=pr.requested_at,
                    entity_id=pr.partner_id,
                )
            )

        # Global sort after per-source caps; each source may contribute up to ``limit`` rows.
        rows.sort(key=lambda r: r["timestamp"], reverse=True)
        trimmed = rows[:limit]

        logger.info(
            "Support activity feed: limit=%s window_start=%s merged=%s returned=%s",
            limit,
            window_start.isoformat(),
            len(rows),
            len(trimmed),
        )

        return Response(
            {
                "data": {
                    "activities": trimmed,
                    "meta": {
                        "limit": limit,
                        "lookback_days": None if raw_since and str(raw_since).strip() else DEFAULT_LOOKBACK_DAYS,
                    },
                },
            }
        )
