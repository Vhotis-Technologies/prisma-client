import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import GuestBookShell from "../components/GuestBookShell";
import {
  CONFIRMATION_STORAGE_KEY,
  readConfirmationSnapshot,
} from "../lib/bookingCheckout";
import { formatClock, formatDate, formatMoney } from "../lib/format";
import { confirmGuestPaymentIntent } from "../store/api/guestApi";
import type { BookingConfirmationSnapshot } from "../types/booking";

type LocationState = Partial<BookingConfirmationSnapshot> | null;

/**
 * Holding page after guest pay. If Stripe 3DS returns with `payment_intent`,
 * poll confirm until the webhook creates the booking (or time out).
 */
export default function GuestBookConfirmationPage() {
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

  useEffect(() => {
    if (!intentId || redirectStatus === "failed") return;
    let cancelled = false;
    void (async () => {
      try {
        const started = Date.now();
        let reference = snapshot?.bookingReference || "";
        while (Date.now() - started < 60000) {
          const result = await confirmGuestPaymentIntent(intentId);
          if (cancelled) return;
          if (result.status === "refunded_slot_unavailable") {
            throw new Error(
              result.message ||
                "This time slot was no longer available. Your payment has been refunded.",
            );
          }
          if (result.booking_reference) reference = result.booking_reference;
          if (result.confirmed) {
            setSnapshot((prev) => {
              const next = prev
                ? { ...prev, bookingReference: reference || prev.bookingReference }
                : prev;
              if (next) sessionStorage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(next));
              return next;
            });
            setStatus("ready");
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        setStatus("failed");
        setError("Payment is still confirming. Check the email we sent if you were charged.");
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
  }, [intentId, redirectStatus, snapshot?.bookingReference]);

  return (
    <GuestBookShell>
      <section className="welcome">
        <p className="kicker">Guest booking</p>
        <h1 className="page-title">
          {status === "failed"
            ? "Payment needs attention"
            : status === "confirming"
              ? "Confirming payment"
              : "You're booked"}
        </h1>
        <p className="lede">
          {status === "confirming"
            ? "Waiting for Stripe to confirm. This usually takes a few seconds."
            : status === "failed"
              ? error || "If you were charged, keep your booking reference and contact support."
              : "We emailed a link so you can check this booking. After the job, photos and notes will appear on that page."}
        </p>
      </section>

      {status === "failed" && error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {snapshot ? (
        <section className="card">
          <h2>Payment received</h2>
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
              <dt>Vehicle</dt>
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
            <Link to="/book/guest" className="btn btn-primary">
              Book another
            </Link>
          </div>
          <p className="muted">
            We emailed a link to view this booking. Use that same link to create a password so this
            vehicle stays in your garage.
          </p>
        </section>
      ) : null}
    </GuestBookShell>
  );
}
