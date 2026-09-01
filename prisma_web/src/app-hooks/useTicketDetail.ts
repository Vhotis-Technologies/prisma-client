import { useEffect, useState } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import type { TicketDetail } from "../types/account";
import * as ticketApi from "../store/api/ticketApi";

export function useTicketDetail(ticketId: string | undefined) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(ticketId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await ticketApi.getTicketDetail(ticketId);
        if (!cancelled) setTicket(data);
      } catch (err) {
        if (!cancelled) setError(authErrorMessage(err, "Could not load this ticket."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  return { ticket, loading, error };
}
