import { useCallback, useEffect, useState } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import { isBulkBookingEligible } from "../lib/account";
import type { InvoiceCheckoutResponse } from "../types/invoice";
import type { UserProfile } from "../types/user";
import * as paymentApi from "../store/api/paymentApi";

export function useInvoiceDetail(user: UserProfile | null, invoiceId: string) {
  const allowed = isBulkBookingEligible(user);
  const [checkout, setCheckout] = useState<InvoiceCheckoutResponse | null>(null);
  const [loading, setLoading] = useState(allowed && Boolean(invoiceId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!allowed || !invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      setCheckout(await paymentApi.getBulkInvoiceCheckout(invoiceId));
    } catch (err) {
      setError(authErrorMessage(err, "Could not load this invoice."));
      setCheckout(null);
    } finally {
      setLoading(false);
    }
  }, [allowed, invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const payOnStripe = useCallback(async () => {
    if (!invoiceId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await paymentApi.getBulkInvoiceCheckout(invoiceId);
      setCheckout(data);
      if (data.already_paid) return;
      const url = data.hosted_invoice_url;
      if (!url) {
        setError("Stripe has not issued a payment page for this invoice yet.");
        return;
      }
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        setError("Your browser blocked the payment tab. Allow pop-ups, then try again.");
      }
    } catch (err) {
      setError(authErrorMessage(err, "Could not open Stripe checkout."));
    } finally {
      setBusy(false);
    }
  }, [invoiceId]);

  return { allowed, checkout, loading, error, busy, load, payOnStripe };
}
