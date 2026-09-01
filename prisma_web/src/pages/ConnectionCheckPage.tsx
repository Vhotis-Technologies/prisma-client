import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import { getApiBaseUrl } from "../store/api/client";
import { getTerms } from "../store/api/authApi";

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; version: string; lastUpdated: string }
  | { status: "error"; message: string };

export default function ConnectionCheckPage() {
  const [check, setCheck] = useState<CheckState>({ status: "idle" });

  async function runCheck() {
    setCheck({ status: "loading" });
    try {
      const data = await getTerms();
      if (data.error) {
        setCheck({ status: "error", message: data.error });
        return;
      }
      setCheck({
        status: "ok",
        version: data.version || "unknown",
        lastUpdated: data.last_updated || "unknown",
      });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 404) {
          setCheck({
            status: "ok",
            version: "not seeded",
            lastUpdated: "API reachable",
          });
          return;
        }
        setCheck({
          status: "error",
          message: `API ${err.response.status}: ${JSON.stringify(err.response.data)}`,
        });
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : "Request failed. Confirm staging nginx is on port 80 and VITE_API_URL is set.";
      setCheck({ status: "error", message });
    }
  }

  useEffect(() => {
    void runCheck();
  }, []);

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-inner">
          <BrandMark />
          <Link to="/login" className="btn btn-ghost">
            Sign in
          </Link>
        </div>
      </header>
      <main className="shell-main">
        <p className="kicker">Diagnostics</p>
        <h1 className="page-title">API connection</h1>
        <p className="lede">Confirms the browser can reach the client server.</p>

        <section className="card">
          <dl className="meta">
            <div>
              <dt>API</dt>
              <dd>
                <code>{getApiBaseUrl()}</code>
              </dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>
                <code>{window.location.origin}</code>
              </dd>
            </div>
          </dl>

          {check.status === "loading" || check.status === "idle" ? (
            <p className="muted">Checking terms endpoint…</p>
          ) : null}

          {check.status === "ok" ? (
            <div className="banner banner-ok" role="status">
              Connected. Terms {check.version}
              {check.lastUpdated !== "unknown" ? ` · ${check.lastUpdated}` : ""}
            </div>
          ) : null}

          {check.status === "error" ? (
            <div className="banner banner-error" role="alert">
              {check.message}
            </div>
          ) : null}

          <div className="card-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runCheck()}
              disabled={check.status === "loading"}
            >
              Check again
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
