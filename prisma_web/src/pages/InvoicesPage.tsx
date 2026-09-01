import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AppShell from "../components/AppShell";
import { useInvoices } from "../app-hooks/useInvoices";
import { formatDateTime, formatMoney } from "../lib/format";
import { invoicePillClass, invoiceStatusLabel } from "../lib/invoices";

export default function InvoicesPage() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const { allowed, invoices, loading, error, load } = useInvoices(user);
  const showCreator = Boolean(user?.is_fleet_owner);

  if (!allowed) {
    return (
      <AppShell>
        <section className="welcome">
          <p className="kicker">Account</p>
          <h1 className="page-title">Invoices</h1>
          <p className="lede">Bulk invoices are for fleet, branch, and partner accounts.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">Account</p>
          <h1 className="page-title">Invoices</h1>
          <p className="lede">Pay-later bulk bookings. Unpaid invoices open Stripe’s hosted payment page.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </section>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading && invoices.length === 0 ? <p className="muted">Loading invoices…</p> : null}

      {!loading && invoices.length === 0 ? (
        <section className="card">
          <h2>No invoices yet</h2>
          <p className="muted">Invoice-later bulk bookings will appear here.</p>
          <div className="card-actions">
            <Link to="/book" className="btn btn-primary">
              Book
            </Link>
          </div>
        </section>
      ) : null}

      {invoices.length > 0 ? (
        <ul className="booking-list">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link className="booking-item history-link" to={`/settings/invoices/${invoice.id}`}>
                <div className="booking-item-top">
                  <strong>{invoice.booking_reference || "Invoice"}</strong>
                  <span className={`pill ${invoicePillClass(invoice.payment_status)}`}>
                    {invoiceStatusLabel(invoice.payment_status)}
                  </span>
                </div>
                <p>
                  {formatMoney(invoice.total_amount ?? 0, country)} · {invoice.number_of_vehicles} vehicles
                </p>
                {invoice.created_at ? <p className="muted">{formatDateTime(invoice.created_at)}</p> : null}
                {showCreator && invoice.created_by?.name ? (
                  <p className="muted">
                    {invoice.created_by.name}
                    {invoice.branch?.name ? ` · ${invoice.branch.name}` : ""}
                  </p>
                ) : invoice.branch?.name ? (
                  <p className="muted">{invoice.branch.name}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}
