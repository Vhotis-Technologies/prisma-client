import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import AuthenticatedImage from "../components/AuthenticatedImage";
import { useBookingImages } from "../app-hooks/useBookingImages";
import { formatDate } from "../lib/format";
import { dateKey } from "../lib/media";
import type { BookingImages, HistoryImage, HistoryItem, ImageTab } from "../types/history";

const TABS: { id: ImageTab; label: string }[] = [
  { id: "before-interior", label: "Before interior" },
  { id: "after-interior", label: "After interior" },
  { id: "before-exterior", label: "Before exterior" },
  { id: "after-exterior", label: "After exterior" },
];

function imagesFor(data: BookingImages | null, tab: ImageTab): HistoryImage[] {
  if (!data) return [];
  switch (tab) {
    case "before-interior":
      return data.before_images_interior || [];
    case "before-exterior":
      return data.before_images_exterior || [];
    case "after-interior":
      return data.after_images_interior || [];
    case "after-exterior":
      return data.after_images_exterior || [];
  }
}

export default function HistoryDetailPage() {
  const { bookingId } = useParams();
  const location = useLocation();
  const fromList = (location.state as HistoryItem | null) || null;
  const { images, loading, error } = useBookingImages(bookingId);
  const [tab, setTab] = useState<ImageTab>("before-interior");
  const [lightbox, setLightbox] = useState<HistoryImage | null>(null);

  const current = useMemo(() => imagesFor(images, tab), [images, tab]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">
            <Link to="/history">History</Link>
          </p>
          <h1 className="page-title">{fromList?.service_type || "Service photos"}</h1>
          <p className="lede">
            {fromList
              ? `${formatDate(dateKey(fromList.appointment_date))} · ${fromList.vehicle_reg || "Vehicle"}`
              : images?.booking_reference
                ? `Reference ${images.booking_reference}`
                : "Before and after photos from this job."}
          </p>
        </div>
        <Link to="/history" className="btn btn-secondary">
          Back to history
        </Link>
      </section>

      {error ? (
        <div className="banner banner-error" role="alert">
          We couldn’t load these photos. Please try again.
        </div>
      ) : null}

      {loading ? <p className="muted">Loading photos…</p> : null}

      {images?.access_denied ? (
        <section className="card">
          <h2>Photos are locked</h2>
          <p className="muted">
            {images.message || "Detailed vehicle photos are only available with an active fleet subscription."}
          </p>
        </section>
      ) : null}
      
      {!loading && images && images.view_only ? (
        <div className="banner banner-ok" style={{ marginBottom: '1.5rem' }}>
          View-only mode: Downloading and sharing require an active fleet subscription. <Link to="/settings/subscriptions">Subscribe</Link>
        </div>
      ) : null}

      {images?.is_watermarked && !images.access_denied ? (
        <div className="banner banner-info" role="status">
          These photos are watermarked. <Link to="/settings/subscriptions">Subscribe</Link> to view and download clean, unwatermarked images.
        </div>
      ) : null}

      {!loading && images && !images.access_denied ? (
        <>
          <div className="photo-tabs" role="tablist" aria-label="Photo sets">
            {TABS.map((item) => {
              const count = imagesFor(images, item.id).length;
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
              <p className="muted">The detailer has not uploaded {TABS.find((item) => item.id === tab)?.label.toLowerCase()} photos yet.</p>
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
                    <AuthenticatedImage
                      imageId={photo.id}
                      imageUrl={photo.image_url}
                      alt=""
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {lightbox ? (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            <AuthenticatedImage
              imageId={lightbox.id}
              imageUrl={lightbox.image_url}
              alt="Service photo"
              className="lightbox-image"
            />
          </div>
          <p className="lightbox-footer">Tap outside the photo to close</p>
        </div>
      ) : null}
    </AppShell>
  );
}
