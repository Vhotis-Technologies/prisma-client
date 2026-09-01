import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AppShell from "../components/AppShell";
import { useInvoiceDetail } from "../app-hooks/useInvoiceDetail";
import { formatMoney } from "../lib/format";
import { invoicePillClass, invoiceStatusLabel, isInvoicePayable } from "../lib/invoices";

export default function InvoiceDetailPage() {
  const { invoiceId = "" } = useParams();
  const { user } = useAuth();
  const country = user?.address?.country;
  const { allowed, checkout, loading, error, busy, load, payOnStripe } = useInvoiceDetail(user, invoiceId);

  if (!allowed) {
    return (
      <AppShell>
        <section className="welcome">
          <p className="kicker">
            <Link to="/settings/invoices">Invoices</Link>
          </p>
          <h1 className="page-title">Invoice</h1>
          <p className="lede">Bulk invoices are for fleet, branch, and partner accounts.</p>
        </section>
      </AppShell>
    );
  }

  const payable = Boolean(checkout && !checkout.already_paid && isInvoicePayable(checkout.payment_status));
  const due =
    checkout && checkout.amount_due_cents > 0 ? checkout.amount_due_cents / 100 : checkout?.total_amount ?? 0;

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">
            <Link to="/settings/invoices">Invoices</Link>
          </p>
          <h1 className="page-title">{checkout?.booking_reference || "Invoice"}</h1>
          <p className="lede">Pay on Stripe’s hosted invoice page. Refresh after you finish to update the status.</p>
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

      {loading && !checkout ? <p className="muted">Loading invoice…</p> : null}

      {checkout ? (
        <section className="card">
          <div className="card-row">
            <h2>Summary</h2>
            <span className={`pill ${invoicePillClass(checkout.payment_status)}`}>
              {checkout.already_paid ? "Paid" : invoiceStatusLabel(checkout.payment_status)}
            </span>
          </div>
          <dl className="meta">
            <div>
              <dt>Vehicles</dt>
              <dd>{checkout.number_of_vehicles}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatMoney(checkout.total_amount || 0, country)}</dd>
            </div>
            {!checkout.already_paid ? (
              <div>
                <dt>Amount due</dt>
                <dd>{formatMoney(due, country)}</dd>
              </div>
            ) : null}
          </dl>
          {payable ? (
            <div className="card-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void payOnStripe()}>
                {busy ? "Opening…" : "Pay on Stripe"}
              </button>
            </div>
          ) : null}
          {checkout.already_paid ? <p className="muted">This invoice is paid.</p> : null}
          {!checkout.already_paid && !payable && checkout.payment_status !== "invoice_later" ? (
            <p className="muted">This invoice is not payable.</p>
          ) : null}
        </section>
      ) : null}
    </AppShell>
  );
}
