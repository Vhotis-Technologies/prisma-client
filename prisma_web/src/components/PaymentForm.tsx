import { useEffect, useState, type FormEvent } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { intentIdFromClientSecret } from "../lib/stripe";
import { paymentMethodId } from "../lib/subscriptionApi";

type PaymentFormProps = {
  clientSecret: string;
  /** Server PaymentIntent id (same value native polls after Payment Sheet). */
  paymentIntentId?: string | null;
  onPaid?: (paymentIntentId: string) => Promise<void>;
  onSetup?: (setupIntentId: string, paymentMethodId?: string) => Promise<void>;
  mode?: "payment" | "setup";
  returnPath?: string;
  submitLabel?: string;
};

export default function PaymentForm({
  clientSecret,
  paymentIntentId,
  onPaid,
  onSetup,
  mode = "payment",
  returnPath = "/book/confirmation",
  submitLabel = "Pay now",
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReady(false);
  }, [clientSecret]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || "Check the card details and try again.");
        return;
      }

      // import.meta.env.BASE_URL reflects Vite's `base` (e.g. "/app/" in staging, where this
      // SPA is only reachable under that prefix). Must match the routing basename in App.tsx,
      // or Stripe's redirect-back for off-site payment methods (3D Secure, etc.) 404s at the
      // gateway since bare paths like "/settings/subscriptions" aren't proxied to the SPA.
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const returnUrl = `${window.location.origin}${basePath}${returnPath}`;

      if (mode === "setup") {
        const { error: confirmError, setupIntent } = await stripe.confirmSetup({
          elements,
          clientSecret,
          confirmParams: { return_url: returnUrl },
          redirect: "if_required",
        });
        if (confirmError) {
          setError(confirmError.message || "Could not save this card. Please try another.");
          return;
        }
        const setupId = setupIntent?.id || intentIdFromClientSecret(clientSecret);
        if (
          setupId &&
          (!setupIntent || setupIntent.status === "succeeded" || setupIntent.status === "processing")
        ) {
          await onSetup?.(setupId, paymentMethodId(setupIntent?.payment_method) || undefined);
          return;
        }
        setError("Card setup did not complete. Please try again.");
        return;
      }

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (confirmError) {
        setError(confirmError.message || "Payment failed. Please try another card.");
        return;
      }

      const intentId =
        paymentIntentId ||
        paymentIntent?.id ||
        intentIdFromClientSecret(clientSecret);
      if (!intentId) {
        setError("Payment succeeded but the intent id was missing. Check Dashboard or contact support.");
        return;
      }
      await onPaid?.(intentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  const canPay = Boolean(stripe && ready && !busy);

  return (
    <form className="pay-form" onSubmit={(e) => void onSubmit(e)}>
      <div className="pay-element">
        <PaymentElement onReady={() => setReady(true)} />
      </div>
      {!ready ? <p className="muted">Loading card form…</p> : null}
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={!canPay}>
        {busy ? "Processing…" : submitLabel}
      </button>
      <p className="field-hint">Use Stripe test card 4242 4242 4242 4242, any future expiry, any CVC.</p>
    </form>
  );
}
