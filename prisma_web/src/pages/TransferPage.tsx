import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { authErrorMessage } from "../auth/AuthProvider";
import AuthSplit from "../components/AuthSplit";
import {
  getWebTransfer,
  webTransferAction,
  type TransferPayload,
  type TransferVehicle,
} from "../store/api/garageApi";
import { formatDateTime } from "../lib/format";

type PageState =
  | { status: "checking" }
  | { status: "invalid"; message: string }
  | { status: "ready"; data: TransferPayload }
  | { status: "done"; action: "approve" | "reject"; data: TransferPayload };

function vehicleLine(vehicle?: TransferVehicle): string {
  if (!vehicle) return "Vehicle";
  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  const plate = vehicle.registration_number;
  if (name && plate) return `${name} · ${plate}`;
  return name || plate || "Vehicle";
}

export default function TransferPage() {
  const { transferId = "" } = useParams();
  const id = transferId.trim();

  const [page, setPage] = useState<PageState>({ status: "checking" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    if (!id) {
      setPage({ status: "invalid", message: "This transfer link is missing an id." });
      return;
    }

    let cancelled = false;
    setPage({ status: "checking" });
    setError(null);

    void getWebTransfer(id)
      .then((data) => {
        if (cancelled) return;
        if (data.valid) {
          setPage({ status: "ready", data });
        } else {
          setPage({
            status: "invalid",
            message: data.error || "This transfer request is no longer available.",
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPage({
          status: "invalid",
          message: authErrorMessage(err, "This transfer request is no longer available."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function respond(action: "approve" | "reject") {
    if (!id) return;
    if (action === "approve") {
      const ok = window.confirm(
        "Approve this transfer? The vehicle will leave your garage and move to the requester.",
      );
      if (!ok) return;
    } else {
      const ok = window.confirm("Reject this transfer request?");
      if (!ok) return;
    }
    setBusy(action);
    setError(null);
    try {
      const data = await webTransferAction(id, { action });
      if (!data.success) {
        setError(data.error || "Could not update this transfer.");
        return;
      }
      setPage({ status: "done", action, data });
    } catch (err) {
      setError(authErrorMessage(err, "Could not update this transfer."));
    } finally {
      setBusy(null);
    }
  }

  const data = page.status === "ready" || page.status === "done" ? page.data : null;
  const requester = data?.requester?.name || "the requester";

  return (
    <AuthSplit
      kicker="Vehicle transfer"
      headline="Review this request."
      support="Approve to move the vehicle out of your garage, or reject to keep it."
    >
      <div className="auth-card">
        {page.status === "checking" ? (
          <>
            <h2>Transfer request</h2>
            <p className="lede">Checking this link…</p>
          </>
        ) : null}

        {page.status === "invalid" ? (
          <>
            <h2>Link unavailable</h2>
            <p className="lede">{page.message}</p>
            <p className="auth-footer">
              <Link to="/login">Sign in</Link>
            </p>
          </>
        ) : null}

        {page.status === "done" ? (
          <>
            <h2>{page.action === "approve" ? "Transfer approved" : "Transfer rejected"}</h2>
            <p className="lede">
              {page.action === "approve"
                ? `${vehicleLine(data?.vehicle)} now belongs to ${requester}.`
                : `${vehicleLine(data?.vehicle)} stays in your garage.`}
            </p>
            <p className="auth-footer">
              <Link to="/login">Sign in</Link>
              {" · "}
              <Link to="/garage">Garage</Link>
            </p>
          </>
        ) : null}

        {page.status === "ready" ? (
          <>
            <h2>{vehicleLine(data?.vehicle)}</h2>
            <p className="lede">
              {requester}
              {data?.requester?.email ? ` (${data.requester.email})` : ""} asked to take ownership.
            </p>

            <dl className="meta">
              {data?.vehicle?.color ? (
                <div>
                  <dt>Colour</dt>
                  <dd>{data.vehicle.color}</dd>
                </div>
              ) : null}
              {data?.requested_at ? (
                <div>
                  <dt>Requested</dt>
                  <dd>{formatDateTime(data.requested_at)}</dd>
                </div>
              ) : null}
              {data?.expires_at ? (
                <div>
                  <dt>Expires</dt>
                  <dd>{formatDateTime(data.expires_at)}</dd>
                </div>
              ) : null}
            </dl>

            {error ? (
              <div className="banner banner-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="card-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(busy)}
                onClick={() => void respond("approve")}
              >
                {busy === "approve" ? "Approving…" : "Approve"}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={Boolean(busy)}
                onClick={() => void respond("reject")}
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </AuthSplit>
  );
}
