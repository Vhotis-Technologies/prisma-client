import { useEffect, useState, type FormEvent } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import { createTicket } from "../store/api/ticketApi";
import { TICKET_ISSUE_TYPES, type SupportTicket, type TicketIssueType } from "../types/account";

type CreateTicketDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (ticket: SupportTicket) => void;
};

export default function CreateTicketDialog({ open, onClose, onCreated }: CreateTicketDialogProps) {
  const [issueType, setIssueType] = useState<TicketIssueType>("booking");
  const [bookingReference, setBookingReference] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIssueType("booking");
    setBookingReference("");
    setDescription("");
    setError(null);
    setBusy(false);
  }, [open]);

  if (!open) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = description.trim();
    if (!text) {
      setError("Please describe the issue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await createTicket({
        issue_type: issueType,
        booking_reference: bookingReference.trim() || undefined,
        description: text,
      });
      onCreated(data);
      onClose();
    } catch (err) {
      setError(authErrorMessage(err, "Could not open this ticket."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog dialog--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="ticket-dialog-title">Open a ticket</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dialog-body">
          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            {error ? (
              <div className="banner banner-error" role="alert">
                {error}
              </div>
            ) : null}
            <label className="field">
              <span>Issue type</span>
              <select value={issueType} onChange={(e) => setIssueType(e.target.value as TicketIssueType)}>
                {TICKET_ISSUE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Booking reference (optional)</span>
              <input
                value={bookingReference}
                onChange={(e) => setBookingReference(e.target.value)}
                placeholder="If this is about a booking"
              />
            </label>
            <label className="field">
              <span>What happened?</span>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Give us enough detail to look into it."
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Sending…" : "Submit ticket"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
