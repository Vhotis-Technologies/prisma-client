import { useEffect, useState, type FormEvent } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import AddressSearchInput from "./AddressSearchInput";
import { addAddress, updateAddress } from "../store/api/profileApi";
import type { SavedAddress } from "../types/address";
import type { BusinessAddress } from "../types/user";

type AddressDialogProps = {
  open: boolean;
  initial?: SavedAddress | null;
  onClose: () => void;
  onSaved: () => void;
};

function toForm(initial?: SavedAddress | null): BusinessAddress | null {
  if (!initial) return null;
  return {
    address: initial.address || "",
    post_code: initial.post_code || "",
    city: initial.city || "",
    country: initial.country || "",
    latitude: initial.latitude ?? undefined,
    longitude: initial.longitude ?? undefined,
  };
}

export default function AddressDialog({ open, initial, onClose, onSaved }: AddressDialogProps) {
  const [value, setValue] = useState<BusinessAddress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    setValue(toForm(initial));
    setError(null);
    setBusy(false);
  }, [open, initial]);

  if (!open) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!value?.address?.trim() || !value.city?.trim() || !value.country?.trim()) {
      setError("Street, city, and country are required.");
      return;
    }
    setBusy(true);
    const payload = {
      address: value.address.trim(),
      post_code: value.post_code?.trim() || "",
      city: value.city.trim(),
      country: value.country.trim(),
      latitude: value.latitude ?? null,
      longitude: value.longitude ?? null,
    };
    try {
      if (editing && initial) {
        await updateAddress({ id: initial.id, ...payload });
      } else {
        await addAddress(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(authErrorMessage(err, "Could not save this address."));
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
        aria-labelledby="address-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="address-dialog-title">{editing ? "Edit address" : "Add address"}</h2>
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
            <AddressSearchInput
              label="Search address"
              placeholder="Start typing your address"
              value={value}
              onSelect={setValue}
              onClear={() => setValue(null)}
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Save address"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
