import { useEffect, useState, type FormEvent } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import AddressSearchInput from "./AddressSearchInput";
import { createBranch, updateBranch } from "../store/api/fleetApi";
import type { FleetBranch } from "../types/fleet";
import type { BusinessAddress } from "../types/user";

type BranchDialogProps = {
  open: boolean;
  initial?: FleetBranch | null;
  onClose: () => void;
  onSaved: () => void;
};

function toAddress(initial?: FleetBranch | null): BusinessAddress | null {
  if (!initial?.address && !initial?.city) return null;
  return {
    address: initial?.address || "",
    post_code: initial?.postcode || "",
    city: initial?.city || "",
    country: initial?.country || "",
    latitude: initial?.latitude ?? undefined,
    longitude: initial?.longitude ?? undefined,
  };
}

export default function BranchDialog({ open, initial, onClose, onSaved }: BranchDialogProps) {
  const editing = Boolean(initial?.id);
  const [name, setName] = useState("");
  const [address, setAddress] = useState<BusinessAddress | null>(null);
  const [spendLimit, setSpendLimit] = useState("");
  const [period, setPeriod] = useState<"weekly" | "monthly" | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || "");
    setAddress(toAddress(initial));
    setSpendLimit(
      initial?.spend_limit != null && initial.spend_limit > 0 ? String(initial.spend_limit) : "",
    );
    setPeriod(initial?.spend_limit_period || "");
    setError(null);
    setBusy(false);
  }, [open, initial]);

  if (!open) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Branch name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {
      name: trimmed,
      address: address?.address?.trim() || "",
      postcode: address?.post_code?.trim() || "",
      city: address?.city?.trim() || "",
      country: address?.country?.trim() || "",
      latitude: address?.latitude ?? null,
      longitude: address?.longitude ?? null,
    };
    try {
      if (editing && initial) {
        const limitValue = spendLimit.trim() === "" ? 0 : Number(spendLimit);
        if (Number.isNaN(limitValue) || limitValue < 0) {
          setError("Spend limit must be a number of 0 or more.");
          setBusy(false);
          return;
        }
        payload.spend_limit = limitValue;
        payload.spend_limit_period = limitValue > 0 ? period || "monthly" : "";
        await updateBranch(initial.id, payload);
      } else {
        await createBranch(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(authErrorMessage(err, "Could not save this branch."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog dialog--form dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="branch-dialog-title">{editing ? "Edit branch" : "Add branch"}</h2>
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
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <AddressSearchInput
              label="Branch address"
              placeholder="Search the branch address"
              value={address}
              onSelect={setAddress}
              onClear={() => setAddress(null)}
            />
            {editing ? (
              <div className="field-grid">
                <label className="field">
                  <span>Spend limit</span>
                  <input
                    inputMode="decimal"
                    value={spendLimit}
                    onChange={(e) => setSpendLimit(e.target.value)}
                    placeholder="0 for no limit"
                  />
                </label>
                <label className="field">
                  <span>Period</span>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as "weekly" | "monthly" | "")}
                    disabled={!spendLimit || Number(spendLimit) <= 0}
                  >
                    <option value="">None</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
              </div>
            ) : null}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create branch"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
