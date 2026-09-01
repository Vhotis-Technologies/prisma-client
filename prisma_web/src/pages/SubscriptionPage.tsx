import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AppShell from "../components/AppShell";
import PaymentForm from "../components/PaymentForm";
import StripeCheckout from "../components/StripeCheckout";
import { waitForPaymentConfirmation } from "../store/api/paymentApi";
import * as subscriptionApi from "../store/api/subscriptionApi";
import { formatDate, formatMoney, formatStatus } from "../lib/format";
import { hasStripeKey, intentIdFromClientSecret, stripePromise } from "../lib/stripe";
import type { PerksSummary } from "../types/dashboard";
import type {
  BillingCycle,
  CurrentSubscription,
  SubscriptionBillingRow,
  SubscriptionTier,
  VehicleCategory,
} from "../types/subscription";

function vehicleCategoryLabel(category?: VehicleCategory | null): string {
  if (category === "sedan") return "Sedan";
  if (category === "suv_mpv") return "SUV / MPV";
  return "—";
}

function tierPrice(tier: SubscriptionTier, category: VehicleCategory, cycle: BillingCycle): number {
  const byCategory = tier.pricesByVehicleCategory?.[category];
  if (byCategory) return cycle === "yearly" ? byCategory.yearlyPrice : byCategory.monthlyPrice;
  return cycle === "yearly" ? tier.yearlyPrice : tier.monthlyPrice;
}

const CHECKOUT_KEY = "prisma.subscriptionCheckout";

type CheckoutKind = "payment" | "setup" | "update";

type CheckoutState = {
  kind: CheckoutKind;
  clientSecret: string;
  paymentIntentId?: string;
  subscriptionId?: string;
};

function readCheckout(): CheckoutState | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutState;
  } catch {
    return null;
  }
}

function isoDay(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function statusLabel(sub: CurrentSubscription): string {
  if (sub.isTrialing) return "Trial";
  if (sub.status === "pending") return "Pending payment";
  if (sub.status === "past_due") return "Payment failed";
  if (sub.status === "canceled" || sub.status === "cancelled") return "Cancelled";
  return formatStatus(sub.status) || sub.status;
}

function billingPlanLabel(row: SubscriptionBillingRow): string {
  const plan = row.subscription?.plan;
  const name = plan?.tier?.name || plan?.name || "Subscription";
  const cycle = plan?.billing_cycle;
  return cycle ? `${name} · ${cycle}` : name;
}

export default function SubscriptionPage() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const isFleetOwner = Boolean(user?.is_fleet_owner);
  const [params, setParams] = useSearchParams();

  const [plans, setPlans] = useState<SubscriptionTier[]>([]);
  const [current, setCurrent] = useState<CurrentSubscription | null>(null);
  const [canStartTrial, setCanStartTrial] = useState(false);
  const [isEarlyAdopter, setIsEarlyAdopter] = useState(false);
  const [billing, setBilling] = useState<SubscriptionBillingRow[]>([]);
  const [perks, setPerks] = useState<PerksSummary["subscription_complimentary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [tierId, setTierId] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>("sedan");
  const [vehicleCategoryTouched, setVehicleCategoryTouched] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutState | null>(() => readCheckout());
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const selected = plans.find((tier) => tier.id === tierId) || null;
  const price = selected ? tierPrice(selected, vehicleCategory, cycle) : 0;
  const managing =
    current &&
    (current.status === "active" ||
      current.status === "pending" ||
      current.status === "past_due" ||
      current.isTrialing);
  const complimentary = !isFleetOwner ? perks : null;

  // Default the vehicle class picker from the active subscription once it loads.
  useEffect(() => {
    if (isFleetOwner || vehicleCategoryTouched) return;
    const fromSub = current?.vehicleCategory;
    if (fromSub === "sedan" || fromSub === "suv_mpv") setVehicleCategory(fromSub);
  }, [isFleetOwner, vehicleCategoryTouched, current?.vehicleCategory]);

  const needsCancelToSwitchClass = Boolean(
    !isFleetOwner &&
      managing &&
      current?.vehicleCategory &&
      current.vehicleCategory !== vehicleCategory,
  );

  function selectVehicleCategory(category: VehicleCategory) {
    setVehicleCategoryTouched(true);
    setVehicleCategory(category);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, currentRes, billingRes] = await Promise.allSettled([
        subscriptionApi.getPlans(isFleetOwner),
        subscriptionApi.getCurrentSubscription(isFleetOwner),
        subscriptionApi.getBillingHistory(isFleetOwner),
      ]);

      if (plansRes.status === "fulfilled") {
        const nextPlans = plansRes.value.plans || [];
        setPlans(nextPlans);
        setTierId((currentId) => currentId || nextPlans[0]?.id || null);
      }
      else setError(authErrorMessage(plansRes.reason, "Could not load plans."));

      if (currentRes.status === "fulfilled") {
        const payload = currentRes.value;
        const sub = payload.subscription;
        setCurrent(sub);
        setCanStartTrial(Boolean(payload.canStartTrial ?? sub?.canStartTrial));
        setIsEarlyAdopter(Boolean(payload.isEarlyAdopter ?? sub?.isEarlyAdopter));
      } else {
        setError(authErrorMessage(currentRes.reason, "Could not load your subscription."));
      }

      if (billingRes.status === "fulfilled") setBilling(billingRes.value.billing_history || []);

      if (!isFleetOwner) {
        try {
          const data = await subscriptionApi.getPerksSummary();
          setPerks(data.subscription_complimentary || null);
        } catch {
          setPerks(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isFleetOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearCheckout = useCallback(() => {
    sessionStorage.removeItem(CHECKOUT_KEY);
    setCheckout(null);
  }, []);

  const finishPaid = useCallback(
    async (paymentIntentId: string) => {
      setBusy(true);
      setError(null);
      try {
        await waitForPaymentConfirmation(paymentIntentId);
        clearCheckout();
        setOk("Subscription activated.");
        await load();
        setParams({}, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment was received. Refresh in a moment.");
        await load();
      } finally {
        setBusy(false);
      }
    },
    [clearCheckout, load, setParams],
  );

  const finishSetup = useCallback(
    async (_setupIntentId: string, paymentMethod?: string) => {
      setBusy(true);
      setError(null);
      try {
        if (checkout?.kind === "update" && paymentMethod) {
          await subscriptionApi.updateSubscriptionPaymentMethod(isFleetOwner, paymentMethod);
          setOk("Payment method updated.");
        } else {
          setOk("Trial started. Your card is saved for when the trial ends.");
        }
        clearCheckout();
        await load();
        setParams({}, { replace: true });
      } catch (err) {
        setError(authErrorMessage(err, "Could not finish card setup."));
      } finally {
        setBusy(false);
      }
    },
    [isFleetOwner, checkout?.kind, clearCheckout, load, setParams],
  );

  const intentId = params.get("payment_intent");
  const setupIntentId = params.get("setup_intent");
  const redirectStatus = params.get("redirect_status");

  useEffect(() => {
    if (redirectStatus === "failed") {
      setError("Payment did not complete. Please try again.");
      setParams({}, { replace: true });
      return;
    }
    if (intentId) void finishPaid(intentId);
  }, [finishPaid, intentId, redirectStatus, setParams]);

  useEffect(() => {
    if (!setupIntentId || redirectStatus === "failed") return;
    void finishSetup(setupIntentId);
  }, [finishSetup, redirectStatus, setupIntentId]);

  async function abandon(subscriptionId?: string) {
    if (isFleetOwner) return;
    try {
      await subscriptionApi.abandonIncompleteSubscription(isFleetOwner, subscriptionId);
    } catch {
      /* non-fatal */
    }
  }

  async function subscribe() {
    if (!tierId) {
      setError("Select a plan first.");
      return;
    }
    if (!hasStripeKey()) {
      setError("Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const data = await subscriptionApi.createSubscription(isFleetOwner, {
        tierId,
        billingCycle: cycle,
        vehicleCategory: isFleetOwner ? undefined : vehicleCategory,
      });
      if (!data.paymentSheet) {
        setOk(data.message || "Subscription activated.");
        await load();
        return;
      }
      const isTrial = Boolean(data.isTrial);
      const secret = isTrial ? data.paymentSheet.setupIntent : data.paymentSheet.paymentIntent;
      if (!secret) {
        await abandon(data.subscription?.id);
        setError("Payment details were not returned. Please try again.");
        return;
      }
      const next: CheckoutState = {
        kind: isTrial ? "setup" : "payment",
        clientSecret: secret,
        paymentIntentId: intentIdFromClientSecret(secret) || undefined,
        subscriptionId: data.subscription?.id,
      };
      sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(next));
      setCheckout(next);
    } catch (err) {
      setError(authErrorMessage(err, "Could not start this subscription."));
    } finally {
      setBusy(false);
    }
  }

  async function updateCard() {
    if (!hasStripeKey()) {
      setError("Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await subscriptionApi.getSetupIntent(isFleetOwner);
      if (!data.setupIntent) throw new Error("Could not start card setup.");
      const next: CheckoutState = {
        kind: "update",
        clientSecret: data.setupIntent,
        paymentIntentId: intentIdFromClientSecret(data.setupIntent) || undefined,
      };
      sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(next));
      setCheckout(next);
    } catch (err) {
      setError(authErrorMessage(err, "Could not update the payment method."));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(atPeriodEnd: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (!isFleetOwner && current?.status === "pending") {
        await subscriptionApi.abandonIncompleteSubscription(isFleetOwner, current.id);
      } else {
        await subscriptionApi.cancelSubscription(isFleetOwner, atPeriodEnd);
      }
      setCancelOpen(false);
      setOk(
        atPeriodEnd && current?.status !== "pending" && !current?.isTrialing
          ? "Subscription will end at the close of this billing period."
          : "Subscription cancelled.",
      );
      await load();
    } catch (err) {
      setError(authErrorMessage(err, "Could not cancel this subscription."));
    } finally {
      setBusy(false);
    }
  }

  async function cancelCheckout() {
    await abandon(checkout?.subscriptionId);
    clearCheckout();
    await load();
  }

  const complimentaryMax = complimentary?.max_subscription ?? 0;
  const complimentaryLeft = Math.max(0, complimentary?.remaining_subscription ?? 0);
  const showComplimentary = Boolean(!isFleetOwner && complimentary && complimentaryMax > 0);

  const subscribeLabel = useMemo(() => {
    if (needsCancelToSwitchClass) return "Cancel to switch vehicle class";
    if (canStartTrial && isFleetOwner) return "Start trial";
    if (managing) return "Switch plan";
    return "Subscribe";
  }, [needsCancelToSwitchClass, canStartTrial, isFleetOwner, managing]);

  return (
    <AppShell>
      <section className="welcome">
        <p className="kicker">{isFleetOwner ? "Fleet" : "Personal"}</p>
        <h1 className="page-title">Subscription</h1>
        <p className="lede">
          {isFleetOwner
            ? "One plan: invoice later and job photos. Trial includes the same perks. You can still book and pay now without a subscription."
            : "Personal plans and complimentary washes."}
        </p>
      </section>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="banner banner-ok" role="status">
          {ok}
        </div>
      ) : null}

      {current?.isTrialing ? (
        <div className="banner banner-ok" role="status">
          Trial: {current.trialDaysRemaining ?? 0} days left
          {current.trialEndDate ? ` · ends ${formatDate(isoDay(current.trialEndDate))}` : ""}.
        </div>
      ) : null}
      {current?.paymentFailureStatus?.hasFailure ? (
        <div className="banner banner-error" role="alert">
          Payment failed.
          {current.paymentFailureStatus.gracePeriodUntil
            ? ` Update your card before ${formatDate(isoDay(current.paymentFailureStatus.gracePeriodUntil))} to keep the plan.`
            : " Update your payment method to keep the plan."}
        </div>
      ) : null}
      {needsCancelToSwitchClass ? (
        <div className="banner banner-ok" role="status">
          You currently have an active {vehicleCategoryLabel(current?.vehicleCategory)} subscription. To
          switch to {vehicleCategoryLabel(vehicleCategory)}, cancel your current plan first, then subscribe
          again.
        </div>
      ) : null}

      {loading ? <p className="muted">Loading subscription…</p> : null}

      {managing && current ? (
        <section className="card">
          <div className="card-row">
            <h2>Current plan</h2>
            <span
              className={`pill ${
                current.status === "past_due" || current.status === "pending" || current.isTrialing
                  ? "pill-pending"
                  : current.status === "canceled" || current.status === "cancelled" || current.status === "expired"
                    ? "pill-error"
                    : "pill-ok"
              }`}
            >
              {statusLabel(current)}
            </span>
          </div>
          <dl className="meta">
            <div>
              <dt>Plan</dt>
              <dd>{current.currentPlan || "—"}</dd>
            </div>
            <div>
              <dt>{current.isTrialing ? "Trial ends" : "Renews"}</dt>
              <dd>
                {isoDay(current.isTrialing ? current.trialEndDate || current.renewsOn : current.renewsOn)
                  ? formatDate(isoDay(current.isTrialing ? current.trialEndDate || current.renewsOn : current.renewsOn))
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Last paid</dt>
              <dd>{current.lastPaidOn ? formatDate(isoDay(current.lastPaidOn)) : "Never"}</dd>
            </div>
            <div>
              <dt>Billing</dt>
              <dd>{formatStatus(current.billingCycle) || "—"}</dd>
            </div>
            {!isFleetOwner && current.vehicleCategory ? (
              <div>
                <dt>Vehicle class</dt>
                <dd>{vehicleCategoryLabel(current.vehicleCategory)}</dd>
              </div>
            ) : null}
          </dl>
          {showComplimentary ? (
            <>
              <p className="muted">
                Complimentary washes left: {complimentaryLeft} / {complimentaryMax}
                {complimentary?.period_label ? ` · ${complimentary.period_label}` : ""}
              </p>
              <div className="progress-track" aria-hidden="true">
                <div
                  className="progress-fill"
                  style={{
                    width: `${complimentaryMax ? Math.round(((complimentaryMax - complimentaryLeft) / complimentaryMax) * 100) : 0}%`,
                  }}
                />
              </div>
            </>
          ) : null}
          <div className="card-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void updateCard()} disabled={busy}>
              Update card
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setCancelOpen(true)} disabled={busy}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="wizard-panel">
        <h2 className="section-title">Plans</h2>
        {!loading && plans.length === 0 ? (
          <p className="muted">No plans are available right now.</p>
        ) : null}
        {!isFleetOwner && plans.length > 0 ? (
          <div className="photo-tabs" role="tablist" aria-label="Vehicle class">
            <button
              type="button"
              role="tab"
              className={`photo-tab${vehicleCategory === "sedan" ? " is-selected" : ""}`}
              aria-selected={vehicleCategory === "sedan"}
              disabled={Boolean(checkout)}
              onClick={() => selectVehicleCategory("sedan")}
            >
              Sedan
            </button>
            <button
              type="button"
              role="tab"
              className={`photo-tab${vehicleCategory === "suv_mpv" ? " is-selected" : ""}`}
              aria-selected={vehicleCategory === "suv_mpv"}
              disabled={Boolean(checkout)}
              onClick={() => selectVehicleCategory("suv_mpv")}
            >
              SUV / MPV
            </button>
          </div>
        ) : null}
        {!isFleetOwner && plans.length > 0 ? (
          <p className="muted">
            Sedan plans cover saloon cars only. SUV/MPV plans cover larger vehicles and sedans. Switching
            class requires cancelling your current plan first.
          </p>
        ) : null}
        <ul className="stack-list">
          {plans.map((tier) => {
            const selectedTier = tierId === tier.id;
            const shown = selectedTier ? price : tierPrice(tier, vehicleCategory, "monthly");
            return (
              <li key={tier.id}>
                <button
                  type="button"
                  className={`stack-card${selectedTier ? " is-selected" : ""}`}
                  onClick={() => setTierId(tier.id)}
                  disabled={Boolean(checkout)}
                >
                  <div className="stack-card-top">
                    <strong>
                      {tier.name}
                      {tier.badge ? ` · ${tier.badge}` : ""}
                    </strong>
                    <span>
                      {formatMoney(shown, country)}
                      {selectedTier && cycle === "yearly" ? " / year" : " / month"}
                    </span>
                  </div>
                  {tier.tagLine ? <p className="muted">{tier.tagLine}</p> : null}
                  {(tier.maxComplimentaryWashes ?? 0) > 0 || (tier.serviceDiscountPercent ?? 0) > 0 || tier.features?.length ? (
                    <ul className="stack-copy">
                      {(tier.maxComplimentaryWashes ?? 0) > 0 ? (
                        <li>
                          {tier.maxComplimentaryWashes} complimentary Prisma Quick Sparkle wash
                          {tier.maxComplimentaryWashes === 1 ? "" : "es"} / period
                        </li>
                      ) : null}
                      {(tier.serviceDiscountPercent ?? 0) > 0 ? (
                        <li>{tier.serviceDiscountPercent}% off paid bookings</li>
                      ) : null}
                      {tier.features?.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  ) : null}
                </button>
                {selectedTier ? (
                  <div className="photo-tabs" role="tablist" aria-label="Billing cycle">
                    <button
                      type="button"
                      role="tab"
                      className={`photo-tab${cycle === "monthly" ? " is-selected" : ""}`}
                      aria-selected={cycle === "monthly"}
                      disabled={Boolean(checkout)}
                      onClick={() => setCycle("monthly")}
                    >
                      Monthly · {formatMoney(tierPrice(tier, vehicleCategory, "monthly"), country)}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`photo-tab${cycle === "yearly" ? " is-selected" : ""}`}
                      aria-selected={cycle === "yearly"}
                      disabled={Boolean(checkout)}
                      onClick={() => setCycle("yearly")}
                    >
                      Yearly · {formatMoney(tierPrice(tier, vehicleCategory, "yearly"), country)}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canStartTrial && isFleetOwner ? (
          <p className="muted">
            {isEarlyAdopter ? "Early adopter trial: 60 days." : "New fleets can start with a 30-day trial."}
          </p>
        ) : null}
      </section>

      {checkout && stripePromise ? (
        <section className="card">
          <h2>{checkout.kind === "payment" ? "Pay" : checkout.kind === "update" ? "New card" : "Save a card for trial"}</h2>
          {busy ? <p className="muted">Confirming with the server…</p> : null}
          <StripeCheckout clientSecret={checkout.clientSecret}>
            <PaymentForm
              clientSecret={checkout.clientSecret}
              paymentIntentId={checkout.paymentIntentId}
              mode={checkout.kind === "payment" ? "payment" : "setup"}
              returnPath="/settings/subscriptions"
              submitLabel={checkout.kind === "payment" ? "Pay now" : "Save card"}
              onPaid={finishPaid}
              onSetup={finishSetup}
            />
          </StripeCheckout>
          <div className="card-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void cancelCheckout()} disabled={busy}>
              Cancel checkout
            </button>
          </div>
        </section>
      ) : (
        <div className="wizard-nav">
          <Link to="/settings/subscriptions" className="btn btn-secondary">
            Back
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (needsCancelToSwitchClass ? setCancelOpen(true) : void subscribe())}
            disabled={!tierId || busy}
          >
            {busy ? "Working…" : subscribeLabel}
          </button>
        </div>
      )}

      <section className="card">
        <h2>Billing history</h2>
        {billing.length === 0 ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <ul className="booking-list">
            {billing.map((row) => (
              <li key={row.id} className="booking-item">
                <div className="booking-item-top">
                  <strong>{billingPlanLabel(row)}</strong>
                  <span className={`pill ${row.status === "paid" ? "pill-ok" : "pill-pending"}`}>
                    {formatStatus(row.status) || "—"}
                  </span>
                </div>
                <p>{row.billing_date ? formatDate(isoDay(row.billing_date)) : "—"}</p>
                <p className="booking-meta">{formatMoney(Number(row.amount || 0), country)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cancelOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setCancelOpen(false)}>
          <div
            className="dialog"
            role="dialog"
            aria-labelledby="cancel-sub-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="cancel-sub-title">
                {needsCancelToSwitchClass ? "Switch vehicle class" : "Cancel subscription"}
              </h2>
              <button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(false)}>
                Close
              </button>
            </div>
            <div className="dialog-body">
              <p>
                {needsCancelToSwitchClass
                  ? `Sedan and SUV/MPV plans cannot run at the same time. Cancel your ${vehicleCategoryLabel(current?.vehicleCategory)} plan now, then subscribe to ${vehicleCategoryLabel(vehicleCategory)} at the matching price.`
                  : current?.status === "pending"
                    ? "Checkout is not finished, so nothing has been charged. Discard it to choose another plan."
                    : current?.isTrialing
                      ? "Cancelling the trial ends access immediately."
                      : "Cancel at period end to keep access until the current term finishes, or cancel now."}
              </p>
              <div className="card-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setCancelOpen(false)}>
                  Keep subscription
                </button>
                {current?.status !== "pending" && !current?.isTrialing && !needsCancelToSwitchClass ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void cancel(true)}
                    disabled={busy}
                  >
                    Cancel at period end
                  </button>
                ) : null}
                <button type="button" className="btn btn-danger" onClick={() => void cancel(false)} disabled={busy}>
                  {needsCancelToSwitchClass
                    ? "Cancel & switch"
                    : current?.status === "pending"
                      ? "Discard checkout"
                      : current?.isTrialing
                        ? "Cancel trial"
                        : "Cancel now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
