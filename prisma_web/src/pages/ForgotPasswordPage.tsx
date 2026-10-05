import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage } from "../auth/AuthProvider";
import AuthSplit from "../components/AuthSplit";
import { requestPasswordReset } from "../store/api/authApi";

const SUCCESS_COPY = "If that email is on an account, we sent a reset link.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter the email for your account.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(trimmed);
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err, "Could not send a reset email."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplit
      kicker="Password"
      headline="Reset your password."
      support="We email a link if that address is on an account. It lasts one hour."
    >
      <div className="auth-card">
        <h2>Forgot password</h2>
        <p className="lede">
          {sent ? "Check your inbox and follow the link." : "Use the email you sign in with."}
        </p>

        {sent ? (
          <>
            <div className="banner banner-ok" role="status">
              {SUCCESS_COPY}
            </div>
            <p className="auth-footer">
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        ) : (
          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            {error ? (
              <div className="banner banner-error" role="alert">
                {error}
              </div>
            ) : null}

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
              />
            </label>

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        {sent ? null : (
          <p className="auth-footer">
            Remembered it? <Link to="/login">Sign in</Link>
          </p>
        )}
      </div>
    </AuthSplit>
  );
}
