import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import { HorizontalBars, SpendTrendChart } from "./charts";
import { getBranches, getFleetDashboard } from "../store/api/fleetApi";
import { bookingActivityBars, branchSpendBars, daysAgo, isoDay, spendTrendSeries } from "../lib/fleetCharts";
import { formatDate, formatMoney, formatStatus } from "../lib/format";
import type { FleetBranch, FleetDashboardResponse } from "../types/fleet";

export default function FleetDashboard() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const [startDate, setStartDate] = useState(() => daysAgo(30));
  const [endDate, setEndDate] = useState(() => isoDay(new Date()));
  const [data, setData] = useState<FleetDashboardResponse | null>(null);
  const [branches, setBranches] = useState<FleetBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, branchRes] = await Promise.all([
        getFleetDashboard(startDate, endDate),
        getBranches(),
      ]);
      setData(dashRes);
      setBranches(branchRes.branches?.length ? branchRes.branches : dashRes.branches || []);
    } catch (err) {
      setError(authErrorMessage(err, "Could not load the fleet dashboard."));
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const spendBars = useMemo(() => branchSpendBars(data?.analytics), [data?.analytics]);
  const trendSeries = useMemo(() => spendTrendSeries(data?.analytics), [data?.analytics]);
  const activityBars = useMemo(() => bookingActivityBars(data?.analytics), [data?.analytics]);
  const list = branches.length ? branches : data?.branches || [];

  return (
    <div className="dash-stack">
      {data?.fleet.name ? (
        <section className="welcome welcome--split">
          <p className="muted fleet-name">{data.fleet.name}</p>
          <div className="card-actions">
            <Link to="/branches" className="btn btn-secondary">
              Manage branches
            </Link>
            <Link to="/settings/invoices" className="btn btn-secondary">
              Invoices
            </Link>
          </div>
        </section>
      ) : null}

      <form
        className="date-range"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label className="field">
          <span>From</span>
          <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={endDate} min={startDate} max={isoDay(new Date())} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-secondary" disabled={loading}>
          {loading ? "Loading…" : "Update"}
        </button>
      </form>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="stat-grid stat-grid--3">
        <article className="stat-card">
          <p className="stat-label">Vehicles</p>
          <p className="stat-value">{data ? data.stats.total_vehicles : loading ? "…" : "—"}</p>
          <p className="muted">In the fleet</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Bookings</p>
          <p className="stat-value">{data ? data.stats.total_bookings : loading ? "…" : "—"}</p>
          <p className="muted">All time</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Branches</p>
          <p className="stat-value">{data ? data.stats.total_branches : loading ? "…" : "—"}</p>
          <p className="muted">Locations</p>
        </article>
      </section>

      <section className="card">
        <h2>Spend by branch</h2>
        <p className="muted">Net spend in the selected dates.</p>
        {loading && !data ? <p className="muted">Loading chart…</p> : null}
        {!loading && spendBars.length === 0 ? <p className="muted">No spend in this range yet.</p> : null}
        {spendBars.length > 0 ? (
          <HorizontalBars items={spendBars} formatValue={(value) => formatMoney(value, country)} />
        ) : null}
      </section>

      <section className="card">
        <h2>Spend over time</h2>
        <p className="muted">Daily spend per branch.</p>
        {loading && !data ? <p className="muted">Loading chart…</p> : null}
        {!loading && trendSeries.length === 0 ? <p className="muted">No trend data in this range.</p> : null}
        {trendSeries.length > 0 ? <SpendTrendChart series={trendSeries} /> : null}
      </section>

      <section className="card">
        <h2>Booking activity</h2>
        <p className="muted">Counts by status in the selected dates.</p>
        {loading && !data ? <p className="muted">Loading chart…</p> : null}
        {!loading && activityBars.length === 0 ? <p className="muted">No bookings in this range yet.</p> : null}
        {activityBars.length > 0 ? <HorizontalBars items={activityBars} /> : null}
      </section>

      <section className="card">
        <div className="card-row">
          <div>
            <h2>Branches</h2>
            <p className="muted">Create locations and invite admins from the branches page.</p>
          </div>
          <Link to="/branches" className="btn btn-primary">
            Manage
          </Link>
        </div>
        {list.length === 0 ? (
          <p className="muted">No branches yet. Add one to invite a branch admin.</p>
        ) : (
          <ul className="address-list">
            {list.map((branch) => (
              <li key={branch.id} className="address-card">
                <div>
                  <strong>{branch.name}</strong>
                  <p className="muted">
                    {[branch.address, branch.city, branch.postcode].filter(Boolean).join(", ") || "No address on file"}
                  </p>
                  <p className="muted">
                    {branch.vehicle_count ?? 0} vehicles
                    {branch.booking_count != null ? ` · ${branch.booking_count} bookings` : ""}
                    {branch.admin_count != null ? ` · ${branch.admin_count} admins` : ""}
                  </p>
                  <p className="muted">
                    {branch.spend_limit != null && branch.spend_limit > 0
                      ? `Spent ${formatMoney(branch.spent ?? 0, country)} · left ${
                          branch.remaining != null ? formatMoney(branch.remaining, country) : "—"
                        } (${branch.spend_limit_period || "period"})`
                      : "No spend limit"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data?.recent_bookings?.length ? (
        <section className="card">
          <h2>Recent bookings</h2>
          <ul className="booking-list">
            {data.recent_bookings.map((booking) => (
              <li key={booking.id} className="booking-item">
                <div className="booking-item-top">
                  <strong>{booking.service_type || "Service"}</strong>
                  <span className={`pill ${booking.status === "completed" ? "pill-ok" : "pill-pending"}`}>
                    {formatStatus(booking.status)}
                  </span>
                </div>
                <p>{formatDate(String(booking.appointment_date).slice(0, 10))}</p>
                <p className="muted">{booking.vehicle_reg || "Vehicle"}</p>
                <p className="booking-meta">
                  {formatMoney(booking.total_amount || 0, country)}
                  {booking.booking_reference ? ` · ${booking.booking_reference}` : ""}
                </p>
              </li>
            ))}
          </ul>
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
