import { Link } from "react-router-dom";
import AuthSplit from "../components/AuthSplit";
import { referralQuery } from "../lib/referralLink";
import type { SignUpAccountType } from "../types/user";

const OPTIONS: {
  type: SignUpAccountType;
  title: string;
  subtitle: string;
}[] = [
  {
    type: "b2c",
    title: "Personal",
    subtitle: "For your own cars.",
  },
  {
    type: "fleet_operator",
    title: "Fleet",
    subtitle: "For several vehicles or branches.",
  },
  {
    type: "dealership",
    title: "Dealership",
    subtitle: "For a forecourt and a Prisma partnership.",
  },
];

export default function RegisterPage() {
  const refQuery = referralQuery();
  return (
    <AuthSplit
      kicker="Create account"
      headline="What kind of account?"
      support="Personal, fleet, or dealership."
    >
      <div className="auth-card auth-card--wide">
        <h2>Choose one</h2>
        <p className="lede">You can book on the web or in the app.</p>

        <div className="choice-list">
          {OPTIONS.map((option) => (
            <Link
              key={option.type}
              className="choice-card"
              to={`/register/details${referralQuery({ type: option.type })}`}
            >
              <strong>{option.title}</strong>
              <span>{option.subtitle}</span>
            </Link>
          ))}
        </div>

        <p className="auth-footer">
          Already have an account? <Link to={`/login${refQuery}`}>Sign in</Link>
          {" · "}
          <Link to={`/book/guest${refQuery}`}>Book as a guest</Link>
        </p>
      </div>
    </AuthSplit>
  );
}
