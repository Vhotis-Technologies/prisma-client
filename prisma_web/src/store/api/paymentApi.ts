import axios from "axios";
import type {
  ComplimentaryAvailability,
  InvoiceCheckoutResponse,
  InvoiceLaterEligibility,
  InvoiceListResponse,
} from "../../types/invoice";
import type { GiftVoucherSheetResponse } from "../../types/payment";
import type { PaymentConfirmResponse, PaymentSheetResponse } from "../../types/booking";
import type { UserProfile } from "../../types/user";
import { getData, postData } from "./client";

export type VoucherApplyResponse = {
  voucher_id: string;
  amount_due: number;
  discount_applied: number;
  pre_voucher_total: number;
};

export type BulkInvoiceLaterResponse = {
  success: boolean;
  booking_reference: string;
  bulk_order_id: string | number;
  message?: string;
};

export function invoiceListPath(user: UserProfile | null): string {
  if (user?.is_fleet_owner) return "/api/v1/fleet/get_invoices/";
  if (user?.is_dealership || user?.partner_referral_code) return "/api/v1/partner/get_invoices/";
  return "/api/v1/payment/get_my_bulk_invoices/";
}

export function getInvoices(user: UserProfile | null) {
  return getData<InvoiceListResponse>(invoiceListPath(user));
}

export function getInvoiceLaterEligibility() {
  return getData<InvoiceLaterEligibility>("/api/v1/payment/get_invoice_later_eligibility/");
}

export function createPaymentSheet(body: Record<string, unknown>) {
  return postData<PaymentSheetResponse>("/api/v1/payment/create_payment_sheet/", body);
}

export function createBulkOrderInvoiceLater(body: {
  booking_data: Record<string, unknown>;
  booking_reference: string;
}) {
  return postData<BulkInvoiceLaterResponse>("/api/v1/payment/create_bulk_order_invoice_later/", body);
}

export function confirmPaymentIntent(paymentIntentId: string) {
  return postData<PaymentConfirmResponse>("/api/v1/payment/confirm_payment_intent/", {
    payment_intent_id: paymentIntentId,
  });
}

export async function waitForPaymentConfirmation(
  paymentIntentId: string,
  maxWaitMs = 60000,
  intervalMs = 2500,
): Promise<PaymentConfirmResponse> {
  const started = Date.now();
  let lastConfirmed: PaymentConfirmResponse | null = null;
  while (Date.now() - started < maxWaitMs) {
    try {
      const data = await confirmPaymentIntent(paymentIntentId);
      if (data.status === "refunded_slot_unavailable") {
        throw new Error(
          data.message ||
            "This time slot was no longer available. Your payment has been refunded. Please choose another slot.",
        );
      }
      if (data.confirmed && data.assigned) return data;
      if (data.confirmed) lastConfirmed = data;
    } catch (err) {
      if (!axios.isAxiosError(err)) throw err;
      const status = err.response?.status;
      if (status && status < 500 && status !== 429) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastConfirmed) return lastConfirmed;
  throw new Error("Payment confirmation timed out. If you were charged, check Dashboard or contact support.");
}

export function applyWinnerVoucher(code: string, preVoucherTotal: number) {
  return postData<VoucherApplyResponse>("/api/v1/payment/apply_winner_voucher/", {
    code,
    pre_voucher_total_amount: preVoucherTotal,
  });
}

export function applyGiftVoucher(code: string, preVoucherTotal: number) {
  return postData<VoucherApplyResponse>("/api/v1/payment/apply_gift_voucher/", {
    code,
    pre_voucher_total_amount: preVoucherTotal,
  });
}

export function createGiftVoucherPaymentSheet(body: {
  recipient_email: string;
  credit_amount: number;
  validity_days: number;
}) {
  return postData<GiftVoucherSheetResponse>("/api/v1/payment/create_gift_voucher_payment_sheet/", body);
}

export function getBulkInvoiceCheckout(invoiceId: string) {
  return getData<InvoiceCheckoutResponse>("/api/v1/payment/get_bulk_invoice_checkout/", {
    params: { bulk_order_id: invoiceId },
  });
}

export function getComplimentaryAvailability() {
  return getData<ComplimentaryAvailability>("/api/v1/fleet/get_complimentary_availability/");
}
