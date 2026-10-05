import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { authErrorMessage } from "../auth/AuthProvider";
import AddressSearchInput from "../components/AddressSearchInput";
import GuestBookShell from "../components/GuestBookShell";
import PaymentForm from "../components/PaymentForm";
import StripeCheckout from "../components/StripeCheckout";
import {
  buildCheckoutPayloads,
  newBookingReference,
  quoteChargeLines,
  saveConfirmationSnapshot,
} from "../lib/bookingCheckout";
import { formatClock, formatDate, formatDuration, formatMoney, vehicleLabel } from "../lib/format";
import { hasStripeKey, intentIdFromClientSecret } from "../lib/stripe";
import { readReferralCode, referralQuery } from "../lib/referralLink";
import { vehicleBodyStyleRequiresSuvMpvSurcharge } from "../lib/vehicleBodyStyle";
import { parseCrewSlots, type TimeSlot } from "../store/api/eventApi";
import {
  applyGuestGiftVoucher,
  applyGuestWinnerVoucher,
  confirmGuestPaymentIntent,
  createGuestPaymentSheet,
  fetchGuestCatalog,
  fetchGuestTimeslots,
  lookupGuestVehicle,
  quoteGuestBooking,
  type GuestLookupResponse,
} from "../store/api/guestApi";
import type { AddOn, AppliedVoucher, BookingQuote, PriceSummaryBreakdown, ServiceType, ValetType } from "../types/booking";
import type { GarageVehicle, LookupPreview } from "../types/garage";
import type { BusinessAddress } from "../types/user";

const STEPS = [
  { id: 1, title: "Car" },
  { id: 2, title: "Service" },
  { id: 3, title: "Type" },
  { id: 4, title: "Place" },
  { id: 5, title: "Pay" },
] as const;

function asId(value: string | number | undefined): string {
  return String(value ?? "");
}

function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Split a catalog description into bullet lines (newline or semicolon). */
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

/** Add minutes to an `HH:MM` clock, wrapping midnight. */
function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Map Ireland lookup preview onto the garage vehicle shape the checkout helpers expect. */
function previewToVehicle(preview: LookupPreview): GarageVehicle {
  return {
    id: preview.registration_number,
    make: preview.make,
    model: preview.model,
    year: preview.year,
    color: preview.color || "",
    registration_number: preview.registration_number,
    licence: preview.registration_number,
    country: preview.country,
    body_style: preview.body_style,
    image: preview.image_url || null,
  };
}

/**
 * Poll the guest confirm API until the webhook has created the booking, or time out.
 * Retries 5xx and 429; other 4xx fail immediately. Slot-unavailable refunds throw.
 */
async function waitForGuestPayment(paymentIntentId: string, maxWaitMs = 60000): Promise<string> {
  const started = Date.now();
  let lastRef = "";
  while (Date.now() - started < maxWaitMs) {
    try {
      const data = await confirmGuestPaymentIntent(paymentIntentId);
      if (data.status === "refunded_slot_unavailable") {
        throw new Error(
          data.message ||
            "This time slot was no longer available. Your payment has been refunded. Please choose another slot.",
        );
      }
      if (data.confirmed && data.assigned) return data.booking_reference || lastRef;
      if (data.confirmed && data.booking_reference) lastRef = data.booking_reference;
    } catch (err) {
      if (!axios.isAxiosError(err)) throw err;
      const status = err.response?.status;
      if (status && status < 500 && status !== 429) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  if (lastRef) return lastRef;
  throw new Error("Payment is still confirming. Check the email we sent, or try again in a moment.");
}

type CarEntry = "lookup" | "manual";

function manualYearOk(year: string): number | null {
  const yearNum = Number(year);
  if (!Number.isFinite(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) return null;
  return yearNum;
}

function vehicleFromManual(fields: {
  licence: string;
  make: string;
  model: string;
  year: string;
  color: string;
  country: string;
}): GarageVehicle | null {
  const plate = fields.licence.trim().toUpperCase().replace(/\s+/g, "");
  const yearNum = manualYearOk(fields.year);
  const make = fields.make.trim();
  const model = fields.model.trim();
  const color = fields.color.trim();
  const country = fields.country.trim();
  if (!plate || !make || !model || !color || !country || yearNum == null) return null;
  return {
    id: plate,
    make,
    model,
    year: yearNum,
    color,
    registration_number: plate,
    licence: plate,
    country,
    body_style: null,
    image: null,
  };
}

/**
 * Five-step guest checkout: look up a plate or type the car, then service, type, place, and pay.
 * The price quote does not create an account.
 */
export default function GuestBookPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [valetTypes, setValetTypes] = useState<ValetType[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);

  const [licence, setLicence] = useState("");
  const [carEntry, setCarEntry] = useState<CarEntry>("lookup");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [vehicleCountry, setVehicleCountry] = useState("Ireland");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupToken, setLookupToken] = useState<string | null>(null);
  const [lookup, setLookup] = useState<GuestLookupResponse | null>(null);
  const [vehicle, setVehicle] = useState<GarageVehicle | null>(null);
  const [isSuv, setIsSuv] = useState(false);
  const [isExpress, setIsExpress] = useState(false);

  const [service, setService] = useState<ServiceType | null>(null);
  const [valet, setValet] = useState<ValetType | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<AddOn[]>([]);

  const [address, setAddress] = useState<BusinessAddress | null>(null);
  const [dateIso, setDateIso] = useState(todayIso());
  const [timeSlot, setTimeSlot] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  /** Optional. Prefilled from ?ref= when the partner link was used. Sent only with payment. */
  const [referralCode, setReferralCode] = useState(() => readReferralCode());

  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [coolingOff, setCoolingOff] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const country = address?.country;
  const suvLocked = vehicle ? vehicleBodyStyleRequiresSuvMpvSurcharge(vehicle.body_style) : false;
  const addonMinutes = selectedAddons.reduce((sum, item) => sum + asNum(item.extra_duration), 0);
  const durationMinutes = (service?.duration || 60) + addonMinutes;
  const selectedSlot = timeSlots.find((slot) => slot.startTime === timeSlot) || null;
  const endClock = selectedSlot?.endTime || (timeSlot ? addMinutes(timeSlot, durationMinutes) : null);
  const payable = quote?.payable_full ?? null;
  const amountDue = voucher ? voucher.amountDue : payable?.total ?? 0;
  const guestCharges = quote?.pricing_lines_full
    ? quoteChargeLines(quote.pricing_lines_full, payable, isSuv, isExpress)
    : null;
  const breakdown: PriceSummaryBreakdown | null = quote?.pricing_lines_full && guestCharges
    ? {
        stickerSubtotalIncVat: quote.pricing_lines_full.sticker_total_inc_vat,
        loyaltyDiscountIncVat: 0,
        promotionDiscountIncVat: 0,
        partnerReferralDiscountIncVat: 0,
        subscriptionDiscountIncVat: 0,
        complimentaryStickerSavingsIncVat: 0,
        suvSurchargeIncVat: guestCharges.suvSurchargeIncVat,
        expressFeeIncVat: guestCharges.expressFeeIncVat,
        travelSurchargeIncVat: guestCharges.travelSurchargeIncVat,
        totalIncVat: amountDue,
      }
    : null;

  useEffect(() => {
    setVoucher(null);
    setVoucherCode("");
  }, [contactEmail]);

  const manualVehicle = vehicleFromManual({ licence, make, model, year, color, country: vehicleCountry });
  const stepValid = {
    1:
      carEntry === "manual"
        ? Boolean(manualVehicle)
        : Boolean(vehicle && lookupToken && lookup?.plate.can_book !== false),
    2: Boolean(service),
    3: Boolean(valet),
    4: Boolean(
      address?.address?.trim() &&
        address.city?.trim() &&
        address.country?.trim() &&
        timeSlot &&
        contactName.trim() &&
        contactEmail.trim() &&
        contactPhone.trim().length >= 7,
    ),
    5: Boolean(quote && payable && coolingOff),
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const catalog = await fetchGuestCatalog();
        if (cancelled) return;
        setServiceTypes(catalog.services || []);
        setValetTypes(catalog.valets || []);
        setAddOns(catalog.add_ons || []);
      } catch (err) {
        if (!cancelled) setError(authErrorMessage(err, "Could not load packages."));
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!vehicle) return;
    if (vehicleBodyStyleRequiresSuvMpvSurcharge(vehicle.body_style)) setIsSuv(true);
  }, [vehicle]);

  useEffect(() => {
    if (step !== 4) return;
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
    void fetchGuestTimeslots(params)
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
        if (!cancelled) {
          setSlotsError(authErrorMessage(err, "Unable to check available hours. Please try again."));
          setTimeSlots([]);
          setTimeSlot(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, address?.city, address?.country, address?.latitude, address?.longitude, dateIso, durationMinutes, isExpress]);

  const loadQuote = useCallback(async () => {
    if (!service) return;
    setQuoteLoading(true);
    try {
      // Referral code is not sent here. This wash stays at the anonymous list price.
      const next = await quoteGuestBooking({
        service_type_id: asId(service.id),
        addon_ids: selectedAddons.map((item) => asId(item.id)),
        is_suv: isSuv,
        is_express: isExpress,
        body_style: vehicle?.body_style,
        latitude: address?.latitude ?? null,
        longitude: address?.longitude ?? null,
      });
      setQuote(next);
    } catch (err) {
      setError(authErrorMessage(err, "Could not price this booking."));
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [service, selectedAddons, isSuv, isExpress, vehicle?.body_style, address?.latitude, address?.longitude]);

  useEffect(() => {
    if (step !== 5) return;
    void loadQuote();
  }, [step, loadQuote]);

  async function runLookup() {
    setError(null);
    const plate = licence.trim();
    if (!plate) {
      setError("Enter a registration.");
      return;
    }
    setLookupBusy(true);
    try {
      const data = await lookupGuestVehicle(plate);
      setCarEntry("lookup");
      setLookup(data);
      setLookupToken(data.lookup_token);
      if (data.plate.status === "owned_by_registered") {
        setVehicle(null);
        setError(data.plate.message || "This car is already on an account. Sign in to book.");
        return;
      }
      setVehicle(previewToVehicle(data.preview));
      if (data.plate.status === "owned_by_other_guest" && data.plate.message) {
        setError(data.plate.message);
      }
    } catch (err) {
      setVehicle(null);
      setLookupToken(null);
      setLookup(null);
      setError(authErrorMessage(err, "Could not look up that registration."));
    } finally {
      setLookupBusy(false);
    }
  }

  function showManualEntry() {
    setError(null);
    setCarEntry("manual");
    setLookup(null);
    setLookupToken(null);
    setClientSecret(null);
    setPaymentIntentId(null);
    setVehicle(vehicleFromManual({ licence, make, model, year, color, country: vehicleCountry }));
  }

  function showLookupEntry() {
    setError(null);
    setCarEntry("lookup");
    setVehicle(null);
    setLookup(null);
    setLookupToken(null);
    setClientSecret(null);
    setPaymentIntentId(null);
  }

  function updateManual(next: {
    licence?: string;
    make?: string;
    model?: string;
    year?: string;
    color?: string;
    country?: string;
  }) {
    const fields = {
      licence: next.licence ?? licence,
      make: next.make ?? make,
      model: next.model ?? model,
      year: next.year ?? year,
      color: next.color ?? color,
      country: next.country ?? vehicleCountry,
    };
    if (next.licence != null) setLicence(next.licence);
    if (next.make != null) setMake(next.make);
    if (next.model != null) setModel(next.model);
    if (next.year != null) setYear(next.year);
    if (next.color != null) setColor(next.color);
    if (next.country != null) setVehicleCountry(next.country);
    setVehicle(vehicleFromManual(fields));
  }

  function toggleAddon(item: AddOn) {
    setSelectedAddons((current) =>
      current.some((addon) => asId(addon.id) === asId(item.id))
        ? current.filter((addon) => asId(addon.id) !== asId(item.id))
        : [...current, item],
    );
  }

  function goNext() {
    setError(null);
    if (step === 1 && suvLocked && !isSuv) {
      setError("This car needs the SUV / MPV extra.");
      return;
    }
    setStep((current) => Math.min(5, current + 1));
  }

  function goToConfirmation(bookingReference: string, free = false) {
    if (!vehicle || !service || !valet || !address || !timeSlot) return;
    const snapshot = {
      bookingReference,
      serviceName: service.name,
      valetName: valet.name,
      dateIso,
      timeSlot,
      vehicleLine: vehicleLabel({ make: vehicle.make, model: vehicle.model, licence: vehicle.licence }),
      addressLine: [address.address, address.city, address.post_code].filter(Boolean).join(", "),
      total: amountDue,
      free,
      endTime: endClock || undefined,
    };
    saveConfirmationSnapshot(snapshot);
    navigate("/book/guest/confirmation", { state: snapshot });
  }

  async function applyVoucher() {
    const code = voucherCode.trim();
    if (!code || !payable) return;
    setVoucherBusy(true);
    setError(null);
    const contact = {
      name: contactName.trim(),
      email: contactEmail.trim(),
      phone: contactPhone.trim(),
    };
    const pre = payable.total;
    try {
      try {
        const data = await applyGuestWinnerVoucher({
          code,
          pre_voucher_total_amount: pre,
          ...contact,
        });
        setVoucher({
          kind: "winner",
          voucherId: data.voucher_id,
          amountDue: data.amount_due,
          discountApplied: data.discount_applied,
          preTotal: data.pre_voucher_total,
        });
        return;
      } catch {
        const data = await applyGuestGiftVoucher({
          code,
          pre_voucher_total_amount: pre,
          ...contact,
        });
        setVoucher({
          kind: "gift",
          voucherId: data.voucher_id,
          amountDue: data.amount_due,
          discountApplied: data.discount_applied,
          preTotal: data.pre_voucher_total,
        });
      }
    } catch (err) {
      setVoucher(null);
      setError(authErrorMessage(err, "Could not apply this code."));
    } finally {
      setVoucherBusy(false);
    }
  }

  async function finishPaid(paidIntentId: string) {
    setPaying(true);
    setError(null);
    try {
      const reference = await waitForGuestPayment(paidIntentId);
      goToConfirmation(reference || newBookingReference());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment confirmation failed.");
    } finally {
      setPaying(false);
    }
  }

  async function startCheckout() {
    const typedCar = carEntry === "manual" ? manualVehicle : null;
    if (!vehicle || !service || !valet || !address || !timeSlot || !payable || !quote) return;
    if (carEntry === "lookup" && !lookupToken) return;
    if (carEntry === "manual" && !typedCar) return;
    if (suvLocked && !isSuv) {
      setError("This car needs the SUV / MPV extra.");
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
    // Stored on the guest when the booking is confirmed. Omitted when blank. Does not change amount.
    const referral = referralCode.trim().toUpperCase();
    try {
      const { bookingData, detailerData } = buildCheckoutPayloads({
        user: { name: contactName.trim(), email: contactEmail.trim(), phone: contactPhone.trim() },
        vehicle,
        service,
        valet,
        address: {
          // Server replaces this stub with a real Address id after persist_guest_address.
          id: "pending",
          address: address.address,
          post_code: address.post_code,
          city: address.city,
          country: address.country,
          latitude: address.latitude ?? null,
          longitude: address.longitude ?? null,
        },
        addons: selectedAddons,
        dateIso,
        timeSlot,
        durationMinutes,
        instructions,
        isSuv,
        isExpress,
        applyPartnerDiscount: false,
        amountDue,
        subtotal: voucher ? payable.subtotal : payable.subtotal,
        vat: voucher ? payable.vat : payable.vat,
        stickerTotal: quote.pricing_lines_full.sticker_total_inc_vat,
        appliedFreeQuickSparkle: false,
        complimentarySource: null,
        voucher,
        bookingReference,
      });
      const data = await createGuestPaymentSheet({
        name: contactName.trim(),
        email: contactEmail.trim(),
        phone: contactPhone.trim(),
        ...(lookupToken
          ? { lookup_token: lookupToken }
          : {
              vehicle: {
                make: typedCar?.make,
                model: typedCar?.model,
                year: typedCar?.year,
                color: typedCar?.color,
                registration_number: typedCar?.registration_number,
                licence: typedCar?.licence,
                country: typedCar?.country,
              },
            }),
        ...(referral ? { referral_code: referral } : {}),
        amount: Math.round(amountDue * 100),
        booking_reference: bookingReference,
        booking_data: bookingData,
        detailer_booking_data: detailerData,
      });
      if (data.free_booking) {
        goToConfirmation(data.booking_reference || bookingReference, true);
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
        vehicleLine: vehicleLabel({ make: vehicle.make, model: vehicle.model, licence: vehicle.licence }),
        addressLine: [address.address, address.city, address.post_code].filter(Boolean).join(", "),
        total: amountDue,
        free: false,
        endTime: endClock || undefined,
      });
      setClientSecret(data.paymentIntent);
      setPaymentIntentId(data.paymentIntentId || intentIdFromClientSecret(data.paymentIntent));
    } catch (err) {
      setError(authErrorMessage(err, "Could not start payment."));
    } finally {
      setPaying(false);
    }
  }

  const plateHint = useMemo(() => {
    if (!lookup || lookup.plate.status !== "owned_by_other_guest") return null;
    return "If you booked this car as a guest before, use the same email.";
  }, [lookup]);

  return (
    <GuestBookShell>
      <section className="welcome">
        <p className="kicker">Guest</p>
        <h1 className="page-title">Book as a guest</h1>
        <p className="lede">
          Look up the car or type the details, pick a time, and pay. We email the reference.
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
                if (item.id > step) return;
                if (step === 5 && item.id < 5) {
                  // Drop a stale PaymentIntent if the guest edits earlier steps.
                  setClientSecret(null);
                  setPaymentIntentId(null);
                }
                setStep(item.id);
              }}
              disabled={item.id > step}
            >
              <span>{item.id}</span>
              {item.title}
            </button>
          </li>
        ))}
      </ol>

      {catalogLoading ? <p className="muted">Loading packages…</p> : null}

      {!catalogLoading && step === 1 ? (
        <section className="wizard-panel">
          <h2 className="section-title">{carEntry === "manual" ? "Car details" : "Registration"}</h2>
          {carEntry === "lookup" ? (
            <>
              <label className="field">
                <span>Irish registration</span>
                <input
                  value={licence}
                  onChange={(e) => setLicence(e.target.value.toUpperCase())}
                  placeholder="e.g. 241D12345"
                  autoComplete="off"
                />
              </label>
              <div className="card-actions">
                <button type="button" className="btn btn-primary" onClick={() => void runLookup()} disabled={lookupBusy}>
                  {lookupBusy ? "Looking up…" : "Look up"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={showManualEntry}>
                  Enter details by hand
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">Type the car if the registration lookup does not have it.</p>
              <label className="field">
                <span>Registration</span>
                <input
                  value={licence}
                  onChange={(e) => updateManual({ licence: e.target.value.toUpperCase() })}
                  autoComplete="off"
                  required
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>Make</span>
                  <input value={make} onChange={(e) => updateManual({ make: e.target.value })} required />
                </label>
                <label className="field">
                  <span>Model</span>
                  <input value={model} onChange={(e) => updateManual({ model: e.target.value })} required />
                </label>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Year</span>
                  <input
                    inputMode="numeric"
                    value={year}
                    onChange={(e) => updateManual({ year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    required
                  />
                </label>
                <label className="field">
                  <span>Colour</span>
                  <input value={color} onChange={(e) => updateManual({ color: e.target.value })} required />
                </label>
              </div>
              <label className="field">
                <span>Country</span>
                <input value={vehicleCountry} onChange={(e) => updateManual({ country: e.target.value })} required />
              </label>
              <button type="button" className="btn btn-ghost" onClick={showLookupEntry}>
                Back to lookup
              </button>
            </>
          )}
          {vehicle && carEntry === "lookup" ? (
            <div className="card">
              {vehicle.image ? <img src={vehicle.image} alt="" className="guest-vehicle-photo" /> : null}
              <h2>
                {vehicle.year} {vehicle.make} {vehicle.model}
              </h2>
              <p className="muted">
                {vehicle.licence}
                {vehicle.color ? ` · ${vehicle.color}` : ""}
                {vehicle.body_style ? ` · ${vehicle.body_style}` : ""}
              </p>
            </div>
          ) : null}
          {carEntry === "lookup" && plateHint ? <p className="muted">{plateHint}</p> : null}
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
                  SUV / MPV (20% extra)
                  {suvLocked ? " — required for this body style." : ""}
                </span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={isExpress} onChange={(e) => setIsExpress(e.target.checked)} />
                <span>Express (€30) — two people when available.</span>
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
          <h2 className="section-title">Choose a type</h2>
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
              <h2 className="section-title">Add-ons</h2>
              <p className="muted">Optional. Four or more, and the cheapest is free.</p>
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
          <h2 className="section-title">Where and when</h2>
          <AddressSearchInput
            label="Address"
            placeholder="Start typing your address"
            value={address}
            onSelect={(next) => {
              setAddress(next);
              setTimeSlot(null);
            }}
            onClear={() => {
              setAddress(null);
              setTimeSlot(null);
            }}
          />
          <label className="field">
            <span>Date</span>
            <input type="date" min={todayIso()} value={dateIso} onChange={(e) => setDateIso(e.target.value)} />
          </label>
          <div>
            <p className="field-label">Times</p>
            {!address?.city || !address?.country ? (
              <p className="muted">Pick an address to see times.</p>
            ) : slotsLoading ? (
              <p className="muted">Checking times…</p>
            ) : slotsError ? (
              <div className="banner banner-error" role="alert">
                {slotsError}
              </div>
            ) : timeSlots.length === 0 ? (
              <p className="muted">No times that day. Try another date.</p>
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
            <span>Your name</span>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              autoComplete="tel"
            />
          </label>
          <label className="field">
            <span>Referral code (optional)</span>
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="If you have one"
              maxLength={12}
            />
            <p className="muted">Saved with this visit. It does not change today’s price.</p>
          </label>
          <label className="field">
            <span>Notes (optional)</span>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Gate code, parking, anything we should know."
            />
          </label>
        </section>
      ) : null}

      {!catalogLoading && step === 5 && vehicle && service && valet && address ? (
        <section className="wizard-panel">
          <h2 className="section-title">Quote and pay</h2>
          {quoteLoading ? <p className="muted">Checking the price…</p> : null}
          <div className="summary-grid">
            <article className="card">
              <h2>This visit</h2>
              <dl className="meta">
                <div>
                  <dt>Car</dt>
                  <dd>
                    {vehicleLabel({ make: vehicle.make, model: vehicle.model, licence: vehicle.licence })}
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
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {contactName} · {contactEmail}
                  </dd>
                </div>
                {referralCode.trim() ? (
                  <div>
                    <dt>Referral code</dt>
                    <dd>{referralCode.trim().toUpperCase()}</dd>
                  </div>
                ) : null}
                {selectedAddons.length > 0 ? (
                  <div>
                    <dt>Add-ons</dt>
                    <dd>{selectedAddons.map((item) => item.name).join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
            </article>
            <article className="card">
              <h2>Price</h2>
              {breakdown && payable ? (
                <dl className="price-list">
                  <div>
                    <dt>{selectedAddons.length > 0 ? "Service & add-ons" : "Service"}</dt>
                    <dd>
                      {formatMoney(
                        Math.max(
                          0,
                          breakdown.stickerSubtotalIncVat -
                            breakdown.suvSurchargeIncVat -
                            breakdown.expressFeeIncVat -
                            breakdown.travelSurchargeIncVat,
                        ),
                        country,
                      )}
                    </dd>
                  </div>
                  {breakdown.suvSurchargeIncVat > 0 ? (
                    <div>
                      <dt>SUV / MPV (20%)</dt>
                      <dd>{formatMoney(breakdown.suvSurchargeIncVat, country)}</dd>
                    </div>
                  ) : null}
                  {breakdown.expressFeeIncVat > 0 ? (
                    <div>
                      <dt>Express</dt>
                      <dd>{formatMoney(breakdown.expressFeeIncVat, country)}</dd>
                    </div>
                  ) : null}
                  {breakdown.travelSurchargeIncVat > 0 ? (
                    <div>
                      <dt>Travel surcharge</dt>
                      <dd>{formatMoney(breakdown.travelSurchargeIncVat, country)}</dd>
                    </div>
                  ) : null}
                  {voucher ? (
                    <div className="price-save">
                      <dt>Voucher</dt>
                      <dd>−{formatMoney(voucher.discountApplied, country)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Total</dt>
                    <dd>{formatMoney(amountDue, country)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="muted">The price will show here in a moment.</p>
              )}
            </article>
          </div>

          <div className="card">
            <h2>Voucher code</h2>
            <p className="muted">Winner or gift code. Optional. It must match the email above.</p>
            <div className="voucher-row">
              <input
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                placeholder="Code"
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
                    const ok = window.confirm("Remove this code?");
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

          {clientSecret ? (
            <div className="card">
              <h2>Pay</h2>
              {paying ? <p className="muted">Confirming payment…</p> : null}
              <StripeCheckout clientSecret={clientSecret}>
                <PaymentForm
                  clientSecret={clientSecret}
                  paymentIntentId={paymentIntentId}
                  onPaid={finishPaid}
                  returnPath="/book/guest/confirmation"
                />
              </StripeCheckout>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="wizard-nav">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (step === 5) {
              // Drop a stale PaymentIntent if the guest goes back from pay.
              setClientSecret(null);
              setPaymentIntentId(null);
            }
            setStep((s) => Math.max(1, s - 1));
          }}
          disabled={step === 1}
        >
          Back
        </button>
        {step < 5 ? (
          <button type="button" className="btn btn-primary" onClick={goNext} disabled={!stepValid[step as 1 | 2 | 3 | 4]}>
            Continue
          </button>
        ) : clientSecret ? (
          <span className="muted">Pay above.</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startCheckout()}
            disabled={!stepValid[5] || paying || !coolingOff}
          >
            {paying
              ? "Starting…"
              : amountDue <= 0
                ? "Complete booking"
                : `Pay ${formatMoney(amountDue, country)}`}
          </button>
        )}
      </div>
      <p className="auth-footer">
        Prefer a full account? <Link to={`/register${referralQuery()}`}>Join us</Link>
      </p>
    </GuestBookShell>
  );
}
