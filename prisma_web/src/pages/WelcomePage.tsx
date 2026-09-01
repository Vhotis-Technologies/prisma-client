import { Link } from "react-router-dom";
import AuthSplit from "../components/AuthSplit";

const OPTIONS = [
  {
    to: "/register",
    title: "Join us",
    subtitle: "Create an account to book, save vehicles, and follow every visit in the app.",
  },
  {
    to: "/book/guest",
    title: "Book without an account",
    subtitle: "Pay as a guest. We will email a link so you can view and download your photos.",
  },
] as const;

/** Logged-out choice: register vs guest checkout. Signed-in users never see this (GuestOnly). */
export default function WelcomePage() {
  return (
    <AuthSplit
      kicker="Prisma Car Care"
      headline="How would you like to continue?"
      support="Join us for a full account, or book this visit without creating a password."
    >
      <div className="auth-card auth-card--wide">
        <h2>Get started</h2>
        <p className="lede">Choose how you want to book.</p>

        <div className="choice-list">
          {OPTIONS.map((option) => (
            <Link key={option.to} className="choice-card" to={option.to}>
              <strong>{option.title}</strong>
              <span>{option.subtitle}</span>
            </Link>
          ))}
        </div>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthSplit>
  );
}
