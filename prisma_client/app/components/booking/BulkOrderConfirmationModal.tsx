import React from "react";
import { StyleSheet, View, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";

export type BulkOrderConfirmationType = "cancelled" | "rescheduled" | "confirmed";

export interface BulkOrderConfirmationModalProps {
  type: BulkOrderConfirmationType;
  bookingReference: string;
  numberOfVehicles: number;
  date: string;
  startTime?: string;
  endTime?: string;
  serviceName: string;
  serviceDurationMinutes?: number;
  address?: {
    address?: string;
    city?: string;
    post_code?: string;
    country?: string;
  };
  totalAmount: number;
  /** For type "cancelled": refund amount (same as totalAmount for full refund). */
  refundAmount?: number;
  /** For type "rescheduled": new date/time after reschedule. */
  newDate?: string;
  newStartTime?: string;
  newEndTime?: string;
  /** For type "confirmed": true when pay-later (invoice sent). */
  invoiceSent?: boolean;
  formatPrice: (amount: number) => string;
  onClose: () => void;
  onViewDashboard: () => void;
  onViewInvoice?: () => void;
}

const BulkOrderConfirmationModal: React.FC<BulkOrderConfirmationModalProps> = ({
  type,
  bookingReference,
  numberOfVehicles,
  date,
  startTime,
  endTime,
  serviceName,
  serviceDurationMinutes,
  address,
  totalAmount,
  refundAmount,
  newDate,
  newStartTime,
  newEndTime,
  invoiceSent,
  formatPrice,
  onClose,
  onViewDashboard,
  onViewInvoice,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const primaryColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");
  const borderColor = useThemeColor({}, "borders");

  const isCancelled = type === "cancelled";
  const isConfirmed = type === "confirmed";
  const title = isCancelled
    ? "Bulk order cancelled"
    : isConfirmed
      ? "Bulk order confirmed!"
      : "Bulk order rescheduled";
  const subtitle = isCancelled
    ? "Your bulk order has been cancelled. Refund will be processed as below."
    : isConfirmed
      ? invoiceSent
        ? "An invoice has been sent to your email. It is due within 30 days; you can pay when your team is ready."
        : "Your bulk order has been confirmed and assigned to our team."
      : "Your bulk order has been rescheduled. New date and time are confirmed below.";

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr || dateStr.length < 10) return dateStr;
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };

  const addressLine = address
    ? [address.address, address.city, address.post_code, address.country].filter(Boolean).join(", ")
    : null;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: isCancelled ? "#FEE2E2" : "#D1FAE5" },
            ]}
          >
            <Ionicons
              name={isCancelled ? "close-circle" : "checkmark-circle"}
              size={32}
              color={isCancelled ? "#DC2626" : "#059669"}
            />
          </View>
          <StyledText variant="titleLarge" style={[styles.title, { color: textColor }]}>
            {title}
          </StyledText>
          <StyledText variant="bodyMedium" style={[styles.subtitle, { color: textColor }]}>
            {subtitle}
          </StyledText>
        </View>

        {/* Booking reference */}
        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <StyledText variant="labelLarge" style={[styles.label, { color: textColor }]}>
            Order reference
          </StyledText>
          <StyledText variant="titleMedium" style={[styles.reference, { color: primaryColor }]}>
            #{bookingReference}
          </StyledText>
        </View>

        {/* Order details */}
        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <StyledText variant="titleMedium" style={[styles.cardTitle, { color: textColor }]}>
            Order details
          </StyledText>

          <View style={styles.detailRow}>
            <View style={[styles.detailIcon, { backgroundColor: primaryColor + "20" }]}>
              <Ionicons name="car" size={20} color={primaryColor} />
            </View>
            <View style={styles.detailContent}>
              <StyledText variant="bodyMedium" style={[styles.detailLabel, { color: textColor }]}>
                Vehicles
              </StyledText>
              <StyledText variant="bodyLarge" style={[styles.detailValue, { color: textColor }]}>
                {numberOfVehicles} vehicle{numberOfVehicles !== 1 ? "s" : ""}
              </StyledText>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={[styles.detailIcon, { backgroundColor: primaryColor + "20" }]}>
              <Ionicons name="construct" size={20} color={primaryColor} />
            </View>
            <View style={styles.detailContent}>
              <StyledText variant="bodyMedium" style={[styles.detailLabel, { color: textColor }]}>
                Service
              </StyledText>
              <StyledText variant="bodyLarge" style={[styles.detailValue, { color: textColor }]}>
                {serviceName}
              </StyledText>
              {serviceDurationMinutes != null && (
                <StyledText variant="bodySmall" style={[styles.detailValue, { color: textColor, opacity: 0.8 }]}>
                  {serviceDurationMinutes} min per vehicle
                </StyledText>
              )}
            </View>
          </View>

          {!isCancelled && (
            <>
              <View style={styles.detailRow}>
                <View style={[styles.detailIcon, { backgroundColor: primaryColor + "20" }]}>
                  <Ionicons name="calendar" size={20} color={primaryColor} />
                </View>
                <View style={styles.detailContent}>
                  <StyledText variant="bodyMedium" style={[styles.detailLabel, { color: textColor }]}>
                    {isConfirmed ? "Date & time" : "Original date"}
                  </StyledText>
                  <StyledText variant="bodyLarge" style={[styles.detailValue, { color: textColor }]}>
                    {formatDisplayDate(date)}
                  </StyledText>
                  {(startTime || endTime) && (
                    <StyledText variant="bodySmall" style={[styles.detailValue, { color: textColor, opacity: 0.8 }]}>
                      {startTime || "—"} – {endTime || "—"}
                    </StyledText>
                  )}
                </View>
              </View>
              {!isConfirmed && newDate && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIcon, { backgroundColor: "#D1FAE5" }]}>
                    <Ionicons name="calendar" size={20} color="#059669" />
                  </View>
                  <View style={styles.detailContent}>
                    <StyledText variant="bodyMedium" style={[styles.detailLabel, { color: textColor }]}>
                      New date & time
                    </StyledText>
                    <StyledText variant="bodyLarge" style={[styles.detailValue, { color: "#059669", fontWeight: "600" }]}>
                      {formatDisplayDate(newDate)}
                    </StyledText>
                    {(newStartTime || newEndTime) && (
                      <StyledText variant="bodySmall" style={[styles.detailValue, { color: textColor }]}>
                        {newStartTime || "—"} – {newEndTime || "—"}
                      </StyledText>
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          {isCancelled && (
            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: primaryColor + "20" }]}>
                <Ionicons name="calendar" size={20} color={primaryColor} />
              </View>
              <View style={styles.detailContent}>
                <StyledText variant="bodyMedium" style={[styles.detailLabel, { color: textColor }]}>
                  Was scheduled
                </StyledText>
                <StyledText variant="bodyLarge" style={[styles.detailValue, { color: textColor }]}>
                  {formatDisplayDate(date)}
                </StyledText>
                {(startTime || endTime) && (
                  <StyledText variant="bodySmall" style={[styles.detailValue, { color: textColor, opacity: 0.8 }]}>
                    {startTime || "—"} – {endTime || "—"}
                  </StyledText>
                )}
              </View>
            </View>
          )}

          {addressLine ? (
            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: primaryColor + "20" }]}>
                <Ionicons name="location" size={20} color={primaryColor} />
              </View>
              <View style={styles.detailContent}>
                <StyledText variant="bodyMedium" style={[styles.detailLabel, { color: textColor }]}>
                  Address
                </StyledText>
                <StyledText variant="bodyLarge" style={[styles.detailValue, { color: textColor }]}>
                  {addressLine}
                </StyledText>
              </View>
            </View>
          ) : null}
        </View>

        {/* Payment / refund summary */}
        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <StyledText variant="titleMedium" style={[styles.cardTitle, { color: textColor }]}>
            {isCancelled ? "Refund" : isConfirmed && invoiceSent ? "Invoice" : "Payment summary"}
          </StyledText>
          <View style={styles.detailRow}>
            <View style={[styles.detailIcon, { backgroundColor: primaryColor + "20" }]}>
              <Ionicons name="card" size={20} color={primaryColor} />
            </View>
            <View style={styles.detailContent}>
              <StyledText variant="bodyMedium" style={[styles.detailLabel, { color: textColor }]}>
                {isCancelled ? "Amount refunded" : isConfirmed && invoiceSent ? "Amount due" : "Total paid"}
              </StyledText>
              <StyledText variant="titleLarge" style={[styles.totalAmount, { color: primaryColor }]}>
                {formatPrice(refundAmount ?? totalAmount)}
              </StyledText>
              {isCancelled && (
                <StyledText variant="bodySmall" style={[styles.detailValue, { color: textColor, opacity: 0.8, marginTop: 4 }]}>
                  Full refund will be processed within 3–5 business days.
                </StyledText>
              )}
              {isConfirmed && invoiceSent && (
                <StyledText variant="bodySmall" style={[styles.detailValue, { color: textColor, opacity: 0.8, marginTop: 4 }]}>
                  Check your email for the invoice. Pay when ready.
                </StyledText>
              )}
            </View>
          </View>
        </View>

        {/* Thank you */}
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <StyledText variant="titleMedium" style={[styles.thankYou, { color: textColor }]}>
            Thank you for using Prisma Car Care
          </StyledText>
          <StyledText variant="bodyMedium" style={[styles.thankYouSub, { color: textColor }]}>
            {isCancelled
              ? "We're sorry to see the order cancelled. You can book again anytime."
              : isConfirmed
                ? invoiceSent
                  ? "Pay your invoice when ready. We'll confirm once payment is received."
                  : "We'll send you updates about your booking status."
                : "We'll keep you updated on your rescheduled order.\nIf you have any questions, please contact us."}
          </StyledText>
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={[styles.actions, { backgroundColor: cardColor, borderTopColor: borderColor }]}>
        {isConfirmed && invoiceSent && onViewInvoice ? (
          <StyledButton
            title="View invoice & pay"
            variant="small"
            onPress={onViewInvoice}
            style={[styles.primaryButton, { backgroundColor: primaryColor }]}
          />
        ) : null}
        <StyledButton
          title="View dashboard"
          variant="small"
          onPress={onViewDashboard}
          style={[styles.primaryButton, { backgroundColor: primaryColor }]}
        />
        <TouchableOpacity style={[styles.closeButton, { borderColor }]} onPress={onClose}>
          <StyledText variant="bodyMedium" style={[styles.closeButtonText, { color: textColor }]}>
            Close
          </StyledText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  title: {
    fontWeight: "700",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    textAlign: "center",
    opacity: 0.85,
    fontSize: 14,
  },
  label: {
    opacity: 0.7,
    marginBottom: 6,
    textAlign: "center",
  },
  reference: {
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  cardTitle: {
    fontWeight: "600",
    fontSize: 16,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    opacity: 0.7,
    marginBottom: 2,
    fontSize: 12,
  },
  detailValue: {
    fontWeight: "500",
    fontSize: 14,
  },
  totalAmount: {
    fontWeight: "700",
    fontSize: 18,
  },
  thankYou: {
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
    fontSize: 16,
  },
  thankYouSub: {
    textAlign: "center",
    opacity: 0.8,
    fontSize: 13,
  },
  actions: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    gap: 10,
  },
  primaryButton: {
    marginBottom: 0,
  },
  closeButton: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  closeButtonText: {
    fontWeight: "600",
    fontSize: 14,
  },
});

export default BulkOrderConfirmationModal;
