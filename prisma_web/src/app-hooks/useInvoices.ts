import { useCallback, useEffect, useState } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import { isBulkBookingEligible } from "../lib/account";
import type { InvoiceListItem } from "../types/invoice";
import type { UserProfile } from "../types/user";
import * as paymentApi from "../store/api/paymentApi";

export function useInvoices(user: UserProfile | null) {
  const allowed = isBulkBookingEligible(user);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(allowed);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const data = await paymentApi.getInvoices(user);
      setInvoices(data.invoices || []);
    } catch (err) {
      setError(authErrorMessage(err, "Could not load invoices."));
    } finally {
      setLoading(false);
    }
  }, [allowed, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { allowed, invoices, loading, error, load };
}
