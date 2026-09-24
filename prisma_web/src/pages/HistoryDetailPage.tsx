import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import AuthenticatedImage from "../components/AuthenticatedImage";
import ReviewDialog, { type ReviewDialogTarget } from "../components/ReviewDialog";
import { useBookingImages } from "../app-hooks/useBookingImages";
import {
  bookingImageFilename,
  canShareBookingImage,
  downloadBookingImage,
  shareBookingImage,
} from "../lib/bookingImages";
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

/** Message for a failed save or share, separating the entitlement case from real errors. */
function actionErrorMessage(err: unknown): string {
  const statusCode = (err as { response?: { status?: number } })?.response?.status;
  if (statusCode === 403) {
    return "An active subscription is required to download or share these photos.";
  }
  return "We couldn’t prepare that photo. Please try again.";
}

export default function HistoryDetailPage() {
  const { bookingId } = useParams();
  const location = useLocation();
  const fromList = (location.state as HistoryItem | null) || null;
  const { images, loading, error } = useBookingImages(bookingId);
  const [tab, setTab] = useState<ImageTab>("before-interior");
  const [lightbox, setLightbox] = useState<HistoryImage | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewedLocally, setReviewedLocally] = useState<{ rating: number } | null>(null);

  const current = useMemo(() => imagesFor(images, tab), [images, tab]);
  const canDownload = Boolean(images?.download_allowed);
  const shareSupported = useMemo(() => canShareBookingImage(), []);

  const isReviewed = Boolean(reviewedLocally) || Boolean(fromList?.is_reviewed);
  const rating = reviewedLocally?.rating || fromList?.rating || 0;

  const reviewTarget: ReviewDialogTarget | null = fromList?.booking_reference
    ? {
        booking_reference: fromList.booking_reference,
        service_type: fromList.service_type,
        vehicle_label: fromList.vehicle_reg,
        detailer_name: fromList.detailer?.name || null,
      }
    : images?.booking_reference
      ? {
          booking_reference: images.booking_reference,
          service_type: fromList?.service_type || null,
          vehicle_label: fromList?.vehicle_reg || null,
          detailer_name: fromList?.detailer?.name || null,
        }
      : null;

  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  useEffect(() => {
    setActionError(null);
  }, [lightbox]);

  async function handleDownload(photo: HistoryImage) {
    setBusy("download");
    setActionError(null);
    try {
      await downloadBookingImage(
        photo.id,
        photo.image_url,
        bookingImageFilename(photo.id, images?.booking_reference),
      );
    } catch (err) {
      setActionError(actionErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleShare(photo: HistoryImage) {
    setBusy("share");
    setActionError(null);
    const filename = bookingImageFilename(photo.id, images?.booking_reference);
    try {
      const shared = await shareBookingImage(
        photo.id,
        photo.image_url,
        filename,
        fromList?.service_type || "Prisma Car Care photo",
      );
      if (!shared) {
        await downloadBookingImage(photo.id, photo.image_url, filename);
      }
    } catch (err) {
      // The share sheet throws AbortError when the visitor dismisses it.
      if ((err as { name?: string })?.name !== "AbortError") {
        setActionError(actionErrorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  }

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
            {isReviewed && rating > 0 ? ` · Rated ${rating}/5` : ""}
          </p>
        </div>
        <div className="welcome-actions">
          {reviewTarget && !isReviewed ? (
            <button type="button" className="btn btn-primary" onClick={() => setReviewOpen(true)}>
              Rate service
            </button>
          ) : null}
          <Link to="/history" className="btn btn-secondary">
            Back to history
          </Link>
        </div>
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
            {images.message || "Detailed vehicle photos are only available with an active subscription."}
          </p>
        </section>
      ) : null}

      {!loading && images && images.view_only ? (
        <div className="banner banner-ok" style={{ marginBottom: "1.5rem" }}>
          View-only mode: downloading and sharing require an active subscription.{" "}
          <Link to="/settings/subscriptions">Subscribe</Link>
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
              <p className="muted">
                The detailer has not uploaded {TABS.find((item) => item.id === tab)?.label.toLowerCase()} photos
                yet.
              </p>
            </section>
          ) : (
            <ul className="photo-grid">
              {current.map((photo) => (
                <li key={photo.id}>
                  <button type="button" className="photo-tile" onClick={() => setLightbox(photo)}>
                    <AuthenticatedImage imageId={photo.id} imageUrl={photo.image_url} alt="" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {lightbox ? (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={(event) => event.stopPropagation()}>
            <AuthenticatedImage
              imageId={lightbox.id}
              imageUrl={lightbox.image_url}
              alt="Service photo"
              className="lightbox-image"
            />
            <div className="lightbox-actions">
              {canDownload ? (
                <div className="lightbox-buttons">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => void handleDownload(lightbox)}
                  >
                    {busy === "download" ? "Preparing…" : "Download"}
                  </button>
                  {shareSupported ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy !== null}
                      onClick={() => void handleShare(lightbox)}
                    >
                      {busy === "share" ? "Preparing…" : "Share"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <Link to="/settings/subscriptions" className="btn btn-primary">
                  Subscribe to download
                </Link>
              )}
              {actionError ? (
                <p className="lightbox-footer" role="alert">
                  {actionError}
                </p>
              ) : null}
              <p className="lightbox-footer">Tap outside the photo to close</p>
            </div>
          </div>
        </div>
      ) : null}

      <ReviewDialog
        open={reviewOpen}
        target={reviewTarget}
        onClose={() => setReviewOpen(false)}
        onSubmitted={(_ref, nextRating) => {
          setReviewedLocally({ rating: nextRating });
        }}
      />
    </AppShell>
  );
}
