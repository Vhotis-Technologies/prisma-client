import { Link, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import { useTicketDetail } from "../app-hooks/useTicketDetail";
import { formatDateTime, formatStatus } from "../lib/format";
import { issueTypeLabel, ticketPillClass } from "../lib/account";

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const { ticket, loading, error } = useTicketDetail(ticketId);

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">
            <Link to="/settings/tickets">Tickets</Link>
          </p>
          <h1 className="page-title">{ticket?.ticket_code || "Ticket"}</h1>
          <p className="lede">
            {ticket ? issueTypeLabel(ticket.issue_type) : "Updates from Prisma Car Care support appear here."}
          </p>
        </div>
        {ticket ? (
          <span className={`pill ${ticketPillClass(ticket.status)}`}>{formatStatus(ticket.status)}</span>
        ) : null}
      </section>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? <p className="muted">Loading ticket…</p> : null}

      {ticket ? (
        <>
          <section className="card">
            <h2>Details</h2>
            <dl className="meta">
              <div>
                <dt>Opened</dt>
                <dd>{formatDateTime(ticket.created_at)}</dd>
              </div>
              {ticket.booking_reference ? (
                <div>
                  <dt>Booking</dt>
                  <dd>{ticket.booking_reference}</dd>
                </div>
              ) : null}
            </dl>
            <p>{ticket.description}</p>
          </section>

          <section className="welcome">
            <h2 className="section-title">Updates</h2>
            {ticket.updates.length === 0 ? (
              <p className="muted">No replies yet. We will email you when support responds.</p>
            ) : (
              <ol className="ticket-timeline">
                {ticket.updates.map((update, index) => (
                  <li key={`${update.created_at}-${index}`}>
                    <strong>
                      {update.kind === "status_change"
                        ? `Status: ${formatStatus(update.status_to || "")}`
                        : "Reply"}
                    </strong>
                    <p className="muted">{formatDateTime(update.created_at)}</p>
                    {update.message ? <p>{update.message}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
