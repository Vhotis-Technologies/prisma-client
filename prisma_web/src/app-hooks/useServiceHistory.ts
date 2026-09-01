import { useCallback, useEffect, useState } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import type { HistoryItem } from "../types/history";
import * as serviceHistoryApi from "../store/api/serviceHistoryApi";

export function useServiceHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await serviceHistoryApi.getServiceHistory();
      setItems(data.service_history || []);
    } catch (err) {
      setError(authErrorMessage(err, "Could not load service history."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, load };
}
