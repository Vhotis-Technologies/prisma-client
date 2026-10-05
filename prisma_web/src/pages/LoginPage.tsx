import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginErrorMessage, useAuth } from "../auth/AuthProvider";
import AuthSplit from "../components/AuthSplit";
import { referralQuery } from "../lib/referralLink";

export default function LoginPage() {
  const refQuery = referralQuery();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== "/login"
      ? (location.state as { from: string }).from
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password, rememberMe);
      navigate(from, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplit
      kicker="Sign in"
      headline="Welcome back."
      support="Use the email and password for your account."
    >
        <div className="auth-card">
          <h2>Your account</h2>
          <p className="lede">Book on the web or in the app.</p>

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

            <label className="field">
              <div className="field-label-row">
                <span>Password</span>
                <Link to="/forgot-password">Forgot password?</Link>
              </div>
              <div className="field-password">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
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
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth-footer">
            New to Prisma Car Care? <Link to={`/welcome${refQuery}`}>Get started</Link>
          </p>
        </div>
    </AuthSplit>
  );
}
