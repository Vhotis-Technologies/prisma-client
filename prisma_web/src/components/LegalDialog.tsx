import { useEffect, useState } from "react";
import { getPrivacyPolicy, getTerms } from "../store/api/authApi";

type LegalKind = "terms" | "privacy";

type LegalDialogProps = {
  kind: LegalKind | null;
  onClose: () => void;
};

const TITLES: Record<LegalKind, string> = {
  terms: "Terms of service",
  privacy: "Privacy policy",
};

const LOADERS: Record<LegalKind, () => ReturnType<typeof getTerms>> = {
  terms: getTerms,
  privacy: getPrivacyPolicy,
};

export default function LegalDialog({ kind, onClose }: LegalDialogProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) {
      setHtml(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setHtml(null);
    setError(null);
    void LOADERS[kind]()
      .then((data) => {
        if (cancelled) return;
        if (data.error || !data.content) {
          setError(data.error || "Document is not available yet.");
          return;
        }
        setHtml(data.content);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this document.");
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (!kind) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="legal-dialog-title">{TITLES[kind]}</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dialog-body">
          {error ? <p className="muted">{error}</p> : null}
          {!error && !html ? <p className="muted">Loading…</p> : null}
          {html ? (
            <iframe title={TITLES[kind]} className="legal-frame" srcDoc={html} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
