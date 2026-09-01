import { useEffect, useState, type FormEvent } from "react";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import { getBranches } from "../store/api/fleetApi";
import { addVehicle, lookupVehicleRegistration } from "../store/api/garageApi";
import type { FleetBranch } from "../types/fleet";
import type { LookupPreview } from "../types/garage";

type WizardStep = "lookup" | "preview" | "manual";

type AddVehicleDialogProps = {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
};

export default function AddVehicleDialog({ open, onClose, onAdded }: AddVehicleDialogProps) {
  const { user } = useAuth();
  const isFleetOwner = Boolean(user?.is_fleet_owner);

  const [step, setStep] = useState<WizardStep>("lookup");
  const [licence, setLicence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<LookupPreview | null>(null);
  const [lookupToken, setLookupToken] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [country, setCountry] = useState("Ireland");

  const [branches, setBranches] = useState<FleetBranch[]>([]);
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("lookup");
    setLicence("");
    setError(null);
    setNotice(null);
    setBusy(false);
    setPreview(null);
    setLookupToken(null);
    setPhoto(null);
    setMake("");
    setModel("");
    setYear("");
    setColor("");
    setCountry("Ireland");
    setBranchId(user?.managed_branch?.id || "");
  }, [open, user?.managed_branch?.id]);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!open || !isFleetOwner) return;
    let cancelled = false;
    void getBranches()
      .then((data) => {
        if (!cancelled) setBranches(data.branches || []);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isFleetOwner]);

  if (!open) return null;

  async function runLookup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const reg = licence.trim().toUpperCase().replace(/\s+/g, "");
    if (!reg) {
      setError("Enter your registration number.");
      return;
    }
    setBusy(true);
    try {
      const data = await lookupVehicleRegistration(reg);
      setLicence(reg);
      setPreview(data.preview);
      setLookupToken(data.lookup_token);
      setStep("preview");
    } catch (err) {
      setError(authErrorMessage(err, "We could not look up this registration."));
    } finally {
      setBusy(false);
    }
  }

  function goManual() {
    setError(null);
    setStep("manual");
    setMake(preview?.make || "");
    setModel(preview?.model || "");
    setYear(preview?.year ? String(preview.year) : "");
  }

  async function confirmLookup(event: FormEvent) {
    event.preventDefault();
    if (!lookupToken) return;
    if (isFleetOwner && !branchId) {
      setError("Select a branch for this vehicle.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("lookup_token", lookupToken);
      if (branchId) form.append("branch_id", branchId);
      if (photo) form.append("image", photo);
      const { data, status } = await addVehicle(form);
      if (status === 201 && data.message) {
        setNotice(data.message);
        return;
      }
      onAdded();
      onClose();
    } catch (err) {
      setError(authErrorMessage(err, "Could not save this vehicle."));
    } finally {
      setBusy(false);
    }
  }

  async function submitManual(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const reg = licence.trim().toUpperCase().replace(/\s+/g, "");
    const yearNum = Number(year);
    if (!make.trim() || !model.trim() || !reg || !color.trim() || !year) {
      setError("Fill make, model, year, colour, and registration.");
      return;
    }
    if (!photo) {
      setError("Add a photo of the vehicle.");
      return;
    }
    if (!Number.isFinite(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
      setError("Enter a valid year.");
      return;
    }
    if (isFleetOwner && !branchId) {
      setError("Select a branch for this vehicle.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("entry_mode", "manual");
      form.append("make", make.trim());
      form.append("model", model.trim());
      form.append("year", String(yearNum));
      form.append("color", color.trim());
      form.append("licence", reg);
      form.append("registration_number", reg);
      form.append("country", country.trim() || "Ireland");
      form.append("image", photo);
      if (branchId) form.append("branch_id", branchId);
      const { data, status } = await addVehicle(form);
      if (status === 201 && data.message) {
        setNotice(data.message);
        return;
      }
      onAdded();
      onClose();
    } catch (err) {
      setError(authErrorMessage(err, "Could not save this vehicle."));
    } finally {
      setBusy(false);
    }
  }

  const branchField = isFleetOwner ? (
    <label className="field">
      <span>Branch</span>
      <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
        <option value="">Select a branch</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.city ? ` · ${branch.city}` : ""}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog dialog--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-vehicle-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="add-vehicle-title">Add a vehicle</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dialog-body">
          {error ? (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="banner banner-ok" role="status">
              {notice}
            </div>
          ) : null}

          {step === "lookup" ? (
            <form className="auth-form" onSubmit={(e) => void runLookup(e)}>
              <p className="muted">
                Irish plates first — we look the car up, then you confirm. Lookup is limited to once
                every five minutes.
              </p>
              <label className="field">
                <span>Registration</span>
                <input
                  value={licence}
                  onChange={(e) => setLicence(e.target.value.toUpperCase())}
                  placeholder="12-D-12345"
                  autoComplete="off"
                  required
                />
              </label>
              {branchField}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "Looking up…" : "Look up"}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={goManual}>
                Enter details manually
              </button>
            </form>
          ) : null}

          {step === "preview" && preview ? (
            <form className="auth-form" onSubmit={(e) => void confirmLookup(e)}>
              <div className="vehicle-preview">
                {preview.image_url || photoUrl ? (
                  <img src={photoUrl || preview.image_url || ""} alt="" />
                ) : (
                  <div className="vehicle-photo-fallback">No photo yet</div>
                )}
                <div>
                  <strong>
                    {preview.year} {preview.make} {preview.model}
                  </strong>
                  <p className="muted">
                    {preview.registration_number}
                    {preview.color ? ` · ${preview.color}` : ""}
                    {preview.body_style ? ` · ${preview.body_style}` : ""}
                  </p>
                </div>
              </div>
              <label className="field">
                <span>Photo (optional — replaces the lookup image)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
              {branchField}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "Saving…" : "Add to garage"}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={goManual}>
                Details look wrong — enter manually
              </button>
            </form>
          ) : null}

          {step === "manual" ? (
            <form className="auth-form" onSubmit={(e) => void submitManual(e)}>
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
              <label className="field">
                <span>Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  required
                />
                {photoUrl ? <img className="photo-thumb" src={photoUrl} alt="" /> : null}
              </label>
              {branchField}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "Saving…" : "Add to garage"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => {
                  setError(null);
                  setStep("lookup");
                }}
              >
                Back to lookup
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
