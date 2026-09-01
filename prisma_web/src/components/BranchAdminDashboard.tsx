import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import { fetchRecentServices, fetchUpcomingAppointments, fetchUserStats } from "../store/api/dashboardApi";
import { getBranchSpend, getBranchVehicles } from "../store/api/fleetApi";
import { formatDate, formatMoney, formatStatus, vehicleLabel } from "../lib/format";
import type { RecentService, UpcomingAppointment, UserStats } from "../types/dashboard";
import type { BranchSpend, BranchVehicle } from "../types/fleet";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

type BookingScope = "branch" | "mine";

function addressLine(appointment: UpcomingAppointment): string {
  const parts = [
    appointment.address?.address,
    appointment.address?.city,
    appointment.address?.post_code,
  ].filter(Boolean);
  return parts.join(", ") || "Address to be confirmed";
}

function periodLabel(period: BranchSpend["spend_limit_period"]): string {
  if (period === "weekly") return "Weekly";
  if (period === "monthly") return "Monthly";
  return "Spend";
}

function spendPercent(spend: BranchSpend): number {
  if (spend.spend_limit == null || spend.spend_limit <= 0) return 0;
  return Math.min(100, Math.round((spend.spent / spend.spend_limit) * 100));
}

export default function BranchAdminDashboard() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const [bookingScope, setBookingScope] = useState<BookingScope>("branch");
  const [spend, setSpend] = useState<LoadState<BranchSpend>>({ status: "loading" });
  const [stats, setStats] = useState<LoadState<UserStats>>({ status: "loading" });
  const [upcoming, setUpcoming] = useState<LoadState<UpcomingAppointment[]>>({ status: "loading" });
  const [recent, setRecent] = useState<LoadState<RecentService | null>>({ status: "loading" });
  const [vehicles, setVehicles] = useState<LoadState<BranchVehicle[]>>({ status: "loading" });
  const [branchName, setBranchName] = useState(user?.managed_branch?.name || "Your branch");

  const loadUpcoming = useCallback(async () => {
    setUpcoming({ status: "loading" });
    try {
      const data = await fetchUpcomingAppointments(bookingScope === "mine" ? "my_bookings" : undefined);
      setUpcoming({ status: "ok", data: data ?? [] });
    } catch (err) {
      setUpcoming({
        status: "error",
        message: authErrorMessage(err, "Could not load upcoming bookings."),
      });
    }
  }, [bookingScope]);

  const load = useCallback(async () => {
    setSpend({ status: "loading" });
    setStats({ status: "loading" });
    setRecent({ status: "loading" });
    setVehicles({ status: "loading" });

    const [spendRes, statsRes, recentRes] = await Promise.allSettled([
      getBranchSpend(),
      fetchUserStats(),
      fetchRecentServices(),
    ]);

    let branchId = user?.managed_branch?.id || "";

    if (spendRes.status === "fulfilled") {
      const payload = spendRes.value;
      setSpend({ status: "ok", data: payload });
      if (payload.branch_id) branchId = payload.branch_id;
    } else {
      setSpend({
        status: "error",
        message: authErrorMessage(spendRes.reason, "Could not load branch spend."),
      });
    }

    if (statsRes.status === "fulfilled") {
      setStats({ status: "ok", data: statsRes.value });
    } else {
      setStats({
        status: "error",
        message: authErrorMessage(statsRes.reason, "Could not load stats."),
      });
    }

    if (recentRes.status === "fulfilled") {
      setRecent({ status: "ok", data: recentRes.value ?? null });
    } else {
      setRecent({
        status: "error",
        message: authErrorMessage(recentRes.reason, "Could not load recent service."),
      });
    }

    if (!branchId) {
      setVehicles({
        status: "error",
        message: "No managed branch found for this account.",
      });
      return;
    }

    try {
      const data = await getBranchVehicles(branchId);
      if (data.branch?.name) setBranchName(data.branch.name);
      setVehicles({ status: "ok", data: data.vehicles ?? [] });
    } catch (err) {
      setVehicles({
        status: "error",
        message: authErrorMessage(err, "Could not load branch vehicles."),
      });
    }
  }, [user?.managed_branch?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadUpcoming();
  }, [loadUpcoming]);

  const refresh = () => {
    void load();
    void loadUpcoming();
  };

  const hasLimit =
    spend.status === "ok" && spend.data.spend_limit != null && spend.data.spend_limit > 0;

  return (
    <div className="dash-stack">
      <section className="welcome welcome--split">
        <p className="muted fleet-name">{branchName}</p>
        <Link to="/settings/invoices" className="btn btn-secondary">
          Invoices
        </Link>
      </section>

      <section className="card">
        <div className="card-row">
          <h2>Branch spending</h2>
          {hasLimit ? (
            <span className="pill pill-pending">{periodLabel(spend.data.spend_limit_period)} limit</span>
          ) : null}
        </div>
        {spend.status === "loading" ? <p className="muted">Loading spend…</p> : null}
        {spend.status === "error" ? (
          <p className="banner banner-error" role="alert">
            {spend.message}
          </p>
        ) : null}
        {spend.status === "ok" && !hasLimit ? (
          <p className="muted">No spending limit set for your branch.</p>
        ) : null}
        {spend.status === "ok" && hasLimit ? (
          <>
            <div className="spend-row">
              <span>Spent</span>
              <strong>{formatMoney(spend.data.spent, country)}</strong>
            </div>
            <div className="spend-row">
              <span>Remaining</span>
              <strong>
                {spend.data.remaining != null ? formatMoney(spend.data.remaining, country) : "—"}
              </strong>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${spendPercent(spend.data)}%` }} />
            </div>
            <p className="muted">
              {formatMoney(spend.data.spent, country)} of {formatMoney(spend.data.spend_limit || 0, country)}
            </p>
          </>
        ) : null}
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <p className="stat-label">This month</p>
          <p className="stat-value">
            {stats.status === "ok" ? stats.data.services_this_month : stats.status === "error" ? "—" : "…"}
          </p>
          <p className="muted">Services at this branch</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">This year</p>
          <p className="stat-value">
            {stats.status === "ok" ? stats.data.services_this_year : stats.status === "error" ? "—" : "…"}
          </p>
          <p className="muted">Services at this branch</p>
        </article>
      </section>
      {stats.status === "error" ? (
        <p className="banner banner-error" role="alert">
          {stats.message}
        </p>
      ) : null}

      <section className="card">
        <div className="card-heading">
          <h2>Upcoming</h2>
          {upcoming.status === "ok" ? (
            <span className="pill pill-pending" aria-label={`${upcoming.data.length} upcoming bookings`}>
              {upcoming.data.length}
            </span>
          ) : null}
        </div>
        <div className="photo-tabs" role="tablist" aria-label="Upcoming bookings">
          <button
            type="button"
            role="tab"
            className={`photo-tab${bookingScope === "branch" ? " is-selected" : ""}`}
            aria-selected={bookingScope === "branch"}
            onClick={() => setBookingScope("branch")}
          >
            This branch
          </button>
          <button
            type="button"
            role="tab"
            className={`photo-tab${bookingScope === "mine" ? " is-selected" : ""}`}
            aria-selected={bookingScope === "mine"}
            onClick={() => setBookingScope("mine")}
          >
            My bookings
          </button>
        </div>
        {upcoming.status === "loading" ? <p className="muted">Loading bookings…</p> : null}
        {upcoming.status === "error" ? (
          <p className="banner banner-error" role="alert">
            {upcoming.message}
          </p>
        ) : null}
        {upcoming.status === "ok" && upcoming.data.length === 0 ? (
          <p className="muted">
            {bookingScope === "mine"
              ? "You have no upcoming bookings."
              : "No upcoming bookings at this branch."}
          </p>
        ) : null}
        {upcoming.status === "ok" && upcoming.data.length > 0 ? (
          <ul className="booking-list">
            {upcoming.data.map((job) => (
              <li key={job.booking_reference} className="booking-item">
                <div className="booking-item-top">
                  <strong>
                    {job.service_type?.name || "Service"}
                    {job.valet_type?.name ? ` · ${job.valet_type.name}` : ""}
                    {job.is_bulk && job.number_of_vehicles
                      ? ` · ${job.number_of_vehicles} vehicles`
                      : ""}
                  </strong>
                  <span
                    className={`pill ${job.status === "confirmed" || job.status === "scheduled" ? "pill-ok" : "pill-pending"}`}
                  >
                    {formatStatus(job.status) || "Scheduled"}
                  </span>
                </div>
                <p>
                  {formatDate(job.booking_date)}
                  {job.start_time ? ` · ${job.start_time}` : ""}
                  {job.end_time ? `–${job.end_time}` : ""}
                </p>
                <p className="muted">{vehicleLabel(job.vehicle)}</p>
                <p className="muted">{addressLine(job)}</p>
                <p className="booking-meta">
                  {formatMoney(job.total_amount || 0, country)}
                  {job.estimated_duration ? ` · ${job.estimated_duration}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card">
        <h2>Recent service</h2>
        {recent.status === "loading" ? <p className="muted">Loading…</p> : null}
        {recent.status === "error" ? (
          <p className="banner banner-error" role="alert">
            {recent.message}
          </p>
        ) : null}
        {recent.status === "ok" && !recent.data ? (
          <p className="muted">No completed services at this branch yet.</p>
        ) : null}
        {recent.status === "ok" && recent.data ? (
          <div className="booking-item booking-item--flush">
            <div className="booking-item-top">
              <strong>
                {recent.data.service_type || "Service"}
                {recent.data.valet_type ? ` · ${recent.data.valet_type}` : ""}
              </strong>
              <span className="pill pill-ok">{formatStatus(recent.data.status)}</span>
            </div>
            <p>{formatDate(recent.data.date)}</p>
            <p className="muted">{recent.data.vehicle_name}</p>
            <p className="booking-meta">
              {formatMoney(recent.data.cost || 0, country)}
              {recent.data.detailer?.name ? ` · ${recent.data.detailer.name}` : ""}
            </p>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>Vehicles</h2>
          {vehicles.status === "ok" ? (
            <span className="pill pill-pending" aria-label={`${vehicles.data.length} vehicles`}>
              {vehicles.data.length}
            </span>
          ) : null}
        </div>
        {vehicles.status === "loading" ? <p className="muted">Loading vehicles…</p> : null}
        {vehicles.status === "error" ? (
          <p className="banner banner-error" role="alert">
            {vehicles.message}
          </p>
        ) : null}
        {vehicles.status === "ok" && vehicles.data.length === 0 ? (
          <p className="muted">No vehicles at this branch yet.</p>
        ) : null}
        {vehicles.status === "ok" && vehicles.data.length > 0 ? (
          <ul className="vehicle-grid">
            {vehicles.data.map((vehicle) => (
              <li key={vehicle.id} className="vehicle-card">
                <div className="vehicle-card-body">
                  <strong>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </strong>
                  <p className="muted">{vehicle.registration_number || "No plate"}</p>
                  <p className="muted">
                    {[vehicle.color, vehicle.body_style, vehicle.country].filter(Boolean).join(" · ")}
                  </p>
                  {vehicle.current_owner ? (
                    <p className="muted">Owner: {vehicle.current_owner}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="card-actions">
        <button type="button" className="btn btn-secondary" onClick={refresh}>
          Refresh
        </button>
      </div>
    </div>
  );
}
