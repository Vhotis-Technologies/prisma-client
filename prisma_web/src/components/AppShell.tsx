import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { isBulkBookingEligible } from "../lib/account";
import { isDealershipPartner } from "../lib/format";
import BrandMark from "./BrandMark";
import { useBookingLiveUpdates } from "../app-hooks/useBookingLiveUpdates";

type AppShellProps = {
  children: ReactNode;
};

type NavIcon =
  | "home"
  | "book"
  | "car"
  | "history"
  | "branches"
  | "payouts"
  | "email"
  | "bell"
  | "tickets"
  | "pin"
  | "card"
  | "spark"
  | "invoice";

type NavItem = {
  to: string;
  label: string;
  icon: NavIcon;
  match?: "exact" | "prefix";
};

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.match === "exact") return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function Icon({ name }: { name: NavIcon }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 11h16" />
        </svg>
      );
    case "car":
      return (
        <svg {...common}>
          <path d="M5 16h14v3H5zM6.5 16 8 10h8l1.5 6" />
          <circle cx="8" cy="16" r="1.2" />
          <circle cx="16" cy="16" r="1.2" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5M9 5 7 3M15 5l2-2" />
        </svg>
      );
    case "branches":
      return (
        <svg {...common}>
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "payouts":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18M12 15h.01" />
        </svg>
      );
    case "email":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case "tickets":
      return (
        <svg {...common}>
          <path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z" />
          <path d="M12 7v12" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8" />
        </svg>
      );
    case "invoice":
      return (
        <svg {...common}>
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M15 3v4h4M9 12h6M9 16h6" />
        </svg>
      );
  }
}

export default function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  useBookingLiveUpdates();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const initial = (user?.name || user?.email || "P").charAt(0).toUpperCase();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const work: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: "home", match: "exact" },
    { to: "/book", label: "Book", icon: "book" },
    { to: "/garage", label: "Garage", icon: "car" },
    { to: "/history", label: "History", icon: "history" },
  ];
  if (user?.is_fleet_owner) work.push({ to: "/branches", label: "Branches", icon: "branches" });
  if (isDealershipPartner(user)) work.push({ to: "/payouts", label: "Payouts", icon: "payouts" });

  const account: NavItem[] = [
    { to: "/settings/email", label: "Email", icon: "email", match: "exact" },
    { to: "/settings/notifications", label: "Notifications", icon: "bell", match: "exact" },
    { to: "/settings/tickets", label: "Tickets", icon: "tickets" },
    { to: "/settings/addresses", label: "Addresses", icon: "pin", match: "exact" },
    { to: "/settings/payments", label: "Payment & Vouchers", icon: "card" },
    { to: "/settings/subscriptions", label: "Subscription", icon: "spark" },
  ];
  if (isBulkBookingEligible(user)) {
    account.push({ to: "/settings/invoices", label: "Invoices", icon: "invoice" });
  }

  function renderItems(items: NavItem[]) {
    return items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.match === "exact"}
        className={() => (isItemActive(item, location.pathname) ? "is-active" : undefined)}
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </NavLink>
    ));
  }

  return (
    <div className={`shell${open ? " is-nav-open" : ""}`}>
      <header className="shell-topbar">
        <button
          type="button"
          className="shell-menu-btn"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
        <BrandMark />
      </header>

      <div className="shell-scrim" hidden={!open} onClick={() => setOpen(false)} />

      <aside id="app-sidebar" className="shell-sidebar">
        <div className="shell-sidebar-brand">
          <BrandMark />
        </div>
        <nav className="shell-nav" aria-label="Main">
          <p className="shell-nav-label">Work</p>
          {renderItems(work)}
          <p className="shell-nav-label">Account</p>
          {renderItems(account)}
        </nav>
        <div className="shell-sidebar-end">
          {user ? (
            <NavLink
              to="/settings/profile"
              end
              className={({ isActive }) => `shell-user${isActive ? " is-active" : ""}`}
              aria-label="Open profile"
            >
              <span className="shell-avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="shell-user-meta">
                <strong>{user.name || "Account"}</strong>
                <span>{user.email}</span>
              </span>
            </NavLink>
          ) : null}
          <button
            type="button"
            className="shell-logout"
            onClick={() => {
              const ok = window.confirm("Log out of this account?");
              if (!ok) return;
              logout();
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
