import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AddressSearchInput from "../components/AddressSearchInput";
import AuthSplit from "../components/AuthSplit";
import LegalDialog from "../components/LegalDialog";
import type { BusinessAddress, RegisterCredentials, SignUpAccountType } from "../types/user";

const ACCOUNT_TITLE: Record<SignUpAccountType, string> = {
  b2c: "Personal",
  fleet_operator: "Fleet operator",
  dealership: "Dealership",
};

function parseAccountType(value: string | null): SignUpAccountType | null {
  if (value === "b2c" || value === "fleet_operator" || value === "dealership") {
    return value;
  }
  return null;
}

export default function RegisterDetailsPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const accountType = parseAccountType(params.get("type"));

  const needsBusiness = accountType === "fleet_operator" || accountType === "dealership";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referredCode, setReferredCode] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState<BusinessAddress | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalKind, setLegalKind] = useState<"terms" | "privacy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const panelCopy = useMemo(() => {
    if (accountType === "fleet_operator") {
      return {
        headline: "Set up your fleet.",
        support: "Add your business details so branches and vehicles can live under one account.",
      };
    }
    if (accountType === "dealership") {
      return {
        headline: "Join as a dealership partner.",
        support: "Your business profile unlocks partnership tools and fleet features.",
      };
    }
    return {
      headline: "A few details, then you are in.",
      support: "Create a personal account to book and manage your vehicles.",
    };
  }, [accountType]);

  if (!accountType) {
    return <Navigate to="/register" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !phone.trim() || !password) {
      setError("Please fill in all required fields.");
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
    if (needsBusiness) {
      if (!businessName.trim()) {
        setError("Business name is required for this account type.");
        return;
      }
      if (!businessAddress?.address || !businessAddress.city || !businessAddress.country) {
        setError("Please select your business address from the search results.");
        return;
      }
    }

    const credentials: RegisterCredentials = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password,
      isFleetOwner: accountType === "fleet_operator",
      isDealership: accountType === "dealership",
    };
    if (accountType === "b2c" && referredCode.trim()) {
      credentials.referred_code = referredCode.trim().toUpperCase();
    }
    if (needsBusiness && businessAddress) {
      credentials.business_name = businessName.trim();
      credentials.business_address = businessAddress;
    }

    setSubmitting(true);
    try {
      await register(credentials);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, "Could not create your account."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplit
      kicker="Create account"
      headline={panelCopy.headline}
      support={panelCopy.support}
      alignTop
    >
      <div className="auth-card auth-card--wide">
        <div className="account-chip">
          <span>
            Signing up as <strong>{ACCOUNT_TITLE[accountType]}</strong>
          </span>
          <Link to="/register">Change</Link>
        </div>
        <h2>Your details</h2>
        <p className="lede">Complete your details to finish signing up.</p>

        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          {error ? (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          ) : null}

          <label className="field">
            <span>Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Jane Murphy"
              required
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="name@company.com"
              required
            />
          </label>

          <label className="field">
            <span>Phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="087 000 0000"
              maxLength={15}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          {accountType === "b2c" ? (
            <label className="field">
              <span>Referral code (optional)</span>
              <input
                value={referredCode}
                onChange={(e) => setReferredCode(e.target.value)}
                autoCapitalize="characters"
                placeholder="If you have one"
              />
            </label>
          ) : null}

          {needsBusiness ? (
            <>
              <label className="field">
                <span>Business name</span>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  autoComplete="organization"
                  required
                />
              </label>
              <AddressSearchInput
                label="Business address"
                placeholder="Search for your business address..."
                value={businessAddress}
                onSelect={setBusinessAddress}
                onClear={() => setBusinessAddress(null)}
              />
            </>
          ) : null}

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

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={!termsAccepted || submitting}
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
          {" · "}
          <Link to="/book/guest">Book without an account</Link>
        </p>
      </div>

      <LegalDialog kind={legalKind} onClose={() => setLegalKind(null)} />
    </AuthSplit>
  );
}
