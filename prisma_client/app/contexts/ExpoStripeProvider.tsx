import { Platform } from "react-native";
import { StripeProvider } from "@stripe/stripe-react-native";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import React from "react";
import * as Linking from "expo-linking";
import { STRIPE_PUBLISHABLE_KEY } from "@/constants/Config";

const publishableKey = STRIPE_PUBLISHABLE_KEY ?? "";

// Initialize Stripe for web
const stripePromise = loadStripe(publishableKey);

export default function ExpoStripeProvider(
  props: Omit<
    React.ComponentProps<typeof StripeProvider>,
    "publishableKey" | "merchantIdentifier"
  >
) {
  // For mobile payments, redirect to dashboard after payment completion
  const returnurl = "https://prismavalet.com/payment/return";

  // For native platforms
  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier="merchant.com.prismavalet"
      urlScheme={returnurl?.split("://")?.[0]}
      {...props}
    />
  );
}
