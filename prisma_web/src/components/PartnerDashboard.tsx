import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import { getPartnerDashboard } from "../store/api/partnerApi";
import { formatMoney } from "../lib/format";
import type { PartnerDashboardResponse } from "../types/partner";

function conversionPercent(rate: number): string {
  const value = rate <= 1 ? rate * 100 : rate;
  return `${Math.round(value)}%`;
}

export default function PartnerDashboard() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const [data, setData] = useState<PartnerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getPartnerDashboard();
      setData(payload);
    } catch (err) {
      setError(authErrorMessage(err, "Could not load the partner dashboard."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyCode() {
    const code = data?.partner.referral_code;
    if (!code) return;
    const message = `Get one free basic wash and 40% off washes for 60 days! Use my partner code: ${code}`;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the referral code.");
    }
  }

  if (loading && !data) {
    return <p className="muted">Loading partner dashboard…</p>;
  }

  if (error && !data) {
    return (
      <section className="card">
        <div className="banner banner-error" role="alert">
          {error}
        </div>
        <div className="card-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!data) return null;

  return (
    <div className="dash-stack">
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="welcome welcome--split">
        <p className="muted fleet-name">{data.partner.business_name}</p>
        <div className="card-actions">
          <Link to="/payouts" className="btn btn-secondary">
            Payouts
          </Link>
          <Link to="/settings/invoices" className="btn btn-secondary">
            Invoices
          </Link>
        </div>
      </section>

      <section className="card">
        <p className="stat-label">Your referral code</p>
        <div className="card-row">
          <p className="stat-value referral-code">{data.partner.referral_code}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void copyCode()}>
            {copied ? "Copied" : "Copy invite"}
          </button>
        </div>
        <p className="muted">Share this code so new customers get a welcome offer and you earn commission.</p>
      </section>

      <section className="stat-grid stat-grid--3">
        <article className="stat-card">
          <p className="stat-label">Referred</p>
          <p className="stat-value">{data.referral_metrics.total_referred}</p>
          <p className="muted">Total customers</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Active</p>
          <p className="stat-value">{data.referral_metrics.active}</p>
          <p className="muted">Booked in the last 90 days</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Vehicles</p>
          <p className="stat-value">{data.referral_metrics.vehicles_registered}</p>
          <p className="muted">Registered by referrals</p>
        </article>
      </section>

      <section className="card">
        <h2>Referral metrics</h2>
        <dl className="meta">
          <div>
            <dt>Conversion</dt>
            <dd>{conversionPercent(data.referral_metrics.conversion_rate)}</dd>
          </div>
          <div>
            <dt>Inactive</dt>
            <dd>{data.referral_metrics.inactive}</dd>
          </div>
          <div>
            <dt>Churned</dt>
            <dd>{data.referral_metrics.churned}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2>Activity</h2>
        <dl className="meta">
          <div>
            <dt>Completed</dt>
            <dd>{data.activity_metrics.completed}</dd>
          </div>
          <div>
            <dt>Cancelled</dt>
            <dd>{data.activity_metrics.cancelled}</dd>
          </div>
          <div>
            <dt>Revenue (referred)</dt>
            <dd>{formatMoney(data.activity_metrics.revenue_total, country)}</dd>
          </div>
          <div>
            <dt>This month</dt>
            <dd>{formatMoney(data.activity_metrics.revenue_this_month, country)}</dd>
          </div>
          <div>
            <dt>Last month</dt>
            <dd>{formatMoney(data.activity_metrics.revenue_last_month, country)}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <div className="card-row">
          <h2>Commission</h2>
          <span className="pill pill-pending">{data.commission.commission_rate}% rate</span>
        </div>
        <dl className="meta">
          <div>
            <dt>Total earned</dt>
            <dd>{formatMoney(data.commission.total_earned, country)}</dd>
          </div>
          <div>
            <dt>Pending</dt>
            <dd>{formatMoney(data.commission.pending, country)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{formatMoney(data.commission.paid, country)}</dd>
          </div>
        </dl>
        <div className="card-actions">
          <Link to="/payouts" className="btn btn-primary">
            Request a payout
          </Link>
        </div>
      </section>

      {data.vehicle_insights.total_vehicles > 0 ? (
        <section className="card">
          <h2>Vehicle insights</h2>
          <dl className="meta">
            <div>
              <dt>Total vehicles</dt>
              <dd>{data.vehicle_insights.total_vehicles}</dd>
            </div>
            <div>
              <dt>No booking activity</dt>
              <dd>{data.vehicle_insights.no_booking_activity}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <div className="card-actions">
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}
