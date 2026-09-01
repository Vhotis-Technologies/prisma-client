import { useState, type FormEvent } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import { updateVehicle } from "../store/api/garageApi";
import { plateOf, type GarageVehicle } from "../types/garage";

type EditVehicleDialogProps = {
  vehicle: GarageVehicle;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditVehicleDialog({ vehicle, onClose, onSaved }: EditVehicleDialogProps) {
  const [make, setMake] = useState(vehicle.make || "");
  const [model, setModel] = useState(vehicle.model || "");
  const [year, setYear] = useState(String(vehicle.year || ""));
  const [color, setColor] = useState(vehicle.color || "");
  const [licence, setLicence] = useState(plateOf(vehicle));
  const [country, setCountry] = useState(vehicle.country || "Ireland");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const yearNum = Number(year);
    if (!make.trim() || !model.trim() || !licence.trim() || !color.trim()) {
      setError("Fill all fields.");
      return;
    }
    if (!Number.isFinite(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
      setError("Enter a valid year.");
      return;
    }
    setBusy(true);
    try {
      await updateVehicle(vehicle.id, {
        make: make.trim(),
        model: model.trim(),
        year: yearNum,
        color: color.trim(),
        licence: licence.trim().toUpperCase().replace(/\s+/g, ""),
        registration_number: licence.trim().toUpperCase().replace(/\s+/g, ""),
        country: country.trim() || "Ireland",
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(authErrorMessage(err, "Could not update this vehicle."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog dialog--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-vehicle-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="edit-vehicle-title">Edit vehicle</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dialog-body">
          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            {error ? (
              <div className="banner banner-error" role="alert">
                {error}
              </div>
            ) : null}
            <label className="field">
              <span>Registration</span>
              <input
                value={licence}
                onChange={(e) => setLicence(e.target.value.toUpperCase())}
                required
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Make</span>
                <input value={make} onChange={(e) => setMake(e.target.value)} required />
              </label>
              <label className="field">
                <span>Model</span>
                <input value={model} onChange={(e) => setModel(e.target.value)} required />
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Year</span>
                <input
                  inputMode="numeric"
                  value={year}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  required
                />
              </label>
              <label className="field">
                <span>Colour</span>
                <input value={color} onChange={(e) => setColor(e.target.value)} required />
              </label>
            </div>
            <label className="field">
              <span>Country</span>
              <input value={country} onChange={(e) => setCountry(e.target.value)} required />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
