import type { PerksSummary } from "../../types/dashboard";
import type {
  BillingCycle,
  CreateSubscriptionResponse,
  CurrentSubscriptionResponse,
  SetupIntentResponse,
  SubscriptionBillingRow,
  SubscriptionTier,
  VehicleCategory,
} from "../../types/subscription";
import { getData, postData } from "./client";

export function subscriptionApiBase(isFleetOwner: boolean): string {
  return isFleetOwner ? "/api/v1/subscription" : "/api/v1/b2c-subscription";
}

export function getPlans(isFleetOwner: boolean) {
  return getData<{ plans: SubscriptionTier[] }>(`${subscriptionApiBase(isFleetOwner)}/get_plans/`);
}

export function getCurrentSubscription(isFleetOwner: boolean) {
  return getData<CurrentSubscriptionResponse>(
    `${subscriptionApiBase(isFleetOwner)}/get_current_subscription/`,
  );
}

export function getBillingHistory(isFleetOwner: boolean) {
  return getData<{ billing_history: SubscriptionBillingRow[] }>(
    `${subscriptionApiBase(isFleetOwner)}/get_subscription_billing_history/`,
  );
}

export function createSubscription(
  isFleetOwner: boolean,
  body: { tierId: string; billingCycle: BillingCycle; vehicleCategory?: VehicleCategory },
) {
  return postData<CreateSubscriptionResponse>(
    `${subscriptionApiBase(isFleetOwner)}/create_subscription/`,
    body,
  );
}

export function cancelSubscription(isFleetOwner: boolean, cancelAtPeriodEnd: boolean) {
  return postData(`${subscriptionApiBase(isFleetOwner)}/cancel_subscription/`, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });
}

export function abandonIncompleteSubscription(isFleetOwner: boolean, subscriptionId?: string) {
  return postData(
    `${subscriptionApiBase(isFleetOwner)}/abandon_incomplete_subscription/`,
    subscriptionId ? { subscriptionId } : {},
  );
}

export function updateSubscriptionPaymentMethod(isFleetOwner: boolean, paymentMethodId: string) {
  return postData(`${subscriptionApiBase(isFleetOwner)}/update_payment_method/`, {
    payment_method_id: paymentMethodId,
  });
}

export function getSetupIntent(isFleetOwner: boolean) {
  return getData<SetupIntentResponse>(`${subscriptionApiBase(isFleetOwner)}/get_setup_intent/`);
}

export function getPerksSummary() {
  return getData<PerksSummary>("/api/v1/dashboard/get_perks_summary/");
}
