import { useState } from "react";
import AddVehicleDialog from "../components/AddVehicleDialog";
import AppShell from "../components/AppShell";
import EditVehicleDialog from "../components/EditVehicleDialog";
import { useGarage } from "../app-hooks/useGarage";
import { plateOf, type GarageVehicle } from "../types/garage";

export default function GaragePage() {
  const { vehicles, loading, error, deletingId, load, removeVehicle } = useGarage();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GarageVehicle | null>(null);

  function onRemove(vehicle: GarageVehicle) {
    const plate = plateOf(vehicle);
    const ok = window.confirm(
      `Remove ${vehicle.year} ${vehicle.make} ${vehicle.model}${plate ? ` (${plate})` : ""} from your garage?`,
    );
    if (!ok) return;
    void removeVehicle(vehicle);
  }

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">Garage</p>
          <h1 className="page-title">Your vehicles</h1>
          <p className="lede">Look up an Irish plate, or enter details by hand.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Add vehicle
        </button>
      </section>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? <p className="muted">Loading your garage…</p> : null}

      {!loading && vehicles.length === 0 ? (
        <section className="card">
          <h2>No vehicles yet</h2>
          <p className="muted">Add your first car to start booking.</p>
        </section>
      ) : null}

      {vehicles.length > 0 ? (
        <ul className="vehicle-grid">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id} className="vehicle-card">
              {vehicle.image ? (
                <img className="vehicle-photo" src={vehicle.image} alt="" />
              ) : (
                <div className="vehicle-photo vehicle-photo-fallback">No photo</div>
              )}
              <div className="vehicle-card-body">
                <strong>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </strong>
                <p className="muted">{plateOf(vehicle) || "No plate"}</p>
                <p className="muted">
                  {vehicle.color}
                  {vehicle.body_style ? ` · ${vehicle.body_style}` : ""}
                  {vehicle.country ? ` · ${vehicle.country}` : ""}
                </p>
                <div className="vehicle-card-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(vehicle)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => onRemove(vehicle)}
                    disabled={deletingId === vehicle.id}
                  >
                    {deletingId === vehicle.id ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <AddVehicleDialog open={adding} onClose={() => setAdding(false)} onAdded={() => void load()} />
      {editing ? (
        <EditVehicleDialog vehicle={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      ) : null}
    </AppShell>
  );
}
