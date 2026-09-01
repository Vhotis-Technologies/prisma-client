import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AppShell from "../components/AppShell";
import BranchDialog from "../components/BranchDialog";
import InviteAdminDialog from "../components/InviteAdminDialog";
import { getBranches, getFleetAdmins, resendInvite } from "../store/api/fleetApi";
import { formatMoney } from "../lib/format";
import type { FleetAdmin, FleetBranch } from "../types/fleet";

export default function BranchesPage() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const [branches, setBranches] = useState<FleetBranch[]>([]);
  const [admins, setAdmins] = useState<FleetAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FleetBranch | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBranchId, setInviteBranchId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [branchRes, adminRes] = await Promise.all([getBranches(), getFleetAdmins()]);
      setBranches(branchRes.branches || []);
      setAdmins(adminRes.admins || []);
    } catch (err) {
      setError(authErrorMessage(err, "Could not load branches."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resend(admin: FleetAdmin) {
    setResendingId(admin.id);
    setError(null);
    setOk(null);
    try {
      await resendInvite(admin.id);
      setOk(`Invite resent to ${admin.email}.`);
    } catch (err) {
      setError(authErrorMessage(err, "Could not resend that invite."));
    } finally {
      setResendingId(null);
    }
  }

  if (!user?.is_fleet_owner) {
    return (
      <AppShell>
        <section className="welcome">
          <p className="kicker">
            <Link to="/dashboard">Dashboard</Link>
          </p>
          <h1 className="page-title">Branches</h1>
          <p className="lede">Only fleet owners can create branches and invite admins.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">
            <Link to="/dashboard">Dashboard</Link>
          </p>
          <h1 className="page-title">Branches</h1>
          <p className="lede">Add locations, set spend caps, and invite branch admins by email.</p>
        </div>
        <div className="vehicle-card-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setInviteBranchId(null);
              setInviteOpen(true);
            }}
            disabled={branches.length === 0}
          >
            Invite admin
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Add branch
          </button>
        </div>
      </section>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="banner banner-ok" role="status">
          {ok}
        </div>
      ) : null}

      {loading ? <p className="muted">Loading branches…</p> : null}

      {!loading && branches.length === 0 ? (
        <section className="card">
          <h2>No branches yet</h2>
          <p className="muted">Create a branch first, then invite an admin to run it.</p>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Add a branch
            </button>
          </div>
        </section>
      ) : null}

      {branches.length > 0 ? (
        <ul className="address-list">
          {branches.map((branch) => (
            <li key={branch.id} className="address-card">
              <div>
                <strong>{branch.name}</strong>
                <p className="muted">
                  {[branch.address, branch.city, branch.postcode].filter(Boolean).join(", ") || "No address on file"}
                </p>
                <p className="muted">
                  {branch.vehicle_count ?? 0} vehicles · {branch.admin_count ?? 0} admins
                </p>
                <p className="muted">
                  {branch.spend_limit != null && branch.spend_limit > 0
                    ? `Limit ${formatMoney(branch.spend_limit, country)} ${branch.spend_limit_period || ""} · spent ${formatMoney(branch.spent ?? 0, country)}`
                    : "No spend limit"}
                </p>
              </div>
              <div className="vehicle-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditing(branch);
                    setDialogOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setInviteBranchId(branch.id);
                    setInviteOpen(true);
                  }}
                >
                  Invite
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="welcome welcome--split">
        <div>
          <h2 className="section-title">Branch admins</h2>
          <p className="muted">Pending invites expire; resend if they did not get the email.</p>
        </div>
      </section>

      {!loading && admins.length === 0 ? (
        <section className="card">
          <h2>No admins yet</h2>
          <p className="muted">Invite someone after you have at least one branch.</p>
        </section>
      ) : null}

      {admins.length > 0 ? (
        <ul className="address-list">
          {admins.map((admin) => (
            <li key={admin.id} className="address-card">
              <div>
                <strong>{admin.name}</strong>
                <p className="muted">
                  {admin.email}
                  {admin.phone ? ` · ${admin.phone}` : ""}
                </p>
                <p className="muted">{admin.branch_name}</p>
              </div>
              <div className="vehicle-card-actions">
                {admin.invite_pending ? (
                  <>
                    <span className="pill pill-pending">Invite pending</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void resend(admin)}
                      disabled={resendingId === admin.id}
                    >
                      {resendingId === admin.id ? "Sending…" : "Resend"}
                    </button>
                  </>
                ) : (
                  <span className="pill pill-ok">Active</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <BranchDialog
        open={dialogOpen}
        initial={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setOk(editing ? "Branch updated." : "Branch created.");
          void load();
        }}
      />

      <InviteAdminDialog
        open={inviteOpen}
        branches={branches}
        defaultBranchId={inviteBranchId}
        onClose={() => {
          setInviteOpen(false);
          setInviteBranchId(null);
        }}
        onSaved={() => {
          setOk("Invitation sent. They will get an email to set a password.");
          void load();
        }}
      />
    </AppShell>
  );
}
