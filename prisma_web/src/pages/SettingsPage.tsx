import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AddressDialog from "../components/AddressDialog";
import AppShell from "../components/AppShell";
import CreateTicketDialog from "../components/CreateTicketDialog";
import { canEditProfile, issueTypeLabel, showsBusinessName, ticketPillClass } from "../lib/account";
import { formatDateTime, formatStatus, usesBranchAddresses } from "../lib/format";
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../store/api/notificationApi";
import {
  deleteAddress,
  fetchAddresses,
  fetchProfile,
  updateEmailNotificationToken,
  updateMarketingEmailToken,
  updateProfile,
} from "../store/api/profileApi";
import { listTickets } from "../store/api/ticketApi";
import type { InboxNotification, SupportTicket } from "../types/account";
import type { SavedAddress } from "../types/address";
import type { UserProfile } from "../types/user";

const POLL_MS = 45_000;

type SettingsSection = "profile" | "email" | "notifications" | "tickets" | "addresses";

function settingsSection(pathname: string): SettingsSection {
  if (pathname.startsWith("/settings/email")) return "email";
  if (pathname.startsWith("/settings/notifications")) return "notifications";
  if (pathname.startsWith("/settings/tickets")) return "tickets";
  if (pathname.startsWith("/settings/addresses")) return "addresses";
  return "profile";
}

function formatLine(address: SavedAddress): string {
  return [address.city, address.post_code, address.country].filter(Boolean).join(", ");
}

function isRead(item: InboxNotification): boolean {
  return Boolean(item.is_read || item.isRead);
}

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const section = settingsSection(location.pathname);
  const branchScoped = usesBranchAddresses(user);
  const editable = canEditProfile(user);
  const businessNameField = showsBusinessName(user);

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");
  const [businessName, setBusinessName] = useState(user?.business_name || "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const [prefBusy, setPrefBusy] = useState<"email" | "marketing" | null>(null);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxBusy, setInboxBusy] = useState<string | null>(null);

  const applyProfile = useCallback(
    (profile: UserProfile) => {
      updateUser(profile);
      setName(profile.name || "");
      setPhone(profile.phone || "");
      setEmail(profile.email || "");
      setBusinessName(profile.business_name || "");
    },
    [updateUser],
  );

  const loadAddresses = useCallback(async () => {
    setAddressLoading(true);
    setAddressError(null);
    try {
      const data = await fetchAddresses();
      setAddresses(data.addresses || []);
    } catch (err) {
      setAddressError(authErrorMessage(err, "Could not load addresses."));
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const data = await listTickets();
      setTickets(data.tickets || []);
    } catch (err) {
      setTicketsError(authErrorMessage(err, "Could not load tickets."));
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setInboxLoading(true);
    setInboxError(null);
    try {
      const data = await getNotifications();
      const list = Array.isArray(data) ? data : [];
      setNotifications(
        [...list].sort((a, b) => {
          const left = new Date(b.timestamp).getTime();
          const right = new Date(a.timestamp).getTime();
          return left - right;
        }),
      );
    } catch (err) {
      setInboxError(authErrorMessage(err, "Could not load notifications."));
    } finally {
      if (!silent) setInboxLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchProfile();
        if (data.profile) applyProfile(data.profile);
      } catch {
        /* keep the session user */
      }
    })();
  }, [applyProfile]);

  useEffect(() => {
    if (section === "addresses") void loadAddresses();
    if (section === "tickets") void loadTickets();
    if (section === "notifications") void loadNotifications();
  }, [section, loadAddresses, loadTickets, loadNotifications]);

  useEffect(() => {
    if (section !== "notifications") return;
    const timer = window.setInterval(() => {
      void loadNotifications(true);
    }, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void loadNotifications(true);
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [section, loadNotifications]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!editable) return;
    const nextName = name.trim();
    if (!nextName) {
      setProfileError("Name is required.");
      return;
    }
    setProfileBusy(true);
    setProfileError(null);
    setProfileOk(null);
    try {
      const payload: Record<string, string> = {
        name: nextName,
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
      };
      if (businessNameField) payload.business_name = businessName.trim();
      const data = await updateProfile(payload);
      if (data.profile) applyProfile(data.profile);
      setProfileOk("Profile saved.");
    } catch (err) {
      setProfileError(authErrorMessage(err, "Could not save your profile."));
    } finally {
      setProfileBusy(false);
    }
  }

  async function setPreference(kind: "email" | "marketing", next: boolean) {
    setPrefBusy(kind);
    setProfileError(null);
    try {
      if (kind === "email") await updateEmailNotificationToken(next);
      else await updateMarketingEmailToken(next);
      if (user) {
        updateUser({
          ...user,
          email_notification_token: kind === "email" ? next : user.email_notification_token,
          marketing_email_token: kind === "marketing" ? next : user.marketing_email_token,
        });
      }
    } catch (err) {
      setProfileError(authErrorMessage(err, "Could not update that preference."));
    } finally {
      setPrefBusy(null);
    }
  }

  async function removeAddress(address: SavedAddress) {
    const ok = window.confirm(`Remove ${address.address}?`);
    if (!ok) return;
    setDeletingId(address.id);
    setAddressError(null);
    try {
      await deleteAddress(address.id);
      await loadAddresses();
    } catch (err) {
      setAddressError(authErrorMessage(err, "Could not remove this address."));
    } finally {
      setDeletingId(null);
    }
  }

  async function markRead(item: InboxNotification) {
    if (isRead(item)) return;
    setNotifications((current) =>
      current.map((row) => (row.id === item.id ? { ...row, is_read: true, isRead: true } : row)),
    );
    try {
      await markNotificationRead(item.id);
    } catch (err) {
      setInboxError(authErrorMessage(err, "Could not mark that notification as read."));
      await loadNotifications(true);
    }
  }

  async function markAllRead() {
    const ids = notifications.filter((item) => !isRead(item)).map((item) => item.id);
    if (ids.length === 0) return;
    setInboxBusy("all");
    setNotifications((current) => current.map((row) => ({ ...row, is_read: true, isRead: true })));
    try {
      await markAllNotificationsRead(ids);
    } catch (err) {
      setInboxError(authErrorMessage(err, "Could not mark notifications as read."));
      await loadNotifications(true);
    } finally {
      setInboxBusy(null);
    }
  }

  async function removeNotification(item: InboxNotification) {
    const ok = window.confirm("Remove this notification?");
    if (!ok) return;
    setInboxBusy(item.id);
    setNotifications((current) => current.filter((row) => row.id !== item.id));
    try {
      await deleteNotification(item.id);
    } catch (err) {
      setInboxError(authErrorMessage(err, "Could not remove that notification."));
      await loadNotifications(true);
    } finally {
      setInboxBusy(null);
    }
  }

  const unreadCount = notifications.filter((item) => !isRead(item)).length;

  const titles: Record<SettingsSection, { kicker: string; title: string; lede: string }> = {
    profile: {
      kicker: "Account",
      title: "Profile",
      lede: editable
        ? "Name and contact details used across bookings and support."
        : "Branch admin profiles are managed by the fleet owner.",
    },
    email: {
      kicker: "Account",
      title: "Email",
      lede: "Web does not use push notifications. These control the emails we send.",
    },
    notifications: {
      kicker: "Account",
      title: "Notifications",
      lede: "In-app notices from your bookings. This page checks for new ones every 45 seconds.",
    },
    tickets: {
      kicker: "Account",
      title: "Tickets",
      lede: "Open a support ticket if something goes wrong with a booking, payment, or account.",
    },
    addresses: {
      kicker: "Account",
      title: "Addresses",
      lede: branchScoped
        ? "These are your branch locations. Personal service addresses are for personal accounts."
        : "Used when you book a wash. Search with Google Places, then adjust the fields if needed.",
    },
  };

  const heading = titles[section];

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">{heading.kicker}</p>
          <h1 className="page-title">{heading.title}</h1>
          <p className="lede">{heading.lede}</p>
        </div>
        {section === "notifications" && unreadCount > 0 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void markAllRead()}
            disabled={inboxBusy === "all"}
          >
            {inboxBusy === "all" ? "Updating…" : "Mark all read"}
          </button>
        ) : null}
        {section === "tickets" ? (
          <button type="button" className="btn btn-primary" onClick={() => setTicketOpen(true)}>
            Open a ticket
          </button>
        ) : null}
        {section === "addresses" && !branchScoped ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Add address
          </button>
        ) : null}
      </section>

      {section === "profile" ? (
        <>
          {profileError ? (
            <div className="banner banner-error" role="alert">
              {profileError}
            </div>
          ) : null}
          {profileOk ? (
            <div className="banner banner-ok" role="status">
              {profileOk}
            </div>
          ) : null}

          <form className="card profile-form" onSubmit={(e) => void saveProfile(e)}>
            <div className="field-grid">
              <label className="field">
                <span>Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!editable}
                  autoComplete="name"
                  required
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!editable}
                  autoComplete="tel"
                  maxLength={15}
                />
              </label>
            </div>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!editable}
                autoComplete="email"
                required
              />
            </label>
            {businessNameField ? (
              <label className="field">
                <span>Business name</span>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={!editable}
                />
              </label>
            ) : null}
            {user?.referral_code ? (
              <p className="muted">
                Referral code <code>{user.referral_code}</code>
              </p>
            ) : null}
            {editable ? (
              <div className="card-actions">
                <button type="submit" className="btn btn-primary" disabled={profileBusy}>
                  {profileBusy ? "Saving…" : "Save profile"}
                </button>
              </div>
            ) : null}
          </form>
        </>
      ) : null}

      {section === "email" ? (
        <>
          {profileError ? (
            <div className="banner banner-error" role="alert">
              {profileError}
            </div>
          ) : null}
          <section className="card pref-list">
            <label className="pref-row">
              <span>
                <strong>Service emails</strong>
                <p className="muted">Booking confirmations, reminders, and account notices.</p>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(user?.email_notification_token)}
                disabled={prefBusy === "email"}
                onChange={(e) => void setPreference("email", e.target.checked)}
              />
            </label>
            <label className="pref-row">
              <span>
                <strong>Marketing emails</strong>
                <p className="muted">Offers, loyalty updates, and occasional news.</p>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(user?.marketing_email_token)}
                disabled={prefBusy === "marketing"}
                onChange={(e) => void setPreference("marketing", e.target.checked)}
              />
            </label>
          </section>
        </>
      ) : null}

      {section === "notifications" ? (
        <>
          {inboxError ? (
            <div className="banner banner-error" role="alert">
              {inboxError}
            </div>
          ) : null}

          {inboxLoading ? <p className="muted">Loading notifications…</p> : null}

          {!inboxLoading && notifications.length === 0 ? (
            <section className="card">
              <h2>No notifications</h2>
              <p className="muted">Booking updates will appear here. We do not send browser push on web.</p>
            </section>
          ) : null}

          {notifications.length > 0 ? (
            <ul className="notice-list">
              {notifications.map((item) => (
                <li key={item.id} className={isRead(item) ? "notice-card" : "notice-card is-unread"}>
                  <button type="button" className="notice-main" onClick={() => void markRead(item)}>
                    <strong>{item.title}</strong>
                    <p>{item.message}</p>
                    <p className="muted">{formatDateTime(item.timestamp)}</p>
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void removeNotification(item)}
                    disabled={inboxBusy === item.id}
                  >
                    {inboxBusy === item.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {section === "tickets" ? (
        <>
          {ticketsError ? (
            <div className="banner banner-error" role="alert">
              {ticketsError}
            </div>
          ) : null}

          {ticketsLoading ? <p className="muted">Loading tickets…</p> : null}

          {!ticketsLoading && tickets.length === 0 ? (
            <section className="card">
              <h2>No tickets yet</h2>
              <p className="muted">If you need help, open a ticket and we will follow up by email.</p>
            </section>
          ) : null}

          {tickets.length > 0 ? (
            <ul className="booking-list">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link className="booking-item history-link" to={`/settings/tickets/${ticket.id}`}>
                    <div className="booking-item-top">
                      <strong>{ticket.ticket_code || ticket.subject || "Ticket"}</strong>
                      <span className={`pill ${ticketPillClass(ticket.status)}`}>{formatStatus(ticket.status)}</span>
                    </div>
                    <p>{ticket.summary || ticket.subject}</p>
                    <p className="muted">
                      {issueTypeLabel(ticket.issue_type)}
                      {ticket.booking_reference ? ` · ${ticket.booking_reference}` : ""}
                    </p>
                    <p className="muted">{formatDateTime(ticket.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {section === "addresses" ? (
        <>
          {addressError ? (
            <div className="banner banner-error" role="alert">
              {addressError}
            </div>
          ) : null}

          {addressLoading ? <p className="muted">Loading addresses…</p> : null}

          {!addressLoading && addresses.length === 0 ? (
            <section className="card">
              <h2>No addresses yet</h2>
              <p className="muted">
                {branchScoped
                  ? "No branch locations are set up yet."
                  : "Add a service address so it is ready when you book."}
              </p>
              {branchScoped ? null : (
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setEditing(null);
                      setDialogOpen(true);
                    }}
                  >
                    Add an address
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {addresses.length > 0 ? (
            <ul className="address-list">
              {addresses.map((item) => (
                <li key={item.id} className="address-card">
                  <div>
                    <strong>{item.address}</strong>
                    <p className="muted">{formatLine(item)}</p>
                  </div>
                  {branchScoped ? null : (
                    <div className="vehicle-card-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditing(item);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void removeAddress(item)}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {section === "addresses" && !branchScoped ? (
        <AddressDialog
          open={dialogOpen}
          initial={editing}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
          onSaved={() => void loadAddresses()}
        />
      ) : null}

      <CreateTicketDialog
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        onCreated={(ticket) => {
          void loadTickets();
          navigate(`/settings/tickets/${ticket.id}`);
        }}
      />
    </AppShell>
  );
}
