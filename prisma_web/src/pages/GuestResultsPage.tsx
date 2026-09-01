import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { authErrorMessage } from "../auth/AuthProvider";
import GuestBookShell from "../components/GuestBookShell";
import { formatClock, formatDate, formatDateTime } from "../lib/format";
import {
  fetchGuestResults,
  guestImageUrl,
  type GuestResultsPhoto,
  type GuestResultsResponse,
} from "../store/api/guestApi";

const STATUS_COPY: Record<string, string> = {
  pending: "Confirmed — waiting for your detailer",
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TABS: { id: keyof GuestResultsResponse["photos"]; label: string }[] = [
  { id: "before_interior", label: "Before interior" },
  { id: "after_interior", label: "After interior" },
  { id: "before_exterior", label: "Before exterior" },
  { id: "after_exterior", label: "After exterior" },
];

function emptyPhotos(): GuestResultsResponse["photos"] {
  return {
    before_interior: [],
    before_exterior: [],
    after_interior: [],
    after_exterior: [],
  };
}

/**
 * Time-limited guest results: photos (view/download) and health-check notes.
 * Token is in the path (`/guest/b/:token`); no cancel/reschedule UI.
 */
export default function GuestResultsPage() {
  const { token = "" } = useParams();
  const raw = token.trim();
  const [data, setData] = useState<GuestResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(raw));
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("after_exterior");
  const [lightbox, setLightbox] = useState<GuestResultsPhoto | null>(null);

  useEffect(() => {
    if (!raw) {
      setError("This link is missing a token.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchGuestResults(raw)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(authErrorMessage(err, "This link is invalid or has expired."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [raw]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const photos = data?.photos || emptyPhotos();
  const current = photos[tab] || [];
  const statusLabel = data ? STATUS_COPY[data.status] || data.status : "";

  const defaultTab = useMemo(() => {
    if (!data?.photos) return "after_exterior" as const;
    const withPhotos = TABS.find((item) => (data.photos[item.id] || []).length > 0);
    return withPhotos?.id || "after_exterior";
  }, [data?.photos]);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  return (
    <GuestBookShell backTo="/welcome" backLabel="Home">
      <section className="welcome">
        <p className="kicker">Guest booking</p>
        <h1 className="page-title">
          {error ? "Link unavailable" : loading ? "Loading booking" : "Your booking"}
        </h1>
        <p className="lede">
          {error
            ? error
            : loading
              ? "Checking this link…"
              : data?.cancelled
                ? "This booking was cancelled. Email support if you need help."
                : data?.photos_ready
                  ? "Photos from this visit are ready to view and download."
                  : "Your booking is confirmed. Photos and detailer notes will appear here after the job."}
        </p>
      </section>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {data ? (
        <section className="card">
          <h2>{statusLabel}</h2>
          <dl className="meta">
            <div>
              <dt>Reference</dt>
              <dd>
                <code>{data.booking_reference}</code>
              </dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {formatDate(data.appointment_date)}
                {data.start_time ? ` · ${formatClock(data.start_time)}` : ""}
              </dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>
                {[data.service_name, data.valet_name].filter(Boolean).join(" · ") || "—"}
              </dd>
            </div>
            <div>
              <dt>Vehicle</dt>
              <dd>{data.vehicle_line}</dd>
            </div>
            {data.address_line ? (
              <div>
                <dt>Where</dt>
                <dd>{data.address_line}</dd>
              </div>
            ) : null}
            {data.detailer_name ? (
              <div>
                <dt>Detailer</dt>
                <dd>{data.detailer_name}</dd>
              </div>
            ) : null}
            {data.link_expires_at ? (
              <div>
                <dt>Link expires</dt>
                <dd>{formatDateTime(data.link_expires_at)}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {data && !data.cancelled ? (
        <>
          <div className="photo-tabs" role="tablist" aria-label="Photo sets">
            {TABS.map((item) => {
              const count = (photos[item.id] || []).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`photo-tab${tab === item.id ? " is-selected" : ""}`}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                  {count > 0 ? <span>{count}</span> : null}
                </button>
              );
            })}
          </div>

          {current.length === 0 ? (
            <section className="card">
              <h2>No photos in this set</h2>
              <p className="muted">
                {data.photos_ready
                  ? "The detailer has not uploaded this set yet."
                  : "Photos will appear here after the job."}
              </p>
            </section>
          ) : (
            <ul className="photo-grid">
              {current.map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    className="photo-tile"
                    onClick={() => setLightbox(photo)}
                  >
                    <img src={guestImageUrl(photo.id, raw)} alt="" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {data?.health_check && data.health_check.items.length > 0 ? (
        <section className="card">
          <h2>Vehicle health check</h2>
          {data.health_check.inspected_at ? (
            <p className="muted">Recorded {formatDateTime(data.health_check.inspected_at)}</p>
          ) : null}
          <dl className="meta health-check-list">
            {data.health_check.items.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : data && !data.cancelled ? (
        <section className="card">
          <h2>Vehicle health check</h2>
          <p className="muted">Notes will appear here when the detailer finishes the job.</p>
        </section>
      ) : null}

      {data ? (
        <>
          <p className="muted">
            To change or cancel, email{" "}
            <a href="mailto:support@prismavalet.com">support@prismavalet.com</a> with your booking
            reference.
          </p>
          <div className="card-actions">
            {data.can_claim !== false ? (
              <Link to={`/guest/claim/${encodeURIComponent(raw)}`} className="btn btn-primary">
                Keep this booking
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary">
                Sign in to your garage
              </Link>
            )}
            <Link to="/book/guest" className="btn btn-secondary">
              Book another
            </Link>
          </div>
        </>
      ) : null}

      {lightbox ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Service photo"
          onClick={() => setLightbox(null)}
        >
          <div className="lightbox-content" onClick={(event) => event.stopPropagation()}>
            <img src={guestImageUrl(lightbox.id, raw)} alt="Service photo" />
            <div className="lightbox-actions">
              <a
                className="btn btn-primary"
                href={guestImageUrl(lightbox.id, raw, true)}
                download
              >
                Download
              </a>
              <p className="lightbox-footer">Tap outside the photo to close</p>
            </div>
          </div>
        </div>
      ) : null}
    </GuestBookShell>
  );
}
