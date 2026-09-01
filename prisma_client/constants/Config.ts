/**
 * App config from Expo extra: Stripe key, API URLs (detailer, customer, websocket), Google API keys. Fallbacks for dev.
 */
import Constants from "expo-constants";

/** Read Expo extra config (manifest / expoConfig) with empty fallback. */
const getConfig = () => {
  const config =
    Constants.expoConfig?.extra || (Constants.manifest as any)?.extra || {};
  return config;
};

const config = getConfig();

/** Baked at build time via app.config.js (EXPO_PUBLIC_APP_ENV) + eas.json per profile. */
export const APP_ENV =
  (config.appEnv as string | undefined) ||
  (typeof process !== "undefined" &&
    (process as { env?: { EXPO_PUBLIC_APP_ENV?: string } }).env
      ?.EXPO_PUBLIC_APP_ENV) ||
  "development";

/**
 * Stripe publishable key: live pk only when APP_ENV is `production` (store / prod EAS builds).
 * Otherwise test pk (local dev, preview, staging profiles).
 */
export function getStripePublishableKey(): string | undefined {
  const stripe = config.stripe as
    | { publishableKey?: string; productionPublishableKey?: string }
    | undefined;
  if (!stripe) return undefined;
  if (APP_ENV === "production") {
    return stripe.productionPublishableKey || stripe.publishableKey;
  }
  return stripe.publishableKey;
} 

export const STRIPE_PUBLISHABLE_KEY = getStripePublishableKey();

/** Raw Stripe keys from app config (prefer getStripePublishableKey in UI). */
export const STRIPE_CONFIG = {
  publishableKey: config.stripe?.publishableKey,
  productionPublishableKey: config.stripe?.productionPublishableKey,
};

/** Customer, detailer, and websocket base URLs from app config. */
export const API_CONFIG = {
  detailerAppUrl: config.detailer_app_url,
  customerAppUrl: config.customer_app_url,
  websocketUrl: config.websocket_url,
};

// Google Places is proxied through the Prisma server (GOOGLE_PLACES_API_KEY env on server).
// Client apps no longer need a Google API key in app config.
/** @deprecated No longer used — Places calls go through the server proxy. */
export const KEY_CONFIGS = {
  googleApiKeys: undefined as string | undefined,
};

/** App name, version, deep-link scheme, and EAS project id. */
export const APP_CONFIG = {
  name: Constants.expoConfig?.name || "Prisma Car Care",
  version: Constants.expoConfig?.version || "1.0.0",
  scheme: Constants.expoConfig?.scheme || "prismaclient",
  projectId:
    Constants.expoConfig?.extra?.eas?.projectId ||
    "12a19ebe-4dc8-457b-99e9-ccc269808a5c",
};

// Validation (missing keys are handled at runtime where needed)
