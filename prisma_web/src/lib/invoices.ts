import type { InvoicePaymentStatus } from "../types/invoice";

export function invoiceStatusLabel(status?: InvoicePaymentStatus | null): string {
  if (status === "invoice_later") return "Unpaid";
  if (status === "succeeded" || status === "paid") return "Paid";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (!status) return "";
  return status.replace(/_/g, " ");
}

export function invoicePillClass(status?: InvoicePaymentStatus | null): string {
  if (status === "succeeded" || status === "paid") return "pill-ok";
  if (status === "failed" || status === "cancelled") return "pill-muted";
  return "pill-pending";
}

export function isInvoicePayable(status?: InvoicePaymentStatus | null): boolean {
  return status === "invoice_later";
}
