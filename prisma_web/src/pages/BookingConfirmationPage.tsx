import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import {
  CONFIRMATION_STORAGE_KEY,
  readConfirmationSnapshot,
  waitForPaymentConfirmation,
} from "../lib/bookingCheckout";
import { formatClock, formatDate, formatMoney } from "../lib/format";
import { markPromotionUsed } from "../store/api/eventApi";
import type { BookingConfirmationSnapshot } from "../types/booking";

type LocationState = Partial<BookingConfirmationSnapshot> | null;

export default function BookingConfirmationPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const [snapshot, setSnapshot] = useState<BookingConfirmationSnapshot | null>(() => {
    const fromState = (location.state as LocationState) || null;
    const stored = readConfirmationSnapshot();
    if (fromState?.bookingReference) {
      return { ...(stored || ({} as BookingConfirmationSnapshot)), ...fromState };
    }
    return stored;
  });

  const intentId = params.get("payment_intent");
  const redirectStatus = params.get("redirect_status");
  const [status, setStatus] = useState<"ready" | "confirming" | "failed">(
    intentId && redirectStatus !== "failed" ? "confirming" : "ready",
  );
  const [error, setError] = useState<string | null>(null);

  const promoId = useMemo(() => sessionStorage.getItem("prisma.promotionId"), []);

  useEffect(() => {
    if (!intentId || redirectStatus === "failed") return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await waitForPaymentConfirmation(intentId);
        if (cancelled) return;
        if (result.booking_reference) {
          setSnapshot((prev) => {
            const next = prev
              ? { ...prev, bookingReference: result.booking_reference as string }
              : prev;
            if (next) sessionStorage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(next));
            return next;
          });
        }
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setStatus("failed");
          setError(err instanceof Error ? err.message : "Could not confirm payment.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intentId, redirectStatus]);

  useEffect(() => {
    const ref = snapshot?.bookingReference;
    if (!promoId || !ref || status !== "ready") return;
    void markPromotionUsed(promoId, ref).catch(() => undefined);
  }, [promoId, snapshot?.bookingReference, status]);

  return (
    <AppShell>
      <section className="welcome">
        <p className="kicker">Booked</p>
        <h1 className="page-title">
          {status === "failed"
            ? "Payment needs attention"
            : status === "confirming"
              ? "Confirming payment"
              : snapshot?.invoiceLater
                ? "Order confirmed"
                : "You're booked"}
        </h1>
        <p className="lede">
          {status === "confirming"
            ? "Waiting for Stripe to confirm. This usually takes a few seconds."
            : status === "failed"
              ? error || "If you were charged, check Dashboard or contact support."
              : snapshot?.invoiceLater
                ? "A Stripe invoice has been emailed. Your order will appear on your dashboard shortly."
                : "Your booking will appear on your dashboard shortly."}
        </p>
      </section>

      {status === "failed" && error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {snapshot ? (
        <section className="card">
          <h2>
            {snapshot.invoiceLater
              ? "Invoice sent"
              : snapshot.free
                ? "Complimentary booking"
                : "Payment received"}
          </h2>
          <dl className="meta">
            <div>
              <dt>Reference</dt>
              <dd>
                <code>{snapshot.bookingReference}</code>
              </dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>
                {snapshot.serviceName} · {snapshot.valetName}
              </dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {formatDate(snapshot.dateIso)} · {formatClock(snapshot.timeSlot)}
                {snapshot.endTime ? `–${formatClock(snapshot.endTime)}` : ""}
              </dd>
            </div>
            <div>
              <dt>{snapshot.numberOfVehicles ? "Vehicles" : "Vehicle"}</dt>
              <dd>{snapshot.vehicleLine}</dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>{snapshot.addressLine}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatMoney(snapshot.total)}</dd>
            </div>
          </dl>
          <div className="card-actions">
            <Link to="/dashboard" className="btn btn-primary">
              View dashboard
            </Link>
            <Link to="/book" className="btn btn-secondary">
              Book another
            </Link>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>No booking details</h2>
          <p className="muted">If payment succeeded, it should still appear on your dashboard.</p>
          <div className="card-actions">
            <Link to="/dashboard" className="btn btn-primary">
              Go to dashboard
            </Link>
          </div>
        </section>
      )}
    </AppShell>
  );
}
