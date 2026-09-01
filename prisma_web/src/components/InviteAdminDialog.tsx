import { useEffect, useState, type FormEvent } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import { createBranchAdmin } from "../store/api/fleetApi";
import type { FleetBranch } from "../types/fleet";

type InviteAdminDialogProps = {
  open: boolean;
  branches: FleetBranch[];
  defaultBranchId?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function InviteAdminDialog({
  open,
  branches,
  defaultBranchId,
  onClose,
  onSaved,
}: InviteAdminDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPhone("");
    setBranchId(defaultBranchId || branches[0]?.id || "");
    setError(null);
    setBusy(false);
  }, [open, defaultBranchId, branches]);

  if (!open) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim() || !branchId) {
      setError("Name, email, phone, and branch are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createBranchAdmin({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        branch_id: branchId,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(authErrorMessage(err, "Could not send this invitation."));
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
        aria-labelledby="invite-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="invite-dialog-title">Invite a branch admin</h2>
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
            <p className="muted">They get an email to set a password on this web app, then they can sign in.</p>
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={15} required />
            </label>
            <label className="field">
              <span>Branch</span>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
                <option value="" disabled>
                  Select a branch
                </option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || branches.length === 0}>
              {busy ? "Sending…" : "Send invite"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
