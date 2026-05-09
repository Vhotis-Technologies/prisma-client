/**
 * Dynamic Expo config: merges app.json and injects appEnv from EAS / local env.
 * EAS sets EXPO_PUBLIC_APP_ENV per profile in eas.json (production → live Stripe pk).
 */
const appJson = require("./app.json");

const appEnv = process.env.EXPO_PUBLIC_APP_ENV || "development";

const envUrls = {
  production: {
    detailer_app_url: "https://crew.prismavalet.com",
    customer_app_url: "https://client.prismavalet.com",
    websocket_url: "wss://client.prismavalet.com/ws/client/",
  },
  staging: {
    detailer_app_url: "https://staging.crew.prismavalet.com",
    customer_app_url: "https://staging.client.prismavalet.com",
    websocket_url: "wss://staging.client.prismavalet.com/ws/client/",
  },
};

const selectedUrls = envUrls[appEnv] || envUrls.staging;

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      ...selectedUrls,
      appEnv,
    },
  },
};
