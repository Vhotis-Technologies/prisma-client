/**
 * Dynamic Expo config: merges app.json and injects appEnv from EAS / local env.
 * EAS sets EXPO_PUBLIC_APP_ENV per profile in eas.json (production → live Stripe pk).
 */
const appJson = require("./app.json");

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      appEnv: process.env.EXPO_PUBLIC_APP_ENV || "development",
    },
  },
};
