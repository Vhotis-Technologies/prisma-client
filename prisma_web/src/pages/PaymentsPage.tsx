import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AppShell from "../components/AppShell";
import PaymentForm from "../components/PaymentForm";
import StripeCheckout from "../components/StripeCheckout";
import { waitForPaymentConfirmation } from "../lib/bookingCheckout";
import { formatMoney } from "../lib/format";
import { createGiftVoucherPaymentSheet } from "../store/api/paymentApi";
import { deletePaymentMethod, fetchPaymentMethods } from "../store/api/eventApi";
import { hasStripeKey, intentIdFromClientSecret, stripePromise } from "../lib/stripe";
import type { GiftVoucherPending, SavedCard } from "../types/payment";

const GIFT_PENDING_KEY = "prisma.giftVoucherPending";
const MIN_GIFT_CREDIT_AMOUNT = 50;

function brandLabel(brand?: string | null): string {
  if (!brand) return "Card";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function expiryLabel(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function readPending(): GiftVoucherPending | null {
  try {
    const raw = sessionStorage.getItem(GIFT_PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GiftVoucherPending;
  } catch {
    return null;
  }
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const [params, setParams] = useSearchParams();

  const [cards, setCards] = useState<SavedCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [validityDays, setValidityDays] = useState(45);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [pending, setPending] = useState<GiftVoucherPending | null>(null);

  const [payStatus, setPayStatus] = useState<"idle" | "confirming" | "success" | "failed">("idle");
  const [payError, setPayError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    setCardsLoading(true);
    setCardsError(null);
    try {
      const data = await fetchPaymentMethods();
      setCards(data.payment_methods || []);
    } catch (err) {
      setCardsError(authErrorMessage(err, "Could not load saved cards."));
    } finally {
      setCardsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const finishGiftPay = useCallback(
    async (paymentIntentId: string) => {
      setPayStatus("confirming");
      setPayError(null);
      try {
        await waitForPaymentConfirmation(paymentIntentId);
        sessionStorage.removeItem(GIFT_PENDING_KEY);
        setClientSecret(null);
        setPaymentIntentId(null);
        setPayStatus("success");
        await loadCards();
        setParams({}, { replace: true });
      } catch (err) {
        setPayStatus("failed");
        setPayError(err instanceof Error ? err.message : "Could not confirm payment.");
      }
    },
    [loadCards, setParams],
  );

  const intentId = params.get("payment_intent");
  const redirectStatus = params.get("redirect_status");

  useEffect(() => {
    if (!intentId) return;
    if (redirectStatus === "failed") {
      setPayStatus("failed");
      setPayError("Payment did not complete. Please try again.");
      setParams({}, { replace: true });
      return;
    }
    setPending(readPending());
    void finishGiftPay(intentId);
  }, [finishGiftPay, intentId, redirectStatus, setParams]);

  async function removeCard(card: SavedCard) {
    const ok = window.confirm(`Remove ${brandLabel(card.card.brand)} •••• ${card.card.last4}?`);
    if (!ok) return;
    setDeletingId(card.id);
    setCardsError(null);
    try {
      await deletePaymentMethod(card.id);
      await loadCards();
    } catch (err) {
      setCardsError(authErrorMessage(err, "Could not remove this card."));
    } finally {
      setDeletingId(null);
    }
  }

  async function startGiftPay(event: FormEvent) {
    event.preventDefault();
    const recipient = email.trim().toLowerCase();
    const parsed = Number.parseFloat(amount.replace(",", "."));
    if (!recipient || !recipient.includes("@")) {
      setSheetError("Enter a valid recipient email.");
      return;
    }
    if (!Number.isFinite(parsed) || parsed < MIN_GIFT_CREDIT_AMOUNT) {
      setSheetError(`Minimum gift amount is ${MIN_GIFT_CREDIT_AMOUNT}.`);
      return;
    }
    if (!hasStripeKey()) {
      setSheetError("Stripe is not configured for this web app.");
      return;
    }
    setSheetBusy(true);
    setSheetError(null);
    setPayStatus("idle");
    setPayError(null);
    try {
      const data = await createGiftVoucherPaymentSheet({
        recipient_email: recipient,
        credit_amount: parsed,
        validity_days: validityDays,
      });
      if (!data.paymentIntent) {
        throw new Error("Could not start payment.");
      }
      const next: GiftVoucherPending = {
        recipientEmail: recipient,
        amount: parsed,
        validityDays,
        currency: data.currency,
      };
      sessionStorage.setItem(GIFT_PENDING_KEY, JSON.stringify(next));
      setPending(next);
      setClientSecret(data.paymentIntent);
      setPaymentIntentId(data.paymentIntentId || intentIdFromClientSecret(data.paymentIntent));
    } catch (err) {
      setSheetError(authErrorMessage(err, "Could not start gift voucher payment."));
    } finally {
      setSheetBusy(false);
    }
  }

  function resetGiftForm() {
    setClientSecret(null);
    setPaymentIntentId(null);
    setSheetError(null);
    setPayStatus("idle");
    setPayError(null);
    sessionStorage.removeItem(GIFT_PENDING_KEY);
  }

  const payAmountLabel =
    pending && Number.isFinite(pending.amount)
      ? formatMoney(pending.amount, pending.currency === "gbp" ? "United Kingdom" : country)
      : null;

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">Account</p>
          <h1 className="page-title">Payments</h1>
          <p className="lede">Cards saved on this account, and gift vouchers for someone else.</p>
        </div>
      </section>

      <section className="welcome welcome--split">
        <div>
          <h2 className="section-title">Saved cards</h2>
          <p className="muted">Cards appear here after a booking or gift voucher payment. There is no separate add-card step.</p>
        </div>
      </section>

      {cardsError ? (
        <div className="banner banner-error" role="alert">
          {cardsError}
        </div>
      ) : null}

      {cardsLoading ? <p className="muted">Loading cards…</p> : null}

      {!cardsLoading && cards.length === 0 ? (
        <section className="card">
          <h2>No saved cards</h2>
          <p className="muted">Pay for a booking or a gift voucher and the card can be saved for next time.</p>
        </section>
      ) : null}

      {cards.length > 0 ? (
        <ul className="address-list">
          {cards.map((card) => (
            <li key={card.id} className="address-card">
              <div>
                <strong>
                  {brandLabel(card.card.brand)} •••• {card.card.last4}
                </strong>
                <p className="muted">Expires {expiryLabel(card.card.exp_month, card.card.exp_year)}</p>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void removeCard(card)}
                disabled={deletingId === card.id}
              >
                {deletingId === card.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="welcome welcome--split">
        <div>
          <h2 className="section-title">Gift voucher</h2>
          <p className="muted">
            You are charged now. After Stripe confirms, we email the recipient their code. Validity is 30–60 days.
          </p>
        </div>
      </section>

      {payStatus === "success" ? (
        <section className="card">
          <h2>Voucher paid</h2>
          <p className="muted">
            {pending
              ? `Payment successful. ${pending.recipientEmail} will receive an email shortly with their code.`
              : "Payment successful. The recipient will receive an email shortly with their code."}
          </p>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                resetGiftForm();
                setPending(null);
                setEmail("");
                setAmount("");
                setValidityDays(45);
              }}
            >
              Buy another
            </button>
          </div>
        </section>
      ) : null}

      {payStatus === "confirming" ? (
        <section className="card">
          <h2>Confirming payment</h2>
          <p className="muted">Waiting for Stripe to settle. This usually takes a few seconds.</p>
        </section>
      ) : null}

      {payStatus === "failed" && payError ? (
        <div className="banner banner-error" role="alert">
          {payError}
        </div>
      ) : null}

      {payStatus !== "success" && payStatus !== "confirming" && !clientSecret ? (
        <form className="card profile-form" onSubmit={(e) => void startGiftPay(e)}>
          {sheetError ? (
            <div className="banner banner-error" role="alert">
              {sheetError}
            </div>
          ) : null}
          <label className="field">
            <span>Recipient email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span>Credit amount</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50"
              required
            />
            <p className="field-hint">Recipient can use up to this amount on an eligible booking. Minimum {MIN_GIFT_CREDIT_AMOUNT}.</p>
          </label>
          <div className="field">
            <span>Use window ({validityDays} days)</span>
            <div className="stepper">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setValidityDays((days) => Math.max(30, days - 1))}
                disabled={validityDays <= 30 || sheetBusy}
              >
                −
              </button>
              <strong>{validityDays}</strong>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setValidityDays((days) => Math.min(60, days + 1))}
                disabled={validityDays >= 60 || sheetBusy}
              >
                +
              </button>
            </div>
            <p className="field-hint">30 to 60 days from the moment payment confirms.</p>
          </div>
          <button type="submit" className="btn btn-primary" disabled={sheetBusy}>
            {sheetBusy ? "Starting…" : "Continue to payment"}
          </button>
        </form>
      ) : null}

      {clientSecret && stripePromise && payStatus !== "success" && payStatus !== "confirming" ? (
        <section className="card">
          <h2>Pay {payAmountLabel || "now"}</h2>
          <p className="muted">
            Gift credit for {pending?.recipientEmail || "the recipient"}. This card can be saved on your account.
          </p>
          <StripeCheckout clientSecret={clientSecret}>
            <PaymentForm
              clientSecret={clientSecret}
              paymentIntentId={paymentIntentId}
              onPaid={finishGiftPay}
              returnPath="/settings/payments"
              submitLabel={payAmountLabel ? `Pay ${payAmountLabel}` : "Pay now"}
            />
          </StripeCheckout>
          <div className="card-actions">
            <button type="button" className="btn btn-secondary" onClick={resetGiftForm}>
              Change details
            </button>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
