import { useCallback, useEffect, useState } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import { flattenVehicles, type GarageVehicle } from "../types/garage";
import * as garageApi from "../store/api/garageApi";

export function useGarage() {
  const [vehicles, setVehicles] = useState<GarageVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.getVehicles();
      setVehicles(flattenVehicles(data));
    } catch (err) {
      setError(authErrorMessage(err, "Could not load your garage."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeVehicle = useCallback(
    async (vehicle: GarageVehicle) => {
      setDeletingId(vehicle.id);
      setError(null);
      try {
        await garageApi.deleteVehicle(vehicle.id);
        await load();
      } catch (err) {
        setError(authErrorMessage(err, "Could not remove this vehicle."));
      } finally {
        setDeletingId(null);
      }
    },
    [load],
  );

  return { vehicles, loading, error, deletingId, load, removeVehicle };
}
