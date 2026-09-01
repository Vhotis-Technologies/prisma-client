import { loadStripe, type Appearance } from "@stripe/stripe-js";

/** Real pk_test_ / pk_live_ from VITE_STRIPE_PUBLISHABLE_KEY. Never a hardcoded dummy. */
const key = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
const isPublishableKey = /^pk_(test|live)_/.test(key);

export const stripePromise = isPublishableKey ? loadStripe(key) : null;

export function hasStripeKey(): boolean {
  return isPublishableKey;
}

/** Stripe client secrets are `{id}_secret_...`. Native polls the id, not the secret. */
export function intentIdFromClientSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  const marker = "_secret_";
  const index = secret.indexOf(marker);
  if (index > 0) return secret.slice(0, index);
  if (secret.startsWith("pi_") || secret.startsWith("seti_")) return secret;
  return null;
}

export const stripeAppearance: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#6A0DAD",
    colorBackground: "#ffffff",
    colorText: "#212121",
    colorDanger: "#D32F2F",
    fontFamily: "Barlow, Helvetica Neue, Helvetica, Arial, sans-serif",
    borderRadius: "8px",
  },
};
