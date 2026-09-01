import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AppShell from "../components/AppShell";
import BranchAdminDashboard from "../components/BranchAdminDashboard";
import FleetDashboard from "../components/FleetDashboard";
import PartnerDashboard from "../components/PartnerDashboard";
import { useConsumerDashboard } from "../app-hooks/useDashboard";
import {
  firstName,
  formatDate,
  formatMoney,
  formatStatus,
  isBusinessAccount,
  isDealershipPartner,
  roleLabel,
  vehicleLabel,
} from "../lib/format";
import type {
  LoyaltyProgress,
  SubscriptionComplimentary,
  UpcomingAppointment,
} from "../types/dashboard";

const TIER_LABEL: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

function addressLine(appointment: UpcomingAppointment): string {
  const parts = [
    appointment.address?.address,
    appointment.address?.city,
    appointment.address?.post_code,
  ].filter(Boolean);
  return parts.join(", ") || "Address to be confirmed";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const fleetOwner = Boolean(user?.is_fleet_owner);
  const branchAdmin = Boolean(user?.is_branch_admin);
  const partner = isDealershipPartner(user);
  const otherBusiness = isBusinessAccount(user) && !fleetOwner && !branchAdmin && !partner;
  const country = user?.address?.country;
  const { stats, upcoming, recent, perks, load } = useConsumerDashboard(
    !fleetOwner && !branchAdmin && !partner && !otherBusiness,
  );

  const greeting = firstName(user);
  const loyalty: LoyaltyProgress | undefined =
    perks.status === "ok" ? perks.data?.loyalty : undefined;
  const complimentary =
    perks.status === "ok" ? perks.data?.subscription_complimentary : undefined;

  return (
    <AppShell>
      <section className="welcome">
        <p className="kicker">{roleLabel(user)}</p>
        <h1 className="page-title">Good to see you{greeting ? `, ${greeting}` : ""}.</h1>
        <p className="lede">
          {fleetOwner
            ? "Spend, activity, and branches for this fleet."
            : branchAdmin
              ? "Spend, bookings, and vehicles for your branch."
              : partner
                ? "Referral code, metrics, and commission."
                : otherBusiness
                  ? "This business dashboard is not available on web yet."
                  : "Your bookings, garage, and loyalty live here."}
        </p>
      </section>

      {fleetOwner ? (
        <FleetDashboard />
      ) : branchAdmin ? (
        <BranchAdminDashboard />
      ) : partner ? (
        <PartnerDashboard />
      ) : otherBusiness ? (
        <section className="card">
          <h2>Coming soon on web</h2>
          <p className="muted">This business dashboard is not available on web yet.</p>
        </section>
      ) : (
        <div className="dash-stack">
          <section className="stat-grid">
            <article className="stat-card">
              <p className="stat-label">This month</p>
              <p className="stat-value">
                {stats.status === "ok" ? stats.data.services_this_month : stats.status === "error" ? "—" : "…"}
              </p>
              <p className="muted">Services booked</p>
            </article>
            <article className="stat-card">
              <p className="stat-label">This year</p>
              <p className="stat-value">
                {stats.status === "ok" ? stats.data.services_this_year : stats.status === "error" ? "—" : "…"}
              </p>
              <p className="muted">Services booked</p>
            </article>
          </section>

          <section className="card">
            <div className="card-heading">
              <h2>Upcoming</h2>
              {upcoming.status === "ok" ? (
                <span className="pill pill-pending" aria-label={`${upcoming.data.length} upcoming bookings`}>
                  {upcoming.data.length}
                </span>
              ) : null}
            </div>
            {upcoming.status === "loading" ? <p className="muted">Loading bookings…</p> : null}
            {upcoming.status === "error" ? (
              <p className="banner banner-error" role="alert">
                {upcoming.message}
              </p>
            ) : null}
            {upcoming.status === "ok" && upcoming.data.length === 0 ? (
              <div className="empty-block">
                <p className="muted">No upcoming bookings. Book a wash when you are ready.</p>
                <Link to="/book" className="btn btn-primary">
                  Book a service
                </Link>
              </div>
            ) : null}
            {upcoming.status === "ok" && upcoming.data.length > 0 ? (
              <ul className="booking-list">
                {upcoming.data.map((job) => (
                  <li key={job.booking_reference} className="booking-item">
                    <div className="booking-item-top">
                      <strong>
                        {job.service_type?.name || "Service"}
                        {job.valet_type?.name ? ` · ${job.valet_type.name}` : ""}
                      </strong>
                      <span className={`pill ${job.status === "confirmed" || job.status === "scheduled" ? "pill-ok" : "pill-pending"}`}>
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
              <p className="muted">No completed services yet.</p>
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
                  {!recent.data.is_reviewed ? " · Not rated" : recent.data.rating ? ` · ${recent.data.rating}/5` : ""}
                </p>
              </div>
            ) : null}
          </section>

          {loyalty?.is_b2c && loyalty.current_tier ? (
            <LoyaltyBlock loyalty={loyalty} complimentary={complimentary} />
          ) : perks.status === "error" ? (
            <section className="card">
              <h2>Loyalty</h2>
              <p className="banner banner-error" role="alert">
                {perks.message}
              </p>
            </section>
          ) : null}

          <div className="card-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function LoyaltyBlock({
  loyalty,
  complimentary,
}: {
  loyalty: LoyaltyProgress;
  complimentary?: SubscriptionComplimentary | undefined;
}) {
  const tier = loyalty.current_tier || "bronze";
  const isTop = loyalty.next_tier === null;
  const completed = loyalty.completed_bookings;
  const lower = loyalty.current_threshold;
  const upper = loyalty.next_threshold ?? lower;
  const span = Math.max(1, upper - lower);
  const pct = isTop ? 100 : Math.round((Math.max(0, Math.min(span, completed - lower)) / span) * 100);
  const discount = loyalty.benefits?.discount || 0;
  const services = loyalty.benefits?.free_service ?? [];

  return (
    <section className="card">
      <div className="card-row">
        <h2>Loyalty</h2>
        <span className={`tier-pill tier-pill--${tier}`}>{TIER_LABEL[tier] || tier}</span>
      </div>
      <p className="muted">
        {isTop
          ? "You are at the top tier."
          : `Complete ${loyalty.washes_to_next} more wash${loyalty.washes_to_next === 1 ? "" : "es"} to reach ${TIER_LABEL[loyalty.next_tier || ""]}.`}
      </p>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted">
        {completed} completed
        {isTop ? "" : ` · ${upper} for ${TIER_LABEL[loyalty.next_tier || ""]}`}
      </p>
      <ul className="benefit-list">
        <li>{discount > 0 ? `${discount}% off paid bookings` : "No service discount at this tier yet"}</li>
        {services.length === 0 ? (
          <li>Complete more washes to unlock complimentary perks</li>
        ) : (
          services.map((item) => <li key={item}>{item}</li>)
        )}
        {complimentary?.eligible_subscription ? (
          <li>
            {complimentary.remaining_subscription} of {complimentary.max_subscription} complimentary
            Quick Sparkles left {complimentary.period_label ? `(${complimentary.period_label})` : ""}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
