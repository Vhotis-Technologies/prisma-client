import { Link } from "react-router-dom";
import AuthSplit from "../components/AuthSplit";
import { referralQuery } from "../lib/referralLink";

const OPTIONS = [
  {
    to: "/register",
    title: "Create an account",
    subtitle: "Save your cars and book again from the same place.",
  },
  {
    to: "/book/guest",
    title: "Book as a guest",
    subtitle: "Pay for this visit. We email a link to your photos.",
  },
] as const;

/** Logged-out choice: register vs guest checkout. Signed-in users never see this (GuestOnly). */
export default function WelcomePage() {
  const refQuery = referralQuery();
  return (
    <AuthSplit
      kicker="Dublin"
      headline="Small changes. Big difference."
      support="Create an account, or book this visit as a guest."
    >
      <div className="auth-card auth-card--wide">
        <h2>Get started</h2>
        <p className="lede">Pick one.</p>

        <div className="choice-list">
          {OPTIONS.map((option) => (
            <Link key={option.to} className="choice-card" to={`${option.to}${refQuery}`}>
              <strong>{option.title}</strong>
              <span>{option.subtitle}</span>
            </Link>
          ))}
        </div>

        <p className="auth-footer">
          Already have an account? <Link to={`/login${refQuery}`}>Sign in</Link>
        </p>
      </div>
    </AuthSplit>
  );
}
