import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authErrorMessage, useAuth } from "../auth/AuthProvider";
import AddressDialog from "../components/AddressDialog";
import AppShell from "../components/AppShell";
import PaymentForm from "../components/PaymentForm";
import StripeCheckout from "../components/StripeCheckout";
import { isBulkBookingEligible } from "../lib/account";
import {
  buildCheckoutPayloads,
  newBookingReference,
  saveConfirmationSnapshot,
  waitForPaymentConfirmation,
} from "../lib/bookingCheckout";
import { formatClock, formatDate, formatDuration, formatMoney, vehicleLabel } from "../lib/format";
import { hasStripeKey, intentIdFromClientSecret, stripePromise } from "../lib/stripe";
import { vehicleBodyStyleRequiresSuvMpvSurcharge } from "../lib/vehicleBodyStyle";
import {
  checkFreeWash,
  fetchAddOns,
  fetchPromotions,
  fetchServiceType,
  fetchTimeslots,
  fetchValetType,
  parseCrewSlots,
  quoteBooking,
  type TimeSlot,
} from "../store/api/eventApi";
import { getVehicles } from "../store/api/garageApi";
import { applyGiftVoucher, applyWinnerVoucher, createPaymentSheet } from "../store/api/paymentApi";
import { fetchAddresses } from "../store/api/profileApi";
import BulkBookPage from "./BulkBookPage";
import type { SavedAddress } from "../types/address";
import type {
  AddOn,
  BookingQuote,
  AppliedVoucher,
  ComplimentarySparkleSource,
  FreeWashCheck,
  PriceSummaryBreakdown,
  Promotion,
  ServiceType,
  ValetType,
} from "../types/booking";
import { flattenVehicles, plateOf, type GarageVehicle } from "../types/garage";

const STEPS = [
  { id: 1, title: "Vehicle" },
  { id: 2, title: "Service" },
  { id: 3, title: "Valet" },
  { id: 4, title: "Details" },
  { id: 5, title: "Quote" },
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
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function eligibleComplimentary(quote: BookingQuote | null): ComplimentarySparkleSource[] {
  if (!quote?.quick_sparkle?.is_quick_sparkle) return [];
  const qs = quote.quick_sparkle;
  const list: ComplimentarySparkleSource[] = [];
  if (qs.eligible_loyalty) list.push("loyalty");
  if (qs.eligible_partner) list.push("partner");
  if (qs.eligible_subscription) list.push("subscription");
  return list;
}

function resolvedPayable(quote: BookingQuote | null, source: ComplimentarySparkleSource | null) {
  if (!quote) return null;
  const elig = eligibleComplimentary(quote);
  if (elig.length === 0) return quote.payable_full;
  if (elig.length >= 2) {
    if (!source || !elig.includes(source)) return quote.payable_full;
    return quote.payable_if_complimentary[source] ?? quote.payable_full;
  }
  return quote.payable_if_complimentary[elig[0]] ?? quote.payable_full;
}

function resolvedLines(quote: BookingQuote | null, source: ComplimentarySparkleSource | null) {
  if (!quote?.pricing_lines_full) return null;
  const elig = eligibleComplimentary(quote);
  if (elig.length === 0) return quote.pricing_lines_full;
  if (elig.length >= 2) {
    if (!source || !elig.includes(source)) return quote.pricing_lines_full;
    return quote.pricing_lines_if_complimentary[source] ?? quote.pricing_lines_full;
  }
  return quote.pricing_lines_if_complimentary[elig[0]] ?? quote.pricing_lines_full;
}

function priceBreakdown(
  quote: BookingQuote | null,
  source: ComplimentarySparkleSource | null,
  loyaltyPercent?: number,
): PriceSummaryBreakdown | null {
  const lines = resolvedLines(quote, source);
  const payable = resolvedPayable(quote, source);
  if (!quote || !lines || !payable) return null;
  const fullSticker = quote.pricing_lines_full.sticker_total_inc_vat;
  const resolvedSticker = lines.sticker_total_inc_vat;
  const compSave =
    fullSticker > resolvedSticker + 0.005 ? Number((fullSticker - resolvedSticker).toFixed(2)) : 0;
  return {
    stickerSubtotalIncVat: lines.sticker_total_inc_vat,
    loyaltyDiscountIncVat: lines.loyalty_discount_inc_vat,
    promotionDiscountIncVat: lines.promotion_discount_inc_vat,
    partnerReferralDiscountIncVat: lines.partner_referral_discount_inc_vat,
    subscriptionDiscountIncVat: lines.subscription_discount_inc_vat ?? 0,
    complimentaryStickerSavingsIncVat: compSave,
    totalIncVat: payable.total,
    loyaltyDiscountPercent: loyaltyPercent,
    partnerReferralDiscountPercent:
      lines.partner_referral_discount_inc_vat > 0.005 && quote.partner_booking_offer?.eligible
        ? quote.partner_booking_offer.percent
        : undefined,
    subscriptionDiscountPercent:
      (lines.subscription_discount_percent ?? 0) > 0.005 ? lines.subscription_discount_percent : undefined,
  };
}

export default function BookPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const business = isBulkBookingEligible(user);
  const country = user?.address?.country;

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [vehicles, setVehicles] = useState<GarageVehicle[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [valetTypes, setValetTypes] = useState<ValetType[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [freeWash, setFreeWash] = useState<FreeWashCheck | null>(null);

  const [vehicle, setVehicle] = useState<GarageVehicle | null>(null);
  const [isSuv, setIsSuv] = useState(false);
  const [isExpress, setIsExpress] = useState(false);
  const [service, setService] = useState<ServiceType | null>(null);
  const [valet, setValet] = useState<ValetType | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<AddOn[]>([]);
  const [address, setAddress] = useState<SavedAddress | null>(null);
  const [dateIso, setDateIso] = useState(todayIso());
  const [timeSlot, setTimeSlot] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);

  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [complimentary, setComplimentary] = useState<ComplimentarySparkleSource | null>(null);
  const [applyPartnerDiscount, setApplyPartnerDiscount] = useState(false);
  const [coolingOff, setCoolingOff] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const suvLocked = vehicle ? vehicleBodyStyleRequiresSuvMpvSurcharge(vehicle.body_style) : false;
  const addonMinutes = selectedAddons.reduce((sum, item) => sum + asNum(item.extra_duration), 0);
  const durationMinutes = (service?.duration || 60) + addonMinutes;
  const selectedSlot = timeSlots.find((slot) => slot.startTime === timeSlot) || null;
  const endClock =
    selectedSlot?.endTime || (timeSlot ? addMinutes(timeSlot, durationMinutes) : null);
  const elig = eligibleComplimentary(quote);
  const breakdown = priceBreakdown(quote, complimentary, user?.loyalty_benefits?.discount);
  const payable = resolvedPayable(quote, complimentary);
  const amountDue = voucher ? voucher.amountDue : payable?.total ?? 0;

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setError(null);
    try {
      const [vehiclesRes, addressesRes, servicesRes, valetsRes, addonsRes, promoRes, freeRes] =
        await Promise.allSettled([
          getVehicles(),
          fetchAddresses(),
          fetchServiceType(),
          fetchValetType(),
          fetchAddOns(),
          fetchPromotions(),
          checkFreeWash(),
        ]);

      if (vehiclesRes.status === "fulfilled") setVehicles(flattenVehicles(vehiclesRes.value));
      else setError(authErrorMessage(vehiclesRes.reason, "Could not load your garage."));

      if (addressesRes.status === "fulfilled") setAddresses(addressesRes.value.addresses || []);
      if (servicesRes.status === "fulfilled") setServiceTypes(servicesRes.value || []);
      if (valetsRes.status === "fulfilled") setValetTypes(valetsRes.value || []);
      if (addonsRes.status === "fulfilled") setAddOns(addonsRes.value || []);
      if (promoRes.status === "fulfilled") setPromotion(promoRes.value || null);
      if (freeRes.status === "fulfilled") setFreeWash(freeRes.value || null);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (business) return;
    void loadCatalog();
  }, [business, loadCatalog]);

  useEffect(() => {
    if (!vehicle) return;
    if (vehicleBodyStyleRequiresSuvMpvSurcharge(vehicle.body_style)) setIsSuv(true);
  }, [vehicle]);

  useEffect(() => {
    if (business || step !== 4) return;
    if (!address?.city || !address?.country || !dateIso) {
      setTimeSlots([]);
      setSlotsError(null);
      setSlotsLoading(false);
      return;
    }

    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError(null);

    const params: Record<string, string | number> = {
      date: dateIso,
      service_duration: durationMinutes,
      country: address.country,
      city: address.city,
      is_express_service: isExpress ? "true" : "false",
    };
    if (address.latitude != null && address.longitude != null) {
      params.latitude = address.latitude;
      params.longitude = address.longitude;
    }

    void fetchTimeslots(params)
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setSlotsError(data.error);
          setTimeSlots([]);
          setTimeSlot(null);
          return;
        }
        const next = parseCrewSlots(data);
        setTimeSlots(next);
        setTimeSlot((current) => (current && next.some((slot) => slot.startTime === current) ? current : null));
      })
      .catch((err) => {
        if (cancelled) return;
        setSlotsError(authErrorMessage(err, "Unable to check available hours. Please try again."));
        setTimeSlots([]);
        setTimeSlot(null);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [business, step, address, dateIso, durationMinutes, isExpress]);

  useEffect(() => {
    if (step !== 5) {
      setQuote(null);
      setComplimentary(null);
      setApplyPartnerDiscount(false);
      setCoolingOff(false);
      setVoucher(null);
      setVoucherCode("");
      setClientSecret(null);
      setPaymentIntentId(null);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 5 || !service || clientSecret) return;
    let cancelled = false;
    setQuoteLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await quoteBooking({
          service_type_id: asId(service.id),
          addon_ids: selectedAddons.map((item) => asId(item.id)),
          is_suv: isSuv,
          is_express: isExpress,
          apply_partner_booking_discount: applyPartnerDiscount,
        });
        if (cancelled) return;
        setQuote(data);
        const sources = eligibleComplimentary(data);
        setComplimentary((prev) => {
          if (sources.length === 0) return null;
          if (sources.length === 1) return sources[0];
          if (prev && sources.includes(prev)) return prev;
          return null;
        });
      } catch (err) {
        if (!cancelled) {
          setQuote(null);
          setError(authErrorMessage(err, "Could not verify pricing."));
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, service, selectedAddons, isSuv, isExpress, applyPartnerDiscount, clientSecret]);

  function selectVehicle(next: GarageVehicle) {
    setVehicle(next);
    if (!vehicleBodyStyleRequiresSuvMpvSurcharge(next.body_style)) setIsSuv(false);
  }

  function toggleAddon(addon: AddOn) {
    setSelectedAddons((prev) => {
      const exists = prev.some((item) => asId(item.id) === asId(addon.id));
      if (exists) return prev.filter((item) => asId(item.id) !== asId(addon.id));
      return [...prev, addon];
    });
  }

  function changeDate(next: string) {
    setDateIso(next);
    setTimeSlot(null);
  }

  const stepValid = useMemo(() => {
    const suvOk = !vehicle || !suvLocked || isSuv;
    return {
      1: Boolean(vehicle) && suvOk,
      2: Boolean(service),
      3: Boolean(valet),
      4: Boolean(address && timeSlot && dateIso >= todayIso()) && !slotsLoading && !slotsError,
      5: Boolean(quote) && !quoteLoading && (elig.length < 2 || Boolean(complimentary)),
    };
  }, [vehicle, suvLocked, isSuv, service, valet, address, timeSlot, dateIso, quote, quoteLoading, elig.length, complimentary, slotsLoading, slotsError]);

  function goNext() {
    if (step < 5 && stepValid[step as 1 | 2 | 3 | 4 | 5]) setStep(step + 1);
  }

  function goBack() {
    if (clientSecret) {
      setClientSecret(null);
      setPaymentIntentId(null);
      return;
    }
    if (step > 1) setStep(step - 1);
  }

  async function applyVoucher() {
    const code = voucherCode.trim();
    if (!code || !payable) return;
    setVoucherBusy(true);
    setError(null);
    try {
      const pre = payable.total;
      try {
        const data = await applyWinnerVoucher(code, pre);
        setVoucher({
          kind: "winner",
          voucherId: data.voucher_id,
          amountDue: data.amount_due,
          discountApplied: data.discount_applied,
          preTotal: data.pre_voucher_total,
        });
        setComplimentary(null);
        return;
      } catch {
        const data = await applyGiftVoucher(code, pre);
        setVoucher({
          kind: "gift",
          voucherId: data.voucher_id,
          amountDue: data.amount_due,
          discountApplied: data.discount_applied,
          preTotal: data.pre_voucher_total,
        });
        setComplimentary(null);
      }
    } catch (err) {
      setVoucher(null);
      setError(authErrorMessage(err, "Could not apply this code."));
    } finally {
      setVoucherBusy(false);
    }
  }

  function goToConfirmation(snapshot: {
    bookingReference: string;
    free: boolean;
  }) {
    if (!vehicle || !service || !valet || !address || !timeSlot) return;
    const payload = {
      bookingReference: snapshot.bookingReference,
      serviceName: service.name,
      valetName: valet.name,
      dateIso,
      timeSlot,
      vehicleLine: vehicleLabel({ make: vehicle.make, model: vehicle.model, licence: plateOf(vehicle) }),
      addressLine: [address.address, address.city, address.post_code].filter(Boolean).join(", "),
      total: amountDue,
      free: snapshot.free,
    };
    saveConfirmationSnapshot(payload);
    if (promotion?.is_active && promotion.id) {
      sessionStorage.setItem("prisma.promotionId", String(promotion.id));
    } else {
      sessionStorage.removeItem("prisma.promotionId");
    }
    navigate("/book/confirmation", { state: payload });
  }

  async function finishPaid(paymentIntentId: string) {
    setPaying(true);
    setError(null);
    try {
      const confirmed = await waitForPaymentConfirmation(paymentIntentId);
      goToConfirmation({
        bookingReference: confirmed.booking_reference || newBookingReference(),
        free: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment confirmation failed.");
    } finally {
      setPaying(false);
    }
  }

  async function startCheckout() {
    if (!vehicle || !service || !valet || !address || !timeSlot || !payable || !quote) return;
    if (suvLocked && !isSuv) {
      setError("This vehicle needs the SUV / MPV surcharge.");
      return;
    }
    if (!coolingOff) {
      setError("Please agree to the cooling-off note before paying.");
      return;
    }
    if (!hasStripeKey() && amountDue > 0) {
      setError("Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY.");
      return;
    }
    setPaying(true);
    setError(null);
    const bookingReference = newBookingReference();
    const eligNow = eligibleComplimentary(quote);
    const appliedFree = !voucher && eligNow.length > 0 && Boolean(complimentary || eligNow.length === 1);
    const source = appliedFree ? complimentary || eligNow[0] : null;
    const breakdownNow = source && appliedFree ? quote.payable_if_complimentary[source] ?? payable : payable;
    try {
      const { bookingData, detailerData } = buildCheckoutPayloads({
        user,
        vehicle,
        service,
        valet,
        address,
        addons: selectedAddons,
        dateIso,
        timeSlot,
        durationMinutes,
        instructions,
        isSuv,
        isExpress,
        applyPartnerDiscount,
        amountDue,
        subtotal: voucher ? payable.subtotal : breakdownNow.subtotal,
        vat: voucher ? payable.vat : breakdownNow.vat,
        stickerTotal: quote.pricing_lines_full.sticker_total_inc_vat,
        appliedFreeQuickSparkle: appliedFree,
        complimentarySource: source,
        voucher: appliedFree ? null : voucher,
        bookingReference,
      });
      const data = await createPaymentSheet({
        amount: Math.round(amountDue * 100),
        booking_reference: bookingReference,
        booking_data: bookingData,
        detailer_booking_data: detailerData,
      });
      if (data.free_booking) {
        goToConfirmation({ bookingReference: data.booking_reference, free: true });
        return;
      }
      if (!data.paymentIntent) {
        setError("Could not start payment. Please try again.");
        return;
      }
      saveConfirmationSnapshot({
        bookingReference: data.booking_reference,
        serviceName: service.name,
        valetName: valet.name,
        dateIso,
        timeSlot,
        vehicleLine: vehicleLabel({ make: vehicle.make, model: vehicle.model, licence: plateOf(vehicle) }),
        addressLine: [address.address, address.city, address.post_code].filter(Boolean).join(", "),
        total: amountDue,
        free: false,
      });
      if (promotion?.is_active && promotion.id) {
        sessionStorage.setItem("prisma.promotionId", String(promotion.id));
      }
      setClientSecret(data.paymentIntent);
      setPaymentIntentId(data.paymentIntentId || intentIdFromClientSecret(data.paymentIntent));
    } catch (err) {
      setError(authErrorMessage(err, "Could not start payment."));
    } finally {
      setPaying(false);
    }
  }

  if (business) {
    return <BulkBookPage />;
  }

  return (
    <AppShell>
      <section className="welcome">
        <p className="kicker">Book</p>
        <h1 className="page-title">Book a service</h1>
        <p className="lede">
          Vehicle, service, valet, and details — then pay.
        </p>
      </section>

      {promotion?.is_active ? (
        <div className="banner banner-ok" role="status">
          {promotion.title}: {promotion.discount_percentage}% off until {formatDate(promotion.valid_until)}.
        </div>
      ) : null}

      {freeWash?.can_use_free_wash ? (
        <div className="banner banner-ok" role="status">
          Complimentary Quick Sparkle is available
          {freeWash.free_wash_source ? ` via ${freeWash.free_wash_source}` : ""}. Choose it on the quote if this
          booking is a Quick Sparkle.
        </div>
      ) : null}

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
          <h2 className="section-title">Choose a vehicle</h2>
          {vehicles.length === 0 ? (
            <div className="card">
              <h2>No vehicles yet</h2>
              <p className="muted">Add a car in the garage before you book.</p>
              <div className="card-actions">
                <Link to="/garage" className="btn btn-primary">
                  Go to garage
                </Link>
              </div>
            </div>
          ) : (
            <ul className="option-grid">
              {vehicles.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`option-card${vehicle?.id === item.id ? " is-selected" : ""}`}
                    onClick={() => selectVehicle(item)}
                  >
                    {item.image ? <img src={item.image} alt="" /> : <div className="option-card-photo">No photo</div>}
                    <strong>
                      {item.year} {item.make} {item.model}
                    </strong>
                    <span>{plateOf(item) || "No plate"}</span>
                    <span>
                      {item.color}
                      {item.body_style ? ` · ${item.body_style}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {vehicle ? (
            <div className="wizard-flags">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={isSuv}
                  disabled={suvLocked}
                  onChange={(e) => setIsSuv(e.target.checked)}
                />
                <span>
                  SUV / MPV (20% surcharge)
                  {suvLocked ? " — required for this body style." : ""}
                </span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={isExpress} onChange={(e) => setIsExpress(e.target.checked)} />
                <span>Express service (€30) — two detailers when available.</span>
              </label>
            </div>
          ) : null}
        </section>
      ) : null}

      {!catalogLoading && step === 2 ? (
        <section className="wizard-panel">
          <h2 className="section-title">Choose a service</h2>
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
                      <span>{formatMoney(asNum(item.price), country)}</span>
                    </div>
                    <p className="muted">{formatDuration(asNum(item.duration))}</p>
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
        </section>
      ) : null}

      {!catalogLoading && step === 3 ? (
        <section className="wizard-panel">
          <h2 className="section-title">Choose a valet type</h2>
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

          {valet ? (
            <>
              <h2 className="section-title">Add-ons (optional)</h2>
              <p className="muted">Four or more add-ons: the cheapest is free.</p>
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
                        <p className="muted">
                          {item.description}
                          {item.extra_duration ? ` · +${formatDuration(asNum(item.extra_duration))}` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {!catalogLoading && step === 4 ? (
        <section className="wizard-panel">
          <div className="welcome--split">
            <div>
              <h2 className="section-title">Where and when</h2>
              <p className="muted">
                Live crew slots are confirmed when you pay. Pick a preferred date and time for this quote.
              </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setAddingAddress(true)}>
              Add address
            </button>
          </div>

          {addresses.length === 0 ? (
            <div className="card">
              <h2>No addresses yet</h2>
              <p className="muted">Save a service address first.</p>
              <div className="card-actions">
                <button type="button" className="btn btn-primary" onClick={() => setAddingAddress(true)}>
                  Add an address
                </button>
              </div>
            </div>
          ) : (
            <ul className="stack-list">
              {addresses.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`stack-card${address?.id === item.id ? " is-selected" : ""}`}
                    onClick={() => {
                      setAddress(item);
                      setTimeSlot(null);
                    }}
                  >
                    <strong>{item.address}</strong>
                    <p className="muted">
                      {[item.city, item.post_code, item.country].filter(Boolean).join(", ")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="field">
            <span>Date</span>
            <input type="date" min={todayIso()} value={dateIso} onChange={(e) => changeDate(e.target.value)} />
          </label>

          <div>
            <p className="field-label">Available hours</p>
            {!address?.city || !address?.country ? (
              <p className="muted">Select an address to see hours from the detailer team.</p>
            ) : slotsLoading ? (
              <p className="muted">Checking available hours…</p>
            ) : slotsError ? (
              <div className="banner banner-error" role="alert">
                {slotsError}
              </div>
            ) : timeSlots.length === 0 ? (
              <p className="muted">No available hours for this date and location. Try another date.</p>
            ) : (
              <div className="slot-grid">
                {timeSlots.map((slot) => (
                  <button
                    key={`${slot.startTime}-${slot.endTime}`}
                    type="button"
                    className={`slot-btn${timeSlot === slot.startTime ? " is-selected" : ""}`}
                    onClick={() => setTimeSlot(slot.startTime)}
                  >
                    {formatClock(slot.startTime)}
                  </button>
                ))}
              </div>
            )}
            {timeSlot && endClock ? (
              <p className="muted">
                About {formatDuration(durationMinutes)}, finishing around {formatClock(endClock)}.
              </p>
            ) : null}
          </div>

          <label className="field">
            <span>Special instructions (optional)</span>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Gate code, parking notes, anything the detailer should know."
            />
          </label>
        </section>
      ) : null}

      {!catalogLoading && step === 5 && vehicle && service && valet && address ? (
        <section className="wizard-panel">
          <h2 className="section-title">Quote</h2>
          {quoteLoading ? <p className="muted">Verifying price with the server…</p> : null}

          {elig.length >= 1 && !voucher ? (
            <div className="card">
              <h2>Complimentary Quick Sparkle</h2>
              <p className="muted">
                {elig.length >= 2
                  ? "You have more than one option. Choose how to apply it."
                  : "This booking can use your complimentary Quick Sparkle."}
              </p>
              <div className="stack-list">
                {elig.includes("loyalty") ? (
                  <button
                    type="button"
                    className={`stack-card${complimentary === "loyalty" ? " is-selected" : ""}`}
                    onClick={() => setComplimentary("loyalty")}
                    disabled={Boolean(clientSecret)}
                  >
                    <strong>Loyalty</strong>
                    <p className="muted">{quote?.quick_sparkle.remaining_loyalty ?? 0} left this cycle</p>
                  </button>
                ) : null}
                {elig.includes("partner") ? (
                  <button
                    type="button"
                    className={`stack-card${complimentary === "partner" ? " is-selected" : ""}`}
                    onClick={() => setComplimentary("partner")}
                    disabled={Boolean(clientSecret)}
                  >
                    <strong>Partner referral</strong>
                    <p className="muted">Complimentary wash from your referral</p>
                  </button>
                ) : null}
                {elig.includes("subscription") ? (
                  <button
                    type="button"
                    className={`stack-card${complimentary === "subscription" ? " is-selected" : ""}`}
                    onClick={() => setComplimentary("subscription")}
                    disabled={Boolean(clientSecret)}
                  >
                    <strong>Subscription</strong>
                    <p className="muted">
                      {quote?.quick_sparkle.remaining_subscription ?? 0} of {quote?.quick_sparkle.max_subscription ?? 0}{" "}
                      remaining
                    </p>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {quote?.partner_booking_offer?.eligible ? (
            <label className="check-row">
              <input
                type="checkbox"
                checked={applyPartnerDiscount}
                disabled={Boolean(clientSecret)}
                onChange={(e) => setApplyPartnerDiscount(e.target.checked)}
              />
              <span>
                Apply partner welcome discount ({quote.partner_booking_offer.percent}% off). Separate from complimentary
                washes.
              </span>
            </label>
          ) : null}

          <div className="summary-grid">
            <article className="card">
              <h2>Booking</h2>
              <dl className="meta">
                <div>
                  <dt>Vehicle</dt>
                  <dd>
                    {vehicleLabel({ make: vehicle.make, model: vehicle.model, licence: plateOf(vehicle) })}
                    {isSuv ? " · SUV/MPV" : ""}
                    {isExpress ? " · Express" : ""}
                  </dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>
                    {service.name} · {valet.name}
                  </dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>
                    {formatDate(dateIso)}
                    {timeSlot ? ` · ${formatClock(timeSlot)}–${endClock ? formatClock(endClock) : ""}` : ""}
                    {` · ${formatDuration(durationMinutes)}`}
                  </dd>
                </div>
                <div>
                  <dt>Where</dt>
                  <dd>
                    {address.address}, {[address.city, address.post_code].filter(Boolean).join(", ")}
                  </dd>
                </div>
                {selectedAddons.length > 0 ? (
                  <div>
                    <dt>Add-ons</dt>
                    <dd>{selectedAddons.map((item) => item.name).join(", ")}</dd>
                  </div>
                ) : null}
                {instructions.trim() ? (
                  <div>
                    <dt>Notes</dt>
                    <dd>{instructions.trim()}</dd>
                  </div>
                ) : null}
              </dl>
            </article>

            <article className="card">
              <h2>Price</h2>
              {breakdown && payable ? (
                <dl className="price-list">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{formatMoney(breakdown.stickerSubtotalIncVat, country)}</dd>
                  </div>
                  {breakdown.subscriptionDiscountIncVat > 0 ? (
                    <div className="price-save">
                      <dt>
                        Subscription
                        {breakdown.subscriptionDiscountPercent
                          ? ` (${breakdown.subscriptionDiscountPercent}%)`
                          : ""}
                      </dt>
                      <dd>−{formatMoney(breakdown.subscriptionDiscountIncVat, country)}</dd>
                    </div>
                  ) : null}
                  {breakdown.complimentaryStickerSavingsIncVat > 0 ? (
                    <div className="price-save">
                      <dt>Complimentary Quick Sparkle</dt>
                      <dd>−{formatMoney(breakdown.complimentaryStickerSavingsIncVat, country)}</dd>
                    </div>
                  ) : null}
                  {breakdown.loyaltyDiscountIncVat > 0 ? (
                    <div className="price-save">
                      <dt>
                        Loyalty
                        {breakdown.loyaltyDiscountPercent ? ` (${breakdown.loyaltyDiscountPercent}%)` : ""}
                      </dt>
                      <dd>−{formatMoney(breakdown.loyaltyDiscountIncVat, country)}</dd>
                    </div>
                  ) : null}
                  {breakdown.promotionDiscountIncVat > 0 ? (
                    <div className="price-save">
                      <dt>Promotion</dt>
                      <dd>−{formatMoney(breakdown.promotionDiscountIncVat, country)}</dd>
                    </div>
                  ) : null}
                  {breakdown.partnerReferralDiscountIncVat > 0 ? (
                    <div className="price-save">
                      <dt>
                        Partner welcome
                        {breakdown.partnerReferralDiscountPercent
                          ? ` (${breakdown.partnerReferralDiscountPercent}%)`
                          : ""}
                      </dt>
                      <dd>−{formatMoney(breakdown.partnerReferralDiscountIncVat, country)}</dd>
                    </div>
                  ) : null}
                  {voucher ? (
                    <div className="price-save">
                      <dt>Voucher</dt>
                      <dd>−{formatMoney(voucher.discountApplied, country)}</dd>
                    </div>
                  ) : null}
                  <div className="price-total">
                    <dt>Total (VAT incl.)</dt>
                    <dd>{formatMoney(amountDue, country)}</dd>
                  </div>
                  {!voucher ? (
                    <div>
                      <dt>Of which VAT</dt>
                      <dd>{formatMoney(payable.vat, country)}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="muted">Quote will appear once the server responds.</p>
              )}
            </article>
          </div>

          <div className="card">
            <h2>Voucher code</h2>
            <p className="muted">Winner / Gift Voucher. Optional</p>
            <div className="voucher-row">
              <input
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                placeholder="Enter code"
                disabled={Boolean(clientSecret) || paying}
                autoCapitalize="characters"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void applyVoucher()}
                disabled={voucherBusy || !voucherCode.trim() || Boolean(clientSecret)}
              >
                {voucherBusy ? "Checking…" : "Apply"}
              </button>
            </div>
            {voucher ? (
              <p className="muted">
                {formatMoney(voucher.discountApplied, country)} off.
                <button
                  type="button"
                  className="text-btn text-btn-inline"
                  onClick={() => {
                    const ok = window.confirm("Remove this voucher from the booking?");
                    if (!ok) return;
                    setVoucher(null);
                  }}
                >
                  Remove
                </button>
              </p>
            ) : null}
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={coolingOff}
              disabled={Boolean(clientSecret)}
              onChange={(e) => setCoolingOff(e.target.checked)}
            />
            <span>
              I agree the service starts on {formatDate(dateIso)} and that the cooling-off period is waived once a time
              slot is reserved.
            </span>
          </label>

          {clientSecret && stripePromise ? (
            <div className="card">
              <h2>Pay</h2>
              {paying ? <p className="muted">Confirming payment and assigning your detailer…</p> : null}
              <StripeCheckout clientSecret={clientSecret}>
                <PaymentForm
                  clientSecret={clientSecret}
                  paymentIntentId={paymentIntentId}
                  onPaid={finishPaid}
                />
              </StripeCheckout>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="wizard-nav">
        <button type="button" className="btn btn-secondary" onClick={goBack} disabled={step === 1 && !clientSecret}>
          Back
        </button>
        {step < 5 ? (
          <button type="button" className="btn btn-primary" onClick={goNext} disabled={!stepValid[step as 1 | 2 | 3 | 4]}>
            Continue
          </button>
        ) : clientSecret ? (
          <span className="muted">Complete payment above.</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startCheckout()}
            disabled={!stepValid[5] || paying || !coolingOff}
          >
            {paying ? "Starting…" : amountDue <= 0 ? "Confirm free booking" : `Pay ${formatMoney(amountDue, country)}`}
          </button>
        )}
      </div>

      <AddressDialog
        open={addingAddress}
        onClose={() => setAddingAddress(false)}
        onSaved={() => {
          void fetchAddresses().then((data) => {
            setAddresses(data.addresses || []);
          });
        }}
      />
    </AppShell>
  );
}
