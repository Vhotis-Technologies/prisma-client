import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AddressDialog from "../components/AddressDialog";
import AppShell from "../components/AppShell";
import PaymentForm from "../components/PaymentForm";
import StripeCheckout from "../components/StripeCheckout";
import { saveConfirmationSnapshot, waitForPaymentConfirmation } from "../lib/bookingCheckout";
import {
  MIN_BULK_VEHICLES,
  buildBulkBookingData,
  bulkPayableAfterComplimentary,
  bulkPricing,
  complimentaryVehiclesApplied,
  fleetUnitPrice,
  isQuickSparkleService,
  newBulkBookingReference,
  windowLabel,
} from "../lib/bulkBooking";
import { formatDate, formatDuration, formatMoney, usesBranchAddresses } from "../lib/format";
import { hasStripeKey, intentIdFromClientSecret, stripePromise } from "../lib/stripe";
import {
  checkBulkCapacity,
  fetchAddOns,
  fetchServiceType,
  fetchValetType,
} from "../store/api/eventApi";
import {
  createBulkOrderInvoiceLater,
  createPaymentSheet,
  getComplimentaryAvailability,
  getInvoiceLaterEligibility,
} from "../store/api/paymentApi";
import { fetchAddresses } from "../store/api/profileApi";
import type { SavedAddress } from "../types/address";
import type { ComplimentaryAvailability, InvoiceLaterEligibility } from "../types/invoice";
import type {
  AddOn,
  BulkCapacityOption,
  ServiceType,
  ValetType,
} from "../types/booking";

const STEPS = [
  { id: 1, title: "Service" },
  { id: 2, title: "Valet" },
  { id: 3, title: "Details" },
  { id: 4, title: "Capacity" },
] as const;

function asId(value: string | number | undefined): string {
  return String(value ?? "");
}

function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function descriptionLines(description: string | string[] | undefined): string[] {
  if (!description) return [];
  if (Array.isArray(description)) return description.map(String).map((line) => line.trim()).filter(Boolean);
  return description
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addressLine(address: SavedAddress): string {
  return [address.address, address.city, address.post_code].filter(Boolean).join(", ");
}

export default function BulkBookPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const country = user?.address?.country;
  const branchAddresses = usesBranchAddresses(user);

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [valetTypes, setValetTypes] = useState<ValetType[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);

  const [service, setService] = useState<ServiceType | null>(null);
  const [valet, setValet] = useState<ValetType | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<AddOn[]>([]);
  const [vehicleCount, setVehicleCount] = useState<number | "">(MIN_BULK_VEHICLES);
  const [isSuv, setIsSuv] = useState(false);
  const [address, setAddress] = useState<SavedAddress | null>(null);
  const [dateIso, setDateIso] = useState(todayIso());
  const [instructions, setInstructions] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);

  const [capacityOptions, setCapacityOptions] = useState<BulkCapacityOption[] | null>(null);
  const [selectedOption, setSelectedOption] = useState<BulkCapacityOption | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);

  const [payLater, setPayLater] = useState(false);
  const [invoiceLater, setInvoiceLater] = useState<InvoiceLaterEligibility | null>(null);
  const [complimentaryAvailable, setComplimentaryAvailable] = useState<ComplimentaryAvailability | null>(null);
  const [useComplimentary, setUseComplimentary] = useState(false);
  const [coolingOff, setCoolingOff] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const vehicleTotal = typeof vehicleCount === "number" && vehicleCount > 0 ? vehicleCount : 0;

  const pricing = useMemo(
    () => bulkPricing({ service, addons: selectedAddons, numberOfVehicles: vehicleTotal, isSuv }),
    [service, selectedAddons, vehicleTotal, isSuv],
  );

  const isQuickSparkle = isQuickSparkleService(service);
  const complimentaryApplied = complimentaryVehiclesApplied(
    complimentaryAvailable?.remaining ?? 0,
    pricing.count,
    Boolean(useComplimentary && isQuickSparkle && complimentaryAvailable?.available),
  );
  const { payable, credit: sparkleCredit } = bulkPayableAfterComplimentary(
    pricing,
    complimentaryApplied,
    isSuv,
  );

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setError(null);
    try {
      const [addressesRes, servicesRes, valetsRes, addonsRes, invoiceLaterRes] = await Promise.allSettled([
        fetchAddresses(),
        fetchServiceType(),
        fetchValetType(),
        fetchAddOns(),
        getInvoiceLaterEligibility(),
      ]);

      if (addressesRes.status === "fulfilled") {
        const list = addressesRes.value.addresses || [];
        setAddresses(list);
        setAddress((prev) => prev || list[0] || null);
      } else {
        setError(authErrorMessage(addressesRes.reason, "Could not load service addresses."));
      }
      if (servicesRes.status === "fulfilled") setServiceTypes(servicesRes.value || []);
      if (valetsRes.status === "fulfilled") setValetTypes(valetsRes.value || []);
      if (addonsRes.status === "fulfilled") setAddOns(addonsRes.value || []);
      if (invoiceLaterRes.status === "fulfilled") {
        const eligibility = invoiceLaterRes.value;
        setInvoiceLater(eligibility);
        if (!eligibility.allowed) setPayLater(false);
      }
      if (user?.is_fleet_owner || user?.is_branch_admin) {
        try {
          setComplimentaryAvailable(await getComplimentaryAvailability());
        } catch {
          setComplimentaryAvailable(null);
        }
      } else {
        setComplimentaryAvailable(null);
      }
    } finally {
      setCatalogLoading(false);
    }
  }, [user?.is_fleet_owner, user?.is_branch_admin]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!isQuickSparkle || !complimentaryAvailable?.available || (complimentaryAvailable.remaining ?? 0) < 1) {
      setUseComplimentary(false);
    }
  }, [isQuickSparkle, complimentaryAvailable?.available, complimentaryAvailable?.remaining]);

  useEffect(() => {
    setCapacityOptions(null);
    setSelectedOption(null);
    setCapacityError(null);
    setClientSecret(null);
    setPaymentIntentId(null);
  }, [service?.id, valet?.id, address?.id, dateIso, vehicleTotal, isSuv, selectedAddons]);

  const stepValid = {
    1: Boolean(service) && vehicleTotal >= MIN_BULK_VEHICLES,
    2: Boolean(valet),
    3: Boolean(address && dateIso >= todayIso() && address.city && address.country),
    4: Boolean(selectedOption) && !capacityLoading,
  };

  function toggleAddon(addon: AddOn) {
    setSelectedAddons((prev) => {
      const exists = prev.some((item) => asId(item.id) === asId(addon.id));
      if (exists) return prev.filter((item) => asId(item.id) !== asId(addon.id));
      return [...prev, addon];
    });
  }

  async function checkCapacity() {
    if (!service || !address || vehicleTotal < MIN_BULK_VEHICLES) {
      setCapacityError("Choose a service, address, date, and at least 2 vehicles first.");
      return;
    }
    if (!address.city || !address.country) {
      setCapacityError("This address needs a city and country to check capacity.");
      return;
    }
    setCapacityLoading(true);
    setCapacityError(null);
    setCapacityOptions(null);
    setSelectedOption(null);
    try {
      const params: Record<string, string | number> = {
        date: dateIso,
        workload_minutes: pricing.workloadMinutes,
        service_duration: service.duration || 60,
        country: address.country,
        city: address.city,
      };
      if (dateIso === todayIso()) params.now = new Date().toISOString();
      if (address.latitude != null) params.latitude = address.latitude;
      if (address.longitude != null) params.longitude = address.longitude;
      const data = await checkBulkCapacity(params);
      if (data.error || !data.available || !data.options?.length) {
        setCapacityError(
          data.error || "Not enough capacity on this date. Try another date or fewer vehicles.",
        );
        return;
      }
      setCapacityOptions(data.options);
      setSelectedOption(data.options[0]);
    } catch (err) {
      setCapacityError(authErrorMessage(err, "Unable to check capacity. Please try again."));
    } finally {
      setCapacityLoading(false);
    }
  }

  function goNext() {
    if (step < 4 && stepValid[step as 1 | 2 | 3]) setStep(step + 1);
  }

  function goBack() {
    if (clientSecret) {
      setClientSecret(null);
      setPaymentIntentId(null);
      return;
    }
    if (step > 1) setStep(step - 1);
  }

  function snapshotPayload(bookingReference: string, invoiceLater: boolean) {
    if (!service || !valet || !address) return null;
    return {
      bookingReference,
      serviceName: service.name,
      valetName: valet.name,
      dateIso,
      timeSlot: selectedOption?.best_start_time || "06:00",
      endTime: selectedOption?.estimated_finish_time,
      vehicleLine: `${pricing.count} vehicle${pricing.count === 1 ? "" : "s"}`,
      addressLine: addressLine(address),
      total: payable,
      free: payable === 0,
      invoiceLater,
      numberOfVehicles: pricing.count,
    };
  }

  function goToConfirmation(bookingReference: string, invoiceLater: boolean) {
    const payload = snapshotPayload(bookingReference, invoiceLater);
    if (!payload) return;
    saveConfirmationSnapshot(payload);
    navigate("/book/confirmation", { state: payload });
  }

  async function finishPaid(paymentIntentId: string) {
    setPaying(true);
    setError(null);
    try {
      const confirmed = await waitForPaymentConfirmation(paymentIntentId);
      goToConfirmation(confirmed.booking_reference || newBulkBookingReference(), false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment confirmation failed.");
    } finally {
      setPaying(false);
    }
  }

  async function submitOrder() {
    if (!service || !valet || !address || !selectedOption) return;
    if (vehicleTotal < MIN_BULK_VEHICLES) {
      setError("Bulk bookings need at least 2 vehicles.");
      return;
    }
    if (!coolingOff) {
      setError("Please agree to the cooling-off note before confirming.");
      return;
    }
    if (payLater && payable > 0 && invoiceLater && !invoiceLater.allowed) {
      setError(invoiceLater.message || "Invoice later is not available. You can still pay now.");
      setPayLater(false);
      return;
    }
    if (payable > 0 && !payLater && !hasStripeKey()) {
      setError("Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY.");
      return;
    }
    setPaying(true);
    setError(null);
    const bookingReference = newBulkBookingReference();
    const bookingData = buildBulkBookingData({
      bookingReference,
      service,
      valet,
      addons: selectedAddons,
      address,
      dateIso,
      option: selectedOption,
      numberOfVehicles: pricing.count,
      isSuv,
      instructions,
      pricing,
    });
    bookingData.total_amount = payable;
    if (useComplimentary && complimentaryApplied > 0) {
      bookingData.use_complimentary_sparkle = true;
      bookingData.complimentary_vehicles_applied = complimentaryApplied;
      bookingData.complimentary_credit = sparkleCredit;
    }

    try {
      if (payLater || payable === 0) {
        const data = await createBulkOrderInvoiceLater({
          booking_data: bookingData,
          booking_reference: bookingReference,
        });
        goToConfirmation(data.booking_reference || bookingReference, payable > 0 && payLater);
        return;
      }
      const data = await createPaymentSheet({
        amount: Math.round(payable * 100),
        booking_reference: bookingReference,
        booking_data: bookingData,
      });
      if (!data.paymentIntent) {
        setError("Could not start payment. Please try again.");
        return;
      }
      const snap = snapshotPayload(data.booking_reference || bookingReference, false);
      if (snap) saveConfirmationSnapshot(snap);
      setClientSecret(data.paymentIntent);
      setPaymentIntentId(data.paymentIntentId || intentIdFromClientSecret(data.paymentIntent));
    } catch (err) {
      setError(authErrorMessage(err, payLater ? "Could not send the invoice." : "Could not start payment."));
    } finally {
      setPaying(false);
    }
  }

  return (
    <AppShell>
      <section className="welcome">
        <p className="kicker">Book</p>
        <h1 className="page-title">Bulk order</h1>
        <p className="lede">
          Same-site fleet booking: pick a service, count, and window, then pay now or email an invoice.
        </p>
      </section>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <ol className="wizard-steps">
        {STEPS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`wizard-step${step === item.id ? " is-current" : ""}${step > item.id ? " is-done" : ""}`}
              onClick={() => {
                if (item.id <= step) setStep(item.id);
              }}
              disabled={item.id > step}
            >
              <span>{item.id}</span>
              {item.title}
            </button>
          </li>
        ))}
      </ol>

      {catalogLoading ? <p className="muted">Loading booking options…</p> : null}

      {!catalogLoading && step === 1 ? (
        <section className="wizard-panel">
          <h2 className="section-title">Service type</h2>
          <ul className="stack-list">
            {serviceTypes.map((item) => {
              const selected = asId(service?.id) === asId(item.id);
              return (
                <li key={asId(item.id)}>
                  <button
                    type="button"
                    className={`stack-card${selected ? " is-selected" : ""}`}
                    onClick={() => setService(item)}
                  >
                    <div className="stack-card-top">
                      <strong>{item.name}</strong>
                      <span>{formatMoney(fleetUnitPrice(item), country)}</span>
                    </div>
                    <p className="muted">{formatDuration(asNum(item.duration))} per vehicle</p>
                    {descriptionLines(item.description).length > 0 ? (
                      <ul className="stack-copy">
                        {descriptionLines(item.description).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <label className="field">
            <span>Number of vehicles</span>
            <input
              type="number"
              min={MIN_BULK_VEHICLES}
              step={1}
              inputMode="numeric"
              value={vehicleCount}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setVehicleCount("");
                  return;
                }
                const parsed = Number.parseInt(raw, 10);
                if (!Number.isFinite(parsed) || parsed < 1) {
                  setVehicleCount("");
                  return;
                }
                setVehicleCount(parsed);
              }}
              onBlur={() => {
                if (typeof vehicleCount !== "number" || vehicleCount < MIN_BULK_VEHICLES) {
                  setVehicleCount(MIN_BULK_VEHICLES);
                }
              }}
            />
            {typeof vehicleCount === "number" && vehicleCount > 0 && vehicleCount < MIN_BULK_VEHICLES ? (
              <span className="muted">Enter at least 2 vehicles to continue.</span>
            ) : (
              <span className="muted">Minimum 2 vehicles.</span>
            )}
          </label>
          <label className="check-row">
            <input type="checkbox" checked={isSuv} onChange={(e) => setIsSuv(e.target.checked)} />
            <span>SUV / MPV vehicles — 20% surcharge for the whole order.</span>
          </label>
        </section>
      ) : null}

      {!catalogLoading && step === 2 ? (
        <section className="wizard-panel">
          <h2 className="section-title">Valet type</h2>
          <ul className="stack-list">
            {valetTypes.map((item) => {
              const selected = asId(valet?.id) === asId(item.id);
              return (
                <li key={asId(item.id)}>
                  <button
                    type="button"
                    className={`stack-card${selected ? " is-selected" : ""}`}
                    onClick={() => setValet(item)}
                  >
                    <strong>{item.name}</strong>
                    <p className="muted">{item.description}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          <h2 className="section-title">Add-ons (optional)</h2>
          <p className="muted">Applied to every vehicle in the order.</p>
          <ul className="stack-list">
            {addOns.map((item) => {
              const selected = selectedAddons.some((addon) => asId(addon.id) === asId(item.id));
              return (
                <li key={asId(item.id)}>
                  <button
                    type="button"
                    className={`stack-card${selected ? " is-selected" : ""}`}
                    onClick={() => toggleAddon(item)}
                  >
                    <div className="stack-card-top">
                      <strong>{item.name}</strong>
                      <span>{formatMoney(asNum(item.price), country)}</span>
                    </div>
                    <p className="muted">+{formatDuration(asNum(item.extra_duration))} per vehicle</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!catalogLoading && step === 3 ? (
        <section className="wizard-panel">
          <h2 className="section-title">Site address</h2>
          {addresses.length === 0 ? (
            <div className="card">
              <h2>No address yet</h2>
              <p className="muted">
                {branchAddresses
                  ? "Add a branch first so bulk orders have a site."
                  : "Save a service address, then come back to book."}
              </p>
              <div className="card-actions">
                {branchAddresses && user?.is_fleet_owner ? (
                  <Link to="/branches" className="btn btn-primary">
                    Manage branches
                  </Link>
                ) : !branchAddresses ? (
                  <button type="button" className="btn btn-primary" onClick={() => setAddingAddress(true)}>
                    Add address
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <ul className="stack-list">
              {addresses.map((item) => {
                const selected = address?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`stack-card${selected ? " is-selected" : ""}`}
                      onClick={() => setAddress(item)}
                    >
                      <strong>{item.address}</strong>
                      <p className="muted">{[item.city, item.post_code, item.country].filter(Boolean).join(", ")}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!branchAddresses ? (
            <div className="card-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setAddingAddress(true)}>
                Add another address
              </button>
            </div>
          ) : null}

          <label className="field">
            <span>Date</span>
            <input
              type="date"
              min={todayIso()}
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Special instructions (optional)</span>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Gate code, parking, or notes for the crew"
            />
          </label>
        </section>
      ) : null}

      {!catalogLoading && step === 4 ? (
        <section className="wizard-panel">
          <h2 className="section-title">Capacity window</h2>
          {capacityError ? (
            <div className="banner banner-error" role="alert">
              {capacityError}
            </div>
          ) : null}
          {!capacityOptions?.length ? (
            <div className="card">
              <p className="muted">
                Check crew capacity for {pricing.count} vehicle{pricing.count === 1 ? "" : "s"} on{" "}
                {formatDate(dateIso)}.
              </p>
              <div className="card-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void checkCapacity()}
                  disabled={capacityLoading}
                >
                  {capacityLoading ? "Checking…" : "Check capacity"}
                </button>
              </div>
            </div>
          ) : (
            <ul className="stack-list">
              {capacityOptions.map((option) => {
                const selected = selectedOption?.window === option.window;
                return (
                  <li key={option.window}>
                    <button
                      type="button"
                      className={`stack-card${selected ? " is-selected" : ""}`}
                      onClick={() => setSelectedOption(option)}
                    >
                      <div className="stack-card-top">
                        <strong>{windowLabel(option.window)}</strong>
                        <span>Team of {option.suggested_team_size}</span>
                      </div>
                      <p className="muted">
                        {option.best_start_time} – {option.estimated_finish_time}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedOption ? (
            <>
              <div className="card">
                <h2>Order total</h2>
                <dl className="meta">
                  <div>
                    <dt>Vehicles</dt>
                    <dd>
                      {pricing.count} × {formatMoney(pricing.unit, country)}
                    </dd>
                  </div>
                  {pricing.addonSubtotal > 0 ? (
                    <div>
                      <dt>Add-ons</dt>
                      <dd>{formatMoney(pricing.addonSubtotal, country)}</dd>
                    </div>
                  ) : null}
                  {pricing.discountPercent > 0 ? (
                    <div>
                      <dt>Bulk discount ({pricing.discountPercent}%)</dt>
                      <dd>−{formatMoney(pricing.discountAmount, country)}</dd>
                    </div>
                  ) : null}
                  {isSuv ? (
                    <div>
                      <dt>SUV / MPV (20%)</dt>
                      <dd>{formatMoney(pricing.suvSurcharge, country)}</dd>
                    </div>
                  ) : null}
                  {sparkleCredit > 0 ? (
                    <div>
                      <dt>Complimentary washes (−{complimentaryApplied})</dt>
                      <dd>−{formatMoney(sparkleCredit, country)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Total due</dt>
                    <dd>{formatMoney(payable, country)}</dd>
                  </div>
                </dl>
              </div>

              {complimentaryAvailable?.available && isQuickSparkle ? (
                <div className="card" style={{ marginBottom: "1.5rem" }}>
                  <h3>Fleet complimentary Quick Sparkles</h3>
                  <p className="muted">
                    {complimentaryAvailable.remaining} of {complimentaryAvailable.quota} remaining this month
                    {complimentaryAvailable.period_end
                      ? ` (resets ${formatDate(complimentaryAvailable.period_end.split("T")[0])})`
                      : ""}
                    . Unused sparkles do not roll over.
                  </p>
                  {complimentaryAvailable.branch_usage ? (
                    <p className="muted">
                      Your branch ({complimentaryAvailable.branch_usage.branch_name}) has used{" "}
                      {complimentaryAvailable.branch_usage.used_this_period} this period.
                    </p>
                  ) : null}
                  {complimentaryAvailable.remaining > 0 ? (
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={useComplimentary}
                        disabled={Boolean(clientSecret)}
                        onChange={(e) => setUseComplimentary(e.target.checked)}
                      />
                      <span>
                        Apply complimentary sparkles to this order
                        {useComplimentary && complimentaryApplied > 0
                          ? ` (${complimentaryApplied} of ${pricing.count} washes free; add-ons still billed)`
                          : ""}
                      </span>
                    </label>
                  ) : (
                    <p className="muted">No complimentary sparkles remaining this period.</p>
                  )}
                  {useComplimentary && complimentaryApplied > 0 && payable > 0 ? (
                    <p className="muted">
                      Complimentary covers the wash only. Add-ons stay on the bill for every vehicle.
                      Balance due: {formatMoney(payable, country)}. Pay now or invoice later.
                    </p>
                  ) : null}
                  {useComplimentary && complimentaryApplied > 0 && payable === 0 ? (
                    <p className="muted">Complimentary sparkles cover the washes and there are no add-ons, so nothing is due.</p>
                  ) : null}
                </div>
              ) : null}

              {payable > 0 ? (
                <>
                  <h2 className="section-title">Payment</h2>
                  <div className="photo-tabs" role="tablist" aria-label="Payment option">
                    <button
                      type="button"
                      role="tab"
                      className={`photo-tab${!payLater ? " is-selected" : ""}`}
                      aria-selected={!payLater}
                      disabled={Boolean(clientSecret)}
                      onClick={() => setPayLater(false)}
                    >
                      Pay now
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`photo-tab${payLater ? " is-selected" : ""}`}
                      aria-selected={payLater}
                      disabled={Boolean(clientSecret) || Boolean(invoiceLater && !invoiceLater.allowed)}
                      onClick={() => {
                        if (invoiceLater && !invoiceLater.allowed) return;
                        setPayLater(true);
                      }}
                    >
                      Invoice later
                    </button>
                  </div>
                  {invoiceLater && !invoiceLater.allowed ? (
                    <p className="muted">
                      {invoiceLater.message}{" "}
                      {invoiceLater.code === "OVERDUE_INVOICE" ? (
                        <Link to="/settings/invoices">View invoices</Link>
                      ) : user?.is_fleet_owner ? (
                        <Link to="/settings/subscriptions">Subscribe</Link>
                      ) : (
                        "Ask the fleet owner to subscribe."
                      )}
                    </p>
                  ) : (
                    <p className="muted">
                      {payLater
                        ? "We email a Stripe invoice (due in 30 days) for the balance. The order is confirmed now."
                        : "Pay the balance with card now. The order is confirmed after payment succeeds."}
                    </p>
                  )}
                </>
              ) : (
                <div className="banner banner-ok" style={{ marginBottom: "1.5rem" }}>
                  No payment is due for this order.
                </div>
              )}

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={coolingOff}
                  disabled={Boolean(clientSecret)}
                  onChange={(e) => setCoolingOff(e.target.checked)}
                />
                <span>
                  I agree the service starts on {formatDate(dateIso)} and that the cooling-off period is waived once a
                  window is reserved.
                </span>
              </label>

              {clientSecret && stripePromise ? (
                <div className="card">
                  <h2>Pay</h2>
                  {paying ? <p className="muted">Confirming payment with the server…</p> : null}
                  <StripeCheckout clientSecret={clientSecret}>
                    <PaymentForm
                      clientSecret={clientSecret}
                      paymentIntentId={paymentIntentId}
                      onPaid={finishPaid}
                    />
                  </StripeCheckout>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <div className="wizard-nav">
        <button type="button" className="btn btn-secondary" onClick={goBack} disabled={step === 1 && !clientSecret}>
          Back
        </button>
        {step < 4 ? (
          <button type="button" className="btn btn-primary" onClick={goNext} disabled={!stepValid[step as 1 | 2 | 3]}>
            Continue
          </button>
        ) : clientSecret ? (
          <span className="muted">Complete payment above.</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submitOrder()}
            disabled={!stepValid[4] || paying || !coolingOff}
          >
            {paying
              ? "Working…"
              : payable === 0
                ? "Confirm booking"
                : payLater
                  ? "Send invoice"
                  : "Pay now"}
          </button>
        )}
      </div>

      <AddressDialog
        open={addingAddress}
        onClose={() => setAddingAddress(false)}
        onSaved={() => {
          setAddingAddress(false);
          void loadCatalog();
        }}
      />
    </AppShell>
  );
}
