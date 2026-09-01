import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AuthSplit from "../components/AuthSplit";
import { previewInvite } from "../store/api/authApi";
import { passwordRuleError } from "../lib/password";

type TokenState =
  | { status: "checking" }
  | { status: "invalid"; message: string }
  | { status: "ready"; email?: string; purpose?: string };

export default function AcceptInvitePage() {
  const { completeInvite } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = (params.get("token") || "").trim();

  const [tokenState, setTokenState] = useState<TokenState>({ status: "checking" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenState({ status: "invalid", message: "This invitation link is missing a token." });
      return;
    }

    let cancelled = false;
    setTokenState({ status: "checking" });

    void previewInvite(token)
      .then((data) => {
        if (cancelled) return;
        if (data.valid) {
          setTokenState({ status: "ready", email: data.user_email, purpose: data.purpose_label });
        } else {
          setTokenState({
            status: "invalid",
            message: data.error || "This invitation link is invalid or has expired.",
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setTokenState({
          status: "invalid",
          message: authErrorMessage(err, "This invitation link is invalid or has expired."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

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
    setSubmitting(true);
    try {
      await completeInvite(token, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, "Could not accept this invitation."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplit
      kicker="Invitation"
      headline="Set your password."
      support="Use at least eight characters, with one uppercase and one lowercase letter."
    >
      <div className="auth-card">
        {tokenState.status === "checking" ? (
          <>
            <h2>Accept invite</h2>
            <p className="lede">Checking your invitation…</p>
          </>
        ) : null}

        {tokenState.status === "invalid" ? (
          <>
            <h2>Link expired</h2>
            <p className="lede">{tokenState.message}</p>
            <p className="auth-footer">
              <Link to="/login">Sign in</Link>
            </p>
          </>
        ) : null}

        {tokenState.status === "ready" ? (
          <>
            <h2>{tokenState.purpose || "Branch admin"}</h2>
            <p className="lede">
              {tokenState.email
                ? `Create a password for ${tokenState.email}, then you can sign in.`
                : "Create a password for this account, then you can sign in."}
            </p>

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
                  <button type="button" className="text-btn" onClick={() => setShowPassword((v) => !v)}>
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

              <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                {submitting ? "Saving…" : "Set password and continue"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </AuthSplit>
  );
}
