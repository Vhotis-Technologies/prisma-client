import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AppShell from "../components/AppShell";
import { useServiceHistory } from "../app-hooks/useServiceHistory";
import { formatDate, formatMoney, formatStatus } from "../lib/format";
import { dateKey } from "../lib/media";
import type { HistoryItem } from "../types/history";

function headingFor(isoDay: string): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayKey = `${y}-${m}-${d}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (isoDay === todayKey) return "Today";
  if (isoDay === yKey) return "Yesterday";
  return formatDate(isoDay);
}

export default function HistoryPage() {
  const { user } = useAuth();
  const country = user?.address?.country;
  const { items, loading, error, load } = useServiceHistory();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const reg = (item.vehicle_reg || "").toLowerCase();
      const amount = String(item.total_amount ?? "");
      const reference = (item.booking_reference || item.id || "").toLowerCase();
      return reg.includes(q) || amount.includes(q) || reference.includes(q);
    });
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const item of filtered) {
      const key = dateKey(item.appointment_date);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <AppShell>
      <section className="welcome welcome--split">
        <div>
          <p className="kicker">History</p>
          <h1 className="page-title">Past services</h1>
          <p className="lede">Completed jobs on your account. Open one to see before and after photos.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </section>

      {items.length > 0 ? (
        <label className="field">
          <span className="visually-hidden">Search history</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by plate, amount, or reference"
          />
        </label>
      ) : null}

      {error ? (
        <div className="banner banner-error" role="alert">
          We couldn’t load your service history. Please try again.
        </div>
      ) : null}

      {loading ? <p className="muted">Loading history…</p> : null}

      {!loading && items.length === 0 ? (
        <section className="card">
          <h2>No completed jobs yet</h2>
          <p className="muted">When a wash is finished, it will show up here with before and after photos.</p>
          <div className="card-actions">
            <Link to="/book" className="btn btn-primary">
              Book a service
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && items.length > 0 && grouped.length === 0 ? (
        <section className="card">
          <h2>No matches</h2>
          <p className="muted">Nothing matches “{query.trim()}”. Try a plate, amount, or booking reference.</p>
        </section>
      ) : null}

      {grouped.map(([day, dayItems]) => (
        <section key={day} className="history-group">
          <h2 className="section-title">{headingFor(day)}</h2>
          <ul className="booking-list">
            {dayItems.map((item) => (
              <li key={item.id}>
                <Link
                  className="booking-item history-link"
                  to={`/history/${item.id}`}
                  state={item}
                >
                  <div className="booking-item-top">
                    <strong>
                      {item.service_type}
                      {item.valet_type ? ` · ${item.valet_type}` : ""}
                    </strong>
                    <span className={`pill ${item.status === "completed" ? "pill-ok" : "pill-pending"}`}>
                      {formatStatus(item.status)}
                    </span>
                  </div>
                  <p>{formatDate(dateKey(item.appointment_date))}</p>
                  <p className="muted">{item.vehicle_reg || "Vehicle"}</p>
                  <p className="muted">
                    {[item.address?.address, item.address?.city].filter(Boolean).join(", ") || "Address on file"}
                  </p>
                  <p className="booking-meta">
                    {formatMoney(item.total_amount || 0, country)}
                    {item.detailer?.name ? ` · ${item.detailer.name}` : ""}
                    {item.booking_reference ? ` · ${item.booking_reference}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </AppShell>
  );
}
