import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AuthSplit from "../components/AuthSplit";
import { validateResetToken } from "../store/api/authApi";
import { passwordRuleError } from "../lib/password";

type TokenState =
  | { status: "checking" }
  | { status: "invalid"; message: string }
  | { status: "ready"; email?: string };

export default function ResetPasswordPage() {
  const { completePasswordReset } = useAuth();
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
      setTokenState({ status: "invalid", message: "This reset link is missing a token." });
      return;
    }

    let cancelled = false;
    setTokenState({ status: "checking" });

    void validateResetToken(token)
      .then((data) => {
        if (cancelled) return;
        if (data.valid) {
          setTokenState({ status: "ready", email: data.user_email });
        } else {
          setTokenState({
            status: "invalid",
            message: "This reset link is invalid or has expired.",
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setTokenState({
          status: "invalid",
          message: authErrorMessage(err, "This reset link is invalid or has expired."),
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
      await completePasswordReset(token, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, "Could not reset your password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplit
      kicker="Account"
      headline="Choose a new password."
      support="Use at least eight characters, with one uppercase and one lowercase letter."
    >
      <div className="auth-card">
        {tokenState.status === "checking" ? (
          <>
            <h2>Reset password</h2>
            <p className="lede">Checking your reset link…</p>
          </>
        ) : null}

        {tokenState.status === "invalid" ? (
          <>
            <h2>Link expired</h2>
            <p className="lede">{tokenState.message}</p>
            <p className="auth-footer">
              <Link to="/forgot-password">Request a new link</Link>
              {" · "}
              <Link to="/login">Sign in</Link>
            </p>
          </>
        ) : null}

        {tokenState.status === "ready" ? (
          <>
            <h2>New password</h2>
            <p className="lede">
              {tokenState.email
                ? `Set a new password for ${tokenState.email}.`
                : "Set a new password for your account."}
            </p>

            <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
              {error ? (
                <div className="banner banner-error" role="alert">
                  {error}
                </div>
              ) : null}

              <label className="field">
                <span>New password</span>
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

              <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                {submitting ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </AuthSplit>
  );
}
