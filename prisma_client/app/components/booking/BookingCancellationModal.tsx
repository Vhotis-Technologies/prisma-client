import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";
import { formatCurrency } from "@/app/utils/methods";

interface BookingCancellationModalProps {
  bookingReference: string;
  cancellationData: {
    message: string;
    booking_status: string;
    refund: { amount: number; tier?: "full" | "half" | "none" } | null;
    hours_until_appointment: number;
    tier?: "full" | "half" | "none";
  };
  onCancel: () => void;
  onConfirm: () => void;
}

const BookingCancellationModal: React.FC<BookingCancellationModalProps> = ({
  bookingReference,
  cancellationData,
  onCancel,
  onConfirm,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const primaryPurpleColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");
  const borderColor = useThemeColor({}, "borders");

  const getRefundMessage = () => {
    const tier = cancellationData.tier ?? cancellationData.refund?.tier;
    if (tier === "none" || !cancellationData.refund) {
      return "No refund applicable";
    }
    if (tier === "half") {
      if (
        typeof cancellationData.refund === "object" &&
        cancellationData.refund.amount != null
      ) {
        const refundAmount = cancellationData.refund.amount / 100;
        return `50% refund: ${formatCurrency(refundAmount)}`;
      }
      return "50% refund will be processed";
    }
    if (tier === "full") {
      if (
        typeof cancellationData.refund === "object" &&
        cancellationData.refund.amount != null
      ) {
        const refundAmount = cancellationData.refund.amount / 100;
        return `Full refund: ${formatCurrency(refundAmount)}`;
      }
      return "Full refund will be processed";
    }
    if (
      typeof cancellationData.refund === "object" &&
      cancellationData.refund.amount != null
    ) {
      const refundAmount = cancellationData.refund.amount / 100;
      return `Refund: ${formatCurrency(refundAmount)}`;
    }
    return "Refund will be processed";
  };

  const getStatusColor = () => {
    switch (cancellationData.booking_status.toLowerCase()) {
      case "cancelled":
        return "#EF4444";
      case "pending":
        return "#F59E0B";
      default:
        return textColor;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Single Card Design */}
      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconWrapper, { backgroundColor: "#FEF2F2" }]}>
            <Ionicons name="warning" size={24} color="#DC2626" />
          </View>
          <StyledText
            variant="titleLarge"
            style={[styles.title, { color: textColor }]}
          >
            Cancel Booking
          </StyledText>
          <StyledText
            variant="bodyMedium"
            style={[styles.subtitle, { color: textColor }]}
          >
            Review the details before confirming cancellation
          </StyledText>
        </View>

        {/* Booking Reference */}
        <View style={styles.section}>
          <StyledText
            variant="labelMedium"
            style={[styles.label, { color: textColor }]}
          >
            Booking Reference
          </StyledText>
          <StyledText
            variant="titleMedium"
            style={[styles.reference, { color: primaryPurpleColor }]}
          >
            {bookingReference}
          </StyledText>
        </View>

        {/* Key Information */}
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={18} color={iconColor} />
              <View style={styles.infoContent}>
                <StyledText
                  variant="labelMedium"
                  style={[styles.infoLabel, { color: textColor }]}
                >
                  Time Remaining
                </StyledText>
                <StyledText
                  variant="bodyLarge"
                  style={[styles.infoValue, { color: textColor }]}
                >
                  {cancellationData.hours_until_appointment}h
                </StyledText>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Ionicons name="card-outline" size={18} color={iconColor} />
              <View style={styles.infoContent}>
                <StyledText
                  variant="labelMedium"
                  style={[styles.infoLabel, { color: textColor }]}
                >
                  Refund
                </StyledText>
                <StyledText
                  variant="bodyLarge"
                  style={[
                    styles.infoValue,
                    { color: cancellationData.refund ? "#10B981" : "#EF4444" },
                  ]}
                >
                  {getRefundMessage()}
                </StyledText>
              </View>
            </View>
          </View>
        </View>

        {/* Message */}
        <View style={styles.section}>
          <StyledText
            variant="bodyMedium"
            style={[styles.message, { color: textColor }]}
          >
            {cancellationData.message}
          </StyledText>
        </View>
      </View>

      {/* Action Buttons */}
      <View
        style={[
          styles.actionContainer,
          { borderTopColor: borderColor },
        ]}
      >
        <TouchableOpacity
          style={[styles.keepButton, { borderColor }]}
          onPress={onCancel}
        >
          <StyledText
            variant="bodyLarge"
            style={[styles.keepButtonText, { color: textColor }]}
          >
            Keep Booking
          </StyledText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmButton, { backgroundColor: "#DC2626" }]}
          onPress={onConfirm}
        >
          <StyledText variant="bodyLarge" style={styles.confirmButtonText}>
            Cancel Booking
          </StyledText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingBottom: 100,
  },

  // Single Card Design
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontWeight: "700",
    fontSize: 20,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
    lineHeight: 20,
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  label: {
    opacity: 0.6,
    marginBottom: 8,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reference: {
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },

  // Information Row
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  infoContent: {
    marginLeft: 12,
  },
  infoLabel: {
    opacity: 0.6,
    marginBottom: 4,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontWeight: "600",
    fontSize: 14,
  },

  // Message
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    opacity: 0.8,
  },

  // Action Buttons
  actionContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
  },
  keepButton: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  keepButtonText: {
    fontWeight: "600",
    fontSize: 14,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default BookingCancellationModal;
