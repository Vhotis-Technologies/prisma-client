import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth, authErrorMessage } from "../auth/AuthProvider";
import PaymentForm from "./PaymentForm";
import StripeCheckout from "./StripeCheckout";
import { formatMoney } from "../lib/format";
import { hasStripeKey, stripePromise } from "../lib/stripe";
import { submitReview } from "../store/api/dashboardApi";
import { createTipPaymentSheet, waitForPaymentConfirmation } from "../store/api/paymentApi";

const MAX_COMMENT_LEN = 1000;
const TIP_PRESETS = [0, 2, 5, 10] as const;
const TIP_MIN = 1;
const TIP_MAX = 200;

const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Great",
  5: "Excellent",
};

export type ReviewDialogTarget = {
  booking_reference: string;
  service_type?: string | null;
  vehicle_label?: string | null;
  detailer_name?: string | null;
};

type ReviewDialogProps = {
  open: boolean;
  target: ReviewDialogTarget | null;
  onClose: () => void;
  onSubmitted: (bookingReference: string, rating: number) => void;
};

type Phase = "form" | "paying" | "done";

export default function ReviewDialog({ open, target, onClose, onSubmitted }: ReviewDialogProps) {
  const { user } = useAuth();
  const country = user?.address?.country;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tipPreset, setTipPreset] = useState<number>(0);
  const [customTip, setCustomTip] = useState("");
  const [useCustomTip, setUseCustomTip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [tipPaidAmount, setTipPaidAmount] = useState<number | null>(null);
  const [confirmingTip, setConfirmingTip] = useState(false);

  const tipAmount = useMemo(() => {
    if (useCustomTip) {
      const parsed = Number.parseFloat(customTip);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return tipPreset;
  }, [customTip, tipPreset, useCustomTip]);

  useEffect(() => {
    if (!open) return;
    setRating(0);
    setComment("");
    setTipPreset(0);
    setCustomTip("");
    setUseCustomTip(false);
    setError(null);
    setBusy(false);
    setPhase("form");
    setClientSecret(null);
    setPaymentIntentId(null);
    setTipPaidAmount(null);
    setConfirmingTip(false);
  }, [open, target?.booking_reference]);

  if (!open || !target) return null;

  async function startTipCheckout(amount: number) {
    if (!target) return;
    if (!hasStripeKey() || !stripePromise) {
      setError("Card payments are not configured. Your review was saved without a tip.");
      setPhase("done");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sheet = await createTipPaymentSheet({
        booking_reference: target.booking_reference,
        amount,
      });
      setClientSecret(sheet.paymentIntent);
      setPaymentIntentId(sheet.paymentIntentId);
      setTipPaidAmount(sheet.tip_amount ?? amount);
      setPhase("paying");
    } catch (err) {
      setError(authErrorMessage(err, "Could not start tip payment. Your review was still saved."));
      setPhase("done");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    if (rating < 1 || rating > 5) {
      setError("Please choose a rating from 1 to 5 stars.");
      return;
    }
    if (tipAmount > 0 && (tipAmount < TIP_MIN || tipAmount > TIP_MAX)) {
      setError(`Tip must be between ${formatMoney(TIP_MIN, country)} and ${formatMoney(TIP_MAX, country)}.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const trimmed = comment.trim();
      await submitReview({
        booking_reference: target.booking_reference,
        rating,
        ...(trimmed ? { comment: trimmed.slice(0, MAX_COMMENT_LEN) } : {}),
      });
      onSubmitted(target.booking_reference, rating);

      if (tipAmount > 0) {
        setBusy(false);
        await startTipCheckout(tipAmount);
        return;
      }
      setPhase("done");
    } catch (err) {
      setError(authErrorMessage(err, "Could not submit your review."));
    } finally {
      setBusy(false);
    }
  }

  async function finishTipPaid(intentId: string) {
    setConfirmingTip(true);
    setError(null);
    try {
      await waitForPaymentConfirmation(intentId);
      setPhase("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Tip payment is still confirming. If you were charged, the detailer will be notified shortly.",
      );
    } finally {
      setConfirmingTip(false);
    }
  }

  const title =
    phase === "done" ? "Thanks" : phase === "paying" ? "Add a tip" : "Rate this service";

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog dialog--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="review-dialog-title">{title}</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dialog-body">
          {phase === "done" ? (
            <div className="banner banner-ok" role="status">
              {tipPaidAmount && tipPaidAmount > 0
                ? `Your review and ${formatMoney(tipPaidAmount, country)} tip were submitted. The detailer has been notified.`
                : "Your review was submitted. The detailer has been notified."}
            </div>
          ) : null}

          {phase === "form" ? (
            <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
              {error ? (
                <div className="banner banner-error" role="alert">
                  {error}
                </div>
              ) : null}

              <div className="review-summary">
                {target.service_type ? <strong>{target.service_type}</strong> : null}
                {target.vehicle_label ? <p className="muted">{target.vehicle_label}</p> : null}
                {target.detailer_name ? (
                  <p className="muted">Detailer · {target.detailer_name}</p>
                ) : null}
              </div>

              <fieldset className="field review-stars-field">
                <legend>How was your service?</legend>
                <div className="review-stars" role="radiogroup" aria-label="Star rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={rating === star}
                      aria-label={`${star} star${star === 1 ? "" : "s"}`}
                      className={`review-star${star <= rating ? " is-selected" : ""}`}
                      onClick={() => setRating(star)}
                    >
                      ★
                    </button>
                  ))}
                </div>
                {rating > 0 ? (
                  <p className="review-star-label">{RATING_LABELS[rating]}</p>
                ) : (
                  <p className="muted">Tap a star to rate</p>
                )}
              </fieldset>

              <label className="field">
                <span>Comment (optional)</span>
                <textarea
                  rows={3}
                  value={comment}
                  maxLength={MAX_COMMENT_LEN}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what went well or what we could improve"
                />
              </label>

              <fieldset className="field review-tip-field">
                <legend>Add a tip (optional)</legend>
                <div className="tip-presets" role="group" aria-label="Tip amount">
                  {TIP_PRESETS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={`tip-preset${!useCustomTip && tipPreset === amount ? " is-selected" : ""}`}
                      onClick={() => {
                        setUseCustomTip(false);
                        setTipPreset(amount);
                      }}
                    >
                      {amount === 0 ? "No tip" : formatMoney(amount, country)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`tip-preset${useCustomTip ? " is-selected" : ""}`}
                    onClick={() => setUseCustomTip(true)}
                  >
                    Custom
                  </button>
                </div>
                {useCustomTip ? (
                  <label className="field" style={{ marginTop: "0.75rem" }}>
                    <span>Custom tip</span>
                    <input
                      type="number"
                      min={TIP_MIN}
                      max={TIP_MAX}
                      step="0.01"
                      inputMode="decimal"
                      value={customTip}
                      onChange={(e) => setCustomTip(e.target.value)}
                      placeholder={`${TIP_MIN}.00`}
                    />
                  </label>
                ) : null}
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                  Tips go to the detailer that provided the service.
                </p>
              </fieldset>

              <button type="submit" className="btn btn-primary btn-block" disabled={busy || rating < 1}>
                {busy
                  ? "Submitting…"
                  : tipAmount > 0
                    ? `Submit & tip ${formatMoney(tipAmount, country)}`
                    : "Submit review"}
              </button>
            </form>
          ) : null}

          {phase === "paying" && clientSecret && stripePromise ? (
            <div className="auth-form">
              {error ? (
                <div className="banner banner-error" role="alert">
                  {error}
                </div>
              ) : null}
              <p className="muted">
                Review saved. Complete payment to send{" "}
                {formatMoney(tipPaidAmount || tipAmount, country)} to your detailer.
              </p>
              {confirmingTip ? <p className="muted">Confirming tip payment…</p> : null}
              <StripeCheckout clientSecret={clientSecret}>
                <PaymentForm
                  clientSecret={clientSecret}
                  paymentIntentId={paymentIntentId}
                  returnPath="/history"
                  submitLabel={`Pay tip ${formatMoney(tipPaidAmount || tipAmount, country)}`}
                  onPaid={finishTipPaid}
                />
              </StripeCheckout>
              <button
                type="button"
                className="text-btn"
                style={{ marginTop: "0.75rem" }}
                onClick={() => {
                  setPhase("done");
                  setClientSecret(null);
                  setPaymentIntentId(null);
                  setTipPaidAmount(null);
                }}
              >
                Skip tip for now
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
