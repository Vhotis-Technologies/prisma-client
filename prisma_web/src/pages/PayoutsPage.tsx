import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AppShell from "../components/AppShell";
import {
  createPayoutRequest,
  getPayoutDetails,
  getPayoutHistory,
  updatePayoutDetails,
} from "../store/api/partnerApi";
import { formatDateTime, formatMoney, formatStatus, isDealershipPartner } from "../lib/format";
import type { PartnerPayoutDetails, PartnerPayoutHistoryItem } from "../types/partner";

export default function PayoutsPage() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const allowed = isDealershipPartner(user);

  const [details, setDetails] = useState<PartnerPayoutDetails | null>(null);
  const [history, setHistory] = useState<PartnerPayoutHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [detailsRes, historyRes] = await Promise.all([getPayoutDetails(), getPayoutHistory()]);
      setDetails(detailsRes);
      setHistory(historyRes.payout_requests || []);
      if (!detailsRes.bank_account?.has_bank_account) setEditing(true);
    } catch (err) {
      setError(authErrorMessage(err, "Could not load payout details."));
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) {
    return (
      <AppShell>
        <section className="welcome">
          <p className="kicker">
            <Link to="/dashboard">Dashboard</Link>
          </p>
          <h1 className="page-title">Payouts</h1>
          <p className="lede">Payouts are for dealership partner accounts.</p>
        </section>
      </AppShell>
    );
  }

  const pending = details?.pending_commission ?? 0;
  const bank = details?.bank_account;
  const hasBank = Boolean(bank?.has_bank_account);

  async function saveBank(event: FormEvent) {
    event.preventDefault();
    const name = holder.trim();
    const ibanVal = iban.trim().replace(/\s/g, "");
    if (!name || !ibanVal) {
      setError("Fill in account holder name and IBAN.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const data = await updatePayoutDetails({
        account_holder_name: name,
        iban: ibanVal,
      });
      setDetails(data);
      setEditing(false);
      setHolder("");
      setIban("");
      setOk("Bank account saved.");
    } catch (err) {
      setError(authErrorMessage(err, "Could not save bank details."));
    } finally {
      setBusy(false);
    }
  }

  async function requestPayout() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const data = await createPayoutRequest();
      setOk(data.message || "Payout request submitted.");
      await load();
    } catch (err) {
      setError(authErrorMessage(err, "Could not submit a payout request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <section className="welcome">
        <p className="kicker">
          <Link to="/dashboard">Dashboard</Link> · Partner
        </p>
        <h1 className="page-title">Payouts</h1>
        <p className="lede">Request commission payouts and keep your bank details up to date.</p>
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

      {loading ? <p className="muted">Loading payout details…</p> : null}

      <section className="card">
        <p className="stat-label">Available balance</p>
        <p className="stat-value">{formatMoney(pending, country)}</p>
        <p className="muted">Request a payout to receive approved commission. Processed within 24 hours.</p>
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void requestPayout()}
            disabled={busy || pending <= 0}
          >
            {busy ? "Working…" : "Request payout"}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-row">
          <h2>Bank account</h2>
          {hasBank && !editing ? (
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
              Update
            </button>
          ) : null}
        </div>
        {hasBank && !editing ? (
          <dl className="meta">
            <div>
              <dt>Account holder</dt>
              <dd>{bank?.account_holder_name || "—"}</dd>
            </div>
            <div>
              <dt>IBAN</dt>
              <dd>{bank?.iban_masked || "—"}</dd>
            </div>
          </dl>
        ) : (
          <form onSubmit={(event) => void saveBank(event)}>
            <label className="field">
              <span>Account holder name</span>
              <input
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
            <label className="field">
              <span>IBAN</span>
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                autoComplete="off"
                placeholder="IE29 AIBK 9311 5212 3456 78"
                required
              />
            </label>
            <div className="card-actions">
              {hasBank ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditing(false);
                    setHolder("");
                    setIban("");
                  }}
                >
                  Cancel
                </button>
              ) : null}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save bank details"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Payout history</h2>
        {history.length === 0 ? (
          <p className="muted">No payout requests yet.</p>
        ) : (
          <ul className="booking-list">
            {history.map((item) => (
              <li key={item.id} className="booking-item">
                <div className="booking-item-top">
                  <strong>{formatMoney(item.amount_requested, country)}</strong>
                  <span className={`pill ${item.status === "paid" ? "pill-ok" : "pill-pending"}`}>
                    {formatStatus(item.status) || item.status}
                  </span>
                </div>
                <p className="muted">
                  {item.status === "paid" && item.paid_at
                    ? `Paid ${formatDateTime(item.paid_at)}`
                    : item.requested_at
                      ? `Requested ${formatDateTime(item.requested_at)}`
                      : "Requested"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
