import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AuthSplit from "../components/AuthSplit";
import LegalDialog from "../components/LegalDialog";
import { passwordRuleError } from "../lib/password";
import { fetchGuestClaimPreview } from "../store/api/guestApi";

type TokenState =
  | { status: "checking" }
  | { status: "invalid"; message: string }
  | { status: "already"; email?: string }
  | {
      status: "ready";
      email?: string;
      name?: string;
      bookingReference?: string;
      vehicleLine?: string;
    };

/**
 * Convert a guest checkout user into a full account using the emailed results token.
 * Same User row: garage and booking history are already attached.
 */
export default function GuestClaimPage() {
  const { completeGuestClaim } = useAuth();
  const navigate = useNavigate();
  const { token = "" } = useParams();
  const raw = token.trim();

  const [tokenState, setTokenState] = useState<TokenState>({ status: "checking" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [allowMarketing, setAllowMarketing] = useState(false);
  const [legalKind, setLegalKind] = useState<"terms" | "privacy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!raw) {
      setTokenState({ status: "invalid", message: "This link is missing a token." });
      return;
    }
    let cancelled = false;
    setTokenState({ status: "checking" });
    void fetchGuestClaimPreview(raw)
      .then((data) => {
        if (cancelled) return;
        if (data.already_registered) {
          setTokenState({ status: "already", email: data.email });
          return;
        }
        setTokenState({
          status: "ready",
          email: data.email,
          name: data.name,
          bookingReference: data.booking_reference,
          vehicleLine: data.vehicle_line,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setTokenState({
          status: "invalid",
          message: authErrorMessage(err, "This link is invalid or has expired."),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [raw]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const rule = passwordRuleError(password);
    if (rule) {
      setError(rule);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!termsAccepted) {
      setError("Please accept the terms and privacy policy.");
      return;
    }
    setSubmitting(true);
    try {
      await completeGuestClaim(raw, password, allowMarketing);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, "Could not create your account."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplit
      kicker="Keep your booking"
      headline="Create a password for this email."
      support="Your vehicle and visit history stay on this account — you are not starting over."
    >
      <div className="auth-card">
        {tokenState.status === "checking" ? (
          <>
            <h2>Create your account</h2>
            <p className="lede">Checking this link…</p>
          </>
        ) : null}

        {tokenState.status === "invalid" ? (
          <>
            <h2>Link unavailable</h2>
            <p className="lede">{tokenState.message}</p>
            <p className="auth-footer">
              <Link to="/login">Sign in</Link>
              {" · "}
              <Link to="/book/guest">Book without an account</Link>
            </p>
          </>
        ) : null}

        {tokenState.status === "already" ? (
          <>
            <h2>Account already created</h2>
            <p className="lede">
              {tokenState.email
                ? `A password is already set for ${tokenState.email}. Sign in to see your garage and history.`
                : "A password is already set for this booking. Sign in to continue."}
            </p>
            <p className="auth-footer">
              <Link to="/login">Sign in</Link>
            </p>
          </>
        ) : null}

        {tokenState.status === "ready" ? (
          <>
            <h2>Create your account</h2>
            <p className="lede">
              {tokenState.email
                ? `Set a password for ${tokenState.email}.`
                : "Set a password for this booking."}
            </p>
            {tokenState.vehicleLine || tokenState.bookingReference ? (
              <p className="muted">
                {[tokenState.vehicleLine, tokenState.bookingReference ? `Ref ${tokenState.bookingReference}` : ""]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                will appear in your garage and history.
              </p>
            ) : null}

            <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
              {error ? (
                <div className="banner banner-error" role="alert">
                  {error}
                </div>
              ) : null}

              <label className="field">
                <span>Password</span>
                <div className="field-password">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="field-hint">8+ characters, with upper and lowercase letters.</p>
              </label>

              <label className="field">
                <span>Confirm password</span>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </label>

              <div className="legal-links">
                <button type="button" className="text-btn text-btn-inline" onClick={() => setLegalKind("terms")}>
                  Read terms of service
                </button>
                <button type="button" className="text-btn text-btn-inline" onClick={() => setLegalKind("privacy")}>
                  Read privacy policy
                </button>
              </div>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>I have read and accept the terms of service and privacy policy.</span>
              </label>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={allowMarketing}
                  onChange={(e) => setAllowMarketing(e.target.checked)}
                />
                <span>Email me offers and updates (optional).</span>
              </label>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={!termsAccepted || submitting}
              >
                {submitting ? "Saving…" : "Save password and continue"}
              </button>
            </form>
          </>
        ) : null}
      </div>
      <LegalDialog kind={legalKind} onClose={() => setLegalKind(null)} />
    </AuthSplit>
  );
}
