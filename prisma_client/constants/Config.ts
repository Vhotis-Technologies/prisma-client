/**
 * App config from Expo extra: Stripe key, API URLs (detailer, customer, websocket), Google API keys. Fallbacks for dev.
 */
import Constants from "expo-constants";

// Function to get config with fallbacks
const getConfig = () => {
  const config =
    Constants.expoConfig?.extra || (Constants.manifest as any)?.extra || {};
  return config;
};

const config = getConfig();

// Stripe Configuration
export const STRIPE_CONFIG = {
  publishableKey: config.stripe?.publishableKey,
};

// API Configuration with fallbacks for testing
export const API_CONFIG = {
  detailerAppUrl: config.detailer_app_url,
  customerAppUrl: config.customer_app_url,
  websocketUrl: config.websocket_url,
};

// Google API Keys Configuration
// Note: The API key should be added to app.json or app.config.js under extra.googleApiKeys
// Example configuration:
// {
//   "extra": {
//     "googleApiKeys": "YOUR_GOOGLE_PLACES_API_KEY_HERE"
//   }
// }
// The Places API key must have the following APIs enabled:
// - Places API (New)
// - Places API (Legacy) - for autocomplete
// - Geocoding API - for place details
export const KEY_CONFIGS = {
  googleApiKeys: config.googleApiKeys || config.googoleApiKeys, // Support both correct and typo'd config keys
};

// App Configuration
export const APP_CONFIG = {
  name: Constants.expoConfig?.name || "Prisma Client",
  version: Constants.expoConfig?.version || "1.0.0",
  scheme: Constants.expoConfig?.scheme || "prismaclient",
  projectId:
    Constants.expoConfig?.extra?.eas?.projectId ||
    "12a19ebe-4dc8-457b-99e9-ccc269808a5c",
};

// Validation (missing keys are handled at runtime where needed)
