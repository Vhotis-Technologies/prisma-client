import { useMemo, type ReactNode } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { stripeAppearance, stripePromise } from "../lib/stripe";

type StripeCheckoutProps = {
  clientSecret: string;
  children: ReactNode;
};

/** Memoizes Elements options so parent re-renders do not remount the Payment Element. */
export default function StripeCheckout({ clientSecret, children }: StripeCheckoutProps) {
  const options = useMemo(
    () => ({ clientSecret, appearance: stripeAppearance }),
    [clientSecret],
  );
  if (!stripePromise) return null;
  return (
    <Elements stripe={stripePromise} options={options}>
      {children}
    </Elements>
  );
}
