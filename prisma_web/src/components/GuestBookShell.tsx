import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import BrandMark from "./BrandMark";

type GuestBookShellProps = {
  children: ReactNode;
  /** Where the header Back link goes. Default `/welcome`. */
  backTo?: string;
  /** Back-link label. Default `Back`. */
  backLabel?: string;
};

/**
 * Public layout for guest checkout, confirmation, and results.
 * Not AppShell: AppShell is auth-gated and would bounce this funnel to login.
 */
export default function GuestBookShell({
  children,
  backTo = "/welcome",
  backLabel = "Back",
}: GuestBookShellProps) {
  return (
    <div className="guest-shell">
      <header className="guest-shell-header">
        <BrandMark />
        <nav className="guest-shell-nav">
          <Link to={backTo} className="btn btn-ghost">
            {backLabel}
          </Link>
          <Link to="/login" className="btn btn-ghost">
            Sign in
          </Link>
        </nav>
      </header>
      <main className="guest-shell-main">{children}</main>
    </div>
  );
}
