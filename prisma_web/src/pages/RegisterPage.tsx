import { Link } from "react-router-dom";
import AuthSplit from "../components/AuthSplit";
import type { SignUpAccountType } from "../types/user";

const OPTIONS: {
  type: SignUpAccountType;
  title: string;
  subtitle: string;
}[] = [
  {
    type: "b2c",
    title: "Personal",
    subtitle: "Book washes for your own vehicles. No business details required.",
  },
  {
    type: "fleet_operator",
    title: "Fleet operator",
    subtitle: "Manage fleets, branches, and vehicle servicing at scale.",
  },
  {
    type: "dealership",
    title: "Dealership",
    subtitle: "Business profile, fleet tools, and a partnership with Prisma Car Care.",
  },
];

export default function RegisterPage() {
  return (
    <AuthSplit
      kicker="Create account"
      headline="Choose how you will use Prisma Car Care."
      support="Personal, fleet, or dealership — choose the account type that fits you."
    >
      <div className="auth-card auth-card--wide">
        <h2>Get started</h2>
        <p className="lede">Select the account that fits you.</p>

        <div className="choice-list">
          {OPTIONS.map((option) => (
            <Link
              key={option.type}
              className="choice-card"
              to={`/register/details?type=${option.type}`}
            >
              <strong>{option.title}</strong>
              <span>{option.subtitle}</span>
            </Link>
          ))}
        </div>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
          {" · "}
          <Link to="/book/guest">Book without an account</Link>
        </p>
      </div>
    </AuthSplit>
  );
}
