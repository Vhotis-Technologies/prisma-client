import React from "react";
import { StyleSheet, View, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";
import {
  ServiceTypeProps,
  ValetTypeProps,
  AddOnsProps,
} from "@/app/interfaces/BookingInterfaces";
import { MyVehiclesProps } from "@/app/interfaces/GarageInterface";
import {
  MyAddressProps,
  UserProfileProps,
} from "@/app/interfaces/ProfileInterfaces";

interface BookingConfirmationModalProps {
  bookingReference: string;
  vehicle: MyVehiclesProps;
  serviceType: ServiceTypeProps;
  valetType: ValetTypeProps;
  address: MyAddressProps;
  selectedDate: Date;
  specialInstructions: string;
  selectedAddons: AddOnsProps[];
  finalPrice: number;
  originalPrice: number;
  loyaltyDiscount: number;
  formatPrice: (price: number) => string;
  formatDuration: (minutes: number) => string;
  user?: UserProfileProps;
  onClose: () => void;
  onViewDashboard: () => void;
}

const BookingConfirmationModal: React.FC<BookingConfirmationModalProps> = ({
  bookingReference,
  vehicle,
  serviceType,
  valetType,
  address,
  selectedDate,
  specialInstructions,
  selectedAddons,
  finalPrice,
  originalPrice,
  loyaltyDiscount,
  formatPrice,
  formatDuration,
  user,
  onClose,
  onViewDashboard,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const primaryPurpleColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");
  const borderColor = useThemeColor({}, "borders");

  const formatDateTime = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return date.toLocaleDateString("en-US", options);
  };

  const getServiceDuration = () => {
    const baseDuration = serviceType?.duration || 0;
    const addonDuration = selectedAddons.reduce(
      (total, addon) => total + addon.extra_duration,
      0,
    );
    return baseDuration + addonDuration;
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Success Header */}
      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <View
          style={[styles.successIcon, { backgroundColor: primaryPurpleColor }]}
        >
          <Ionicons name="checkmark-circle" size={32} color="white" />
        </View>
        <StyledText
          variant="titleLarge"
          style={[styles.successTitle, { color: textColor }]}
        >
          Booking Confirmed!
        </StyledText>
        <StyledText
          variant="bodyMedium"
          style={[styles.successSubtitle, { color: textColor }]}
        >
          Your booking has been assigned to one of our detailers
        </StyledText>
      </View>

      {/* Booking Reference */}
      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        <StyledText
          variant="labelLarge"
          style={[styles.referenceLabel, { color: textColor }]}
        >
          Booking Reference
        </StyledText>
        <StyledText
          variant="titleMedium"
          style={[styles.referenceNumber, { color: primaryPurpleColor }]}
        >
          {bookingReference}
        </StyledText>
        <StyledText
          variant="bodySmall"
          style={[styles.referenceNote, { color: textColor }]}
        >
          Keep an eye on your email for the booking confirmation
        </StyledText>
      </View>

      {/* Service Details */}
      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        <StyledText
          variant="titleMedium"
          style={[styles.cardTitle, { color: textColor }]}
        >
          Service Details
        </StyledText>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="construct" size={20} color={iconColor} />
          </View>
          <View style={styles.detailContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailLabel, { color: textColor }]}
            >
              Service Type
            </StyledText>
            <StyledText
              variant="bodyLarge"
              style={[styles.detailValue, { color: textColor }]}
            >
              {serviceType?.name}
            </StyledText>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="water" size={20} color={iconColor} />
          </View>
          <View style={styles.detailContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailLabel, { color: textColor }]}
            >
              Valet Type
            </StyledText>
            <StyledText
              variant="bodyLarge"
              style={[styles.detailValue, { color: textColor }]}
            >
              {valetType?.name}
            </StyledText>
          </View>
        </View>

        {selectedAddons.length > 0 && (
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="add-circle" size={20} color={iconColor} />
            </View>
            <View style={styles.detailContent}>
              <StyledText
                variant="bodyMedium"
                style={[styles.detailLabel, { color: textColor }]}
              >
                Add-ons
              </StyledText>
              {selectedAddons.map((addon) => (
                <StyledText
                  key={addon.id}
                  variant="bodyLarge"
                  style={[styles.detailValue, { color: textColor }]}
                >
                  {addon.name} (+{formatDuration(addon.extra_duration)})
                </StyledText>
              ))}
            </View>
          </View>
        )}

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="time" size={20} color={iconColor} />
          </View>
          <View style={styles.detailContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailLabel, { color: textColor }]}
            >
              Duration
            </StyledText>
            <StyledText
              variant="bodyLarge"
              style={[styles.detailValue, { color: textColor }]}
            >
              {formatDuration(getServiceDuration())}
            </StyledText>
          </View>
        </View>
      </View>

      {/* Vehicle Information */}
      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        <StyledText
          variant="titleMedium"
          style={[styles.cardTitle, { color: textColor }]}
        >
          Vehicle Information
        </StyledText>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="car" size={20} color={iconColor} />
          </View>
          <View style={styles.detailContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailLabel, { color: textColor }]}
            >
              Vehicle
            </StyledText>
            <StyledText
              variant="bodyLarge"
              style={[styles.detailValue, { color: textColor }]}
            >
              {vehicle?.make} {vehicle?.model} ({vehicle?.year})
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailValue, { color: textColor }]}
            >
              License: {vehicle?.licence?.toUpperCase() ?? ""}
            </StyledText>
          </View>
        </View>
      </View>

      {/* Location & Schedule */}
      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        <StyledText
          variant="titleMedium"
          style={[styles.cardTitle, { color: textColor }]}
        >
          Location & Schedule
        </StyledText>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="location" size={20} color={iconColor} />
          </View>
          <View style={styles.detailContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailLabel, { color: textColor }]}
            >
              Address
            </StyledText>
            <StyledText
              variant="bodyLarge"
              style={[styles.detailValue, { color: textColor }]}
            >
              {address?.address}
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailValue, { color: textColor }]}
            >
              {address?.city}, {address?.post_code}
            </StyledText>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="calendar" size={20} color={iconColor} />
          </View>
          <View style={styles.detailContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailLabel, { color: textColor }]}
            >
              Appointment
            </StyledText>
            <StyledText
              variant="bodyLarge"
              style={[styles.detailValue, { color: textColor }]}
            >
              {formatDateTime(selectedDate)}
            </StyledText>
          </View>
        </View>

        {specialInstructions && (
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="document-text" size={20} color={iconColor} />
            </View>
            <View style={styles.detailContent}>
              <StyledText
                variant="bodyMedium"
                style={[styles.detailLabel, { color: textColor }]}
              >
                Special Instructions
              </StyledText>
              <StyledText
                variant="bodyLarge"
                style={[styles.detailValue, { color: textColor }]}
              >
                {specialInstructions}
              </StyledText>
            </View>
          </View>
        )}
      </View>

      {/* Payment Summary */}
      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        <StyledText
          variant="titleMedium"
          style={[styles.cardTitle, { color: textColor }]}
        >
          Payment Summary
        </StyledText>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="card" size={20} color={iconColor} />
          </View>
          <View style={styles.detailContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.detailLabel, { color: textColor }]}
            >
              Payment Method
            </StyledText>
            <StyledText
              variant="bodyLarge"
              style={[styles.detailValue, { color: textColor }]}
            >
              Card ending in •••• 4242
            </StyledText>
          </View>
        </View>

        {loyaltyDiscount > 0 && (
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="gift" size={20} color={iconColor} />
            </View>
            <View style={styles.detailContent}>
              <StyledText
                variant="bodyMedium"
                style={[styles.detailLabel, { color: textColor }]}
              >
                Loyalty Discount
              </StyledText>
              <StyledText
                variant="bodyLarge"
                style={[styles.detailValue, { color: "#10B981" }]}
              >
                -{formatPrice(loyaltyDiscount)}
              </StyledText>
            </View>
          </View>
        )}

        <View style={[styles.totalRow, { borderTopColor: borderColor }]}>
          <StyledText
            variant="titleMedium"
            style={[styles.totalLabel, { color: textColor }]}
          >
            Total Paid
          </StyledText>
          <StyledText
            variant="titleLarge"
            style={[styles.totalAmount, { color: primaryPurpleColor }]}
          >
            {formatPrice(finalPrice)}
          </StyledText>
        </View>
      </View>

      {/* Thank You Message */}
      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <StyledText
          variant="titleMedium"
          style={[styles.thankYouText, { color: textColor }]}
        >
          Thank you for choosing PrismaValet!
        </StyledText>
        <StyledText
          variant="bodyMedium"
          style={[styles.thankYouSubtext, { color: textColor }]}
        >
          We'll send you updates about your booking status
        </StyledText>
      </View>

      {/* Action Buttons - Fixed at bottom */}
      <View
        style={[
          styles.buttonContainer,
          { backgroundColor: cardColor, borderTopColor: borderColor },
        ]}
      >
        <StyledButton
          title="View Dashboard"
          variant="small"
          onPress={onViewDashboard}
          style={[
            styles.dashboardButton,
            { backgroundColor: primaryPurpleColor },
          ]}
        />
        <TouchableOpacity
          style={[styles.closeButton, { borderColor }]}
          onPress={onClose}
        >
          <StyledText
            variant="bodyMedium"
            style={[styles.closeButtonText, { color: textColor }]}
          >
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
    padding: 8,
    paddingBottom: 120,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    alignSelf: "center",
  },
  successTitle: {
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    fontSize: 20,
  },
  successSubtitle: {
    textAlign: "center",
    opacity: 0.8,
    fontSize: 14,
  },
  referenceLabel: {
    opacity: 0.7,
    marginBottom: 8,
    textAlign: "center",
  },
  referenceNumber: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  referenceNote: {
    textAlign: "center",
    opacity: 0.7,
    fontSize: 12,
  },
  cardTitle: {
    fontWeight: "600",
    marginBottom: 12,
    fontSize: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  detailIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginTop: 2,
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
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 8,
  },
  totalLabel: {
    fontWeight: "600",
    fontSize: 14,
  },
  totalAmount: {
    fontWeight: "700",
    fontSize: 16,
  },
  thankYouText: {
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
    fontSize: 16,
  },
  thankYouSubtext: {
    textAlign: "center",
    opacity: 0.7,
    fontSize: 12,
  },
  buttonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    borderTopWidth: 1,
    gap: 8,
    backgroundColor: "transparent",
  },
  dashboardButton: {
    marginBottom: 4,
  },
  closeButton: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  closeButtonText: {
    fontWeight: "600",
    fontSize: 14,
  },
});

export default BookingConfirmationModal;
