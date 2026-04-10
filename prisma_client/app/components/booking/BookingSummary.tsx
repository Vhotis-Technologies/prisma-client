import React from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
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
import StyledText from "@/app/components/helpers/StyledText";
import useBooking from "@/app/app-hooks/useBooking";

interface BookingSummaryProps {
  vehicle: MyVehiclesProps;
  serviceType: ServiceTypeProps;
  valetType: ValetTypeProps;
  address: MyAddressProps;
  selectedDate: Date;
  specialInstructions?: string;
  isSUV: boolean;
  isExpressService?: boolean;
  basePrice: number;
  suvPrice: number;
  expressServicePrice?: number;
  totalPrice: number;
  selectedAddons?: AddOnsProps[];
  addonPrice?: number;
  addonDuration?: number;
  formatPrice: (price: number) => string;
  user?: UserProfileProps;
  originalPrice?: number;
  finalPrice?: number;
  loyaltyDiscount?: number;
  total?: number;
}

const BookingSummary: React.FC<BookingSummaryProps> = ({
  vehicle,
  serviceType,
  valetType,
  address,
  selectedDate,
  specialInstructions,
  isSUV,
  isExpressService,
  basePrice,
  suvPrice,
  expressServicePrice,
  totalPrice,
  selectedAddons = [],
  addonPrice = 0,
  addonDuration = 0,
  formatPrice,
  user,
  originalPrice,
  finalPrice,
  loyaltyDiscount = 0,
  total,
}) => {
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const primaryPurpleColor = useThemeColor({}, "primary");
  const buttonColor = useThemeColor({}, "button");
  const borderColor = useThemeColor({}, "borders");

  // Calculate loyalty discount based on user's loyalty benefits
  const calculateLoyaltyDiscount = (): number => {
    if (!user?.loyalty_benefits?.discount) return 0;
    const totalBeforeDiscount = basePrice + addonPrice + suvPrice + (expressServicePrice ?? 0);
    return totalBeforeDiscount * (user.loyalty_benefits.discount / 100);
  };

  // Calculate promotion discount only if user has an active promotion
  const calculatePromotionDiscount = (): number => {
    // Only apply promotion discount if user has an active promotion
    // For now, we'll return 0 unless there's a real promotion
    // In real implementation, this would check if user has an active promotion
    return 0; // No promotion discount by default
  };

  const calculatedLoyaltyDiscount =
    loyaltyDiscount || calculateLoyaltyDiscount();
  const calculatedPromotionDiscount = calculatePromotionDiscount();
  const calculatedOriginalPrice =
    originalPrice ?? basePrice + addonPrice + suvPrice + (expressServicePrice ?? 0);

  // Total (VAT inclusive) - use provided total or calculate from legacy props
  const calculatedTotal = total !== undefined
    ? total
    : (finalPrice ?? calculatedOriginalPrice - calculatedLoyaltyDiscount - calculatedPromotionDiscount);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <View style={styles.container}>
      <StyledText
        variant="titleLarge"
        style={[styles.title, { color: textColor }]}
      >
        Booking Summary
      </StyledText>

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Vehicle Information */}
        <View style={[styles.section, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="car" size={24} color={primaryPurpleColor} />
            <StyledText
              variant="titleMedium"
              style={[styles.sectionTitle, { color: textColor }]}
            >
              Vehicle
            </StyledText>
          </View>
          <View style={styles.sectionContent}>
            <StyledText
              variant="titleMedium"
              style={[styles.vehicleName, { color: textColor }]}
            >
              {vehicle.make} {vehicle.model}
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.vehicleDetails, { color: textColor }]}
            >
              {vehicle.year} • {vehicle.color} • {vehicle.licence?.toUpperCase() ?? ""}
            </StyledText>
          </View>
        </View>

        {/* Service Details */}
        <View style={[styles.section, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="construct" size={24} color={primaryPurpleColor} />
            <StyledText
              variant="titleMedium"
              style={[styles.sectionTitle, { color: textColor }]}
            >
              Service Details
            </StyledText>
          </View>
          <View style={styles.sectionContent}>
            <View style={styles.serviceRow}>
              <StyledText
                variant="bodyMedium"
                style={[styles.serviceLabel, { color: textColor }]}
              >
                Service Type:
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.serviceValue, { color: textColor }]}
              >
                {serviceType.name}
              </StyledText>
            </View>
            <View style={styles.serviceRow}>
              <StyledText
                variant="bodyMedium"
                style={[styles.serviceLabel, { color: textColor }]}
              >
                Valet Type:
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.serviceValue, { color: textColor }]}
              >
                {valetType.name}
              </StyledText>
            </View>
            <View style={styles.serviceRow}>
              <StyledText
                variant="bodyMedium"
                style={[styles.serviceLabel, { color: textColor }]}
              >
                {selectedAddons.length > 0 ? "Service Duration:" : "Duration:"}
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.serviceValue, { color: textColor }]}
              >
                {serviceType.duration} minutes
              </StyledText>
            </View>
            {selectedAddons.length > 0 && (
              <View style={styles.serviceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.serviceLabel, { color: textColor }]}
                >
                  Total Duration:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.serviceValue, { color: textColor }]}
                >
                  {serviceType.duration + addonDuration} minutes
                </StyledText>
              </View>
            )}
            {selectedAddons.length > 0 && (
              <View style={styles.serviceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.serviceLabel, { color: textColor }]}
                >
                  Add-ons:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.serviceValue, { color: textColor }]}
                >
                  {selectedAddons.length} selected
                </StyledText>
              </View>
            )}
          </View>
        </View>

        {/* Date & Time */}
        <View style={[styles.section, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={24} color={primaryPurpleColor} />
            <StyledText
              variant="titleMedium"
              style={[styles.sectionTitle, { color: textColor }]}
            >
              Date & Time
            </StyledText>
          </View>
          <View style={styles.sectionContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.dateTimeText, { color: textColor }]}
            >
              {formatDate(selectedDate)}
            </StyledText>
            <View style={styles.timeRow}>
              <StyledText
                variant="bodyMedium"
                style={[styles.timeLabel, { color: textColor }]}
              >
                Start:
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.dateTimeText, { color: textColor }]}
              >
                {formatTime(selectedDate)}
              </StyledText>
            </View>
            <View style={styles.timeRow}>
              <StyledText
                variant="bodyMedium"
                style={[styles.timeLabel, { color: textColor }]}
              >
                End:
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.dateTimeText, { color: textColor }]}
              >
                {formatTime(
                  new Date(
                    selectedDate.getTime() +
                      (serviceType.duration + addonDuration) * 60000
                  )
                )}
              </StyledText>
            </View>
          </View>
        </View>

        {/* Location */}
        <View style={[styles.section, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location" size={24} color={primaryPurpleColor} />
            <StyledText
              variant="titleMedium"
              style={[styles.sectionTitle, { color: textColor }]}
            >
              Service Location
            </StyledText>
          </View>
          <View style={styles.sectionContent}>
            <StyledText
              variant="bodyMedium"
              style={[styles.addressText, { color: textColor }]}
            >
              {address.address}
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.addressText, { color: textColor }]}
            >
              {address.city}, {address.post_code}
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.addressText, { color: textColor }]}
            >
              {address.country}
            </StyledText>
          </View>
        </View>

        {/* Special Instructions */}
        {specialInstructions && (
          <View style={[styles.section, { backgroundColor: cardColor, borderColor: borderColor }]}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name="information-circle"
                size={24}
                color={primaryPurpleColor}
              />
              <StyledText
                variant="titleMedium"
                style={[styles.sectionTitle, { color: textColor }]}
              >
                Special Instructions
              </StyledText>
            </View>
            <View style={styles.sectionContent}>
              <StyledText
                variant="bodyMedium"
                style={[styles.instructionsText, { color: textColor }]}
              >
                {specialInstructions}
              </StyledText>
            </View>
          </View>
        )}

        {/* Loyalty Benefits Section - Only show if user has loyalty benefits */}
        {user?.loyalty_tier &&
          user?.loyalty_benefits &&
          user.loyalty_benefits.discount > 0 && (
            <View style={[styles.section, { backgroundColor: cardColor, borderColor: borderColor }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="star" size={24} color={primaryPurpleColor} />
                <StyledText
                  variant="titleMedium"
                  style={[styles.sectionTitle, { color: textColor }]}
                >
                  Loyalty Benefits (
                  {user.loyalty_tier.charAt(0).toUpperCase() +
                    user.loyalty_tier.slice(1)}
                  )
                </StyledText>
              </View>
              <View style={styles.sectionContent}>
                <View style={styles.loyaltyRow}>
                  <StyledText
                    variant="bodyMedium"
                    style={[styles.loyaltyLabel, { color: textColor }]}
                  >
                    Discount Applied:
                  </StyledText>
                  <StyledText
                    variant="bodyMedium"
                    style={[styles.loyaltyValue, { color: "#10B981" }]}
                  >
                    -{formatPrice(calculatedLoyaltyDiscount)} (
                    {user.loyalty_benefits.discount}%)
                  </StyledText>
                </View>
                {user.loyalty_benefits.free_service &&
                  user.loyalty_benefits.free_service.length > 0 && (
                    <View style={styles.loyaltyRow}>
                      <StyledText
                        variant="bodyMedium"
                        style={[styles.loyaltyLabel, { color: textColor }]}
                      >
                        Free Services:
                      </StyledText>
                      <StyledText
                        variant="bodyMedium"
                        style={[styles.loyaltyValue, { color: textColor }]}
                      >
                        {user.loyalty_benefits.free_service.join(", ")}
                      </StyledText>
                    </View>
                  )}
              </View>
            </View>
          )}

        {/* Price Summary */}
        <View style={[styles.section, { backgroundColor: cardColor, borderColor: borderColor  }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card" size={24} color={primaryPurpleColor} />
            <StyledText
              variant="titleMedium"
              style={[styles.sectionTitle, { color: textColor }]}
            >
              Price Summary
            </StyledText>
          </View>
          <View style={styles.sectionContent}>
            <View style={styles.priceRow}>
              <StyledText
                variant="bodyMedium"
                style={[styles.priceLabel, { color: textColor }]}
              >
                Service Cost:
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.priceValue, { color: textColor }]}
              >
                {formatPrice(basePrice)}
              </StyledText>
            </View>
            {isSUV && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: textColor }]}
                >
                  SUV Surcharge:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: textColor }]}
                >
                  {formatPrice(suvPrice)}
                </StyledText>
              </View>
            )}
            {isExpressService && expressServicePrice && expressServicePrice > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: textColor }]}
                >
                  Express Service:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: textColor }]}
                >
                  {formatPrice(expressServicePrice)}
                </StyledText>
              </View>
            )}
            {addonPrice > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: textColor }]}
                >
                  Add-ons:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: textColor }]}
                >
                  {formatPrice(addonPrice)}
                </StyledText>
              </View>
            )}

            {/* Always show subtotal before discounts */}
            <View
              style={[
                styles.priceRow,
                {
                  borderTopWidth: 1,
                  borderTopColor: textColor + "20",
                  paddingTop: 8,
                  marginTop: 8,
                },
              ]}
            >
              <StyledText
                variant="bodyMedium"
                style={[
                  styles.priceLabel,
                  { color: textColor, fontWeight: "600" },
                ]}
              >
                Subtotal:
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[
                  styles.priceValue,
                  { color: textColor, fontWeight: "600" },
                ]}
              >
                {formatPrice(calculatedOriginalPrice)}
              </StyledText>
            </View>

            {/* Show loyalty discount if applied */}
            {calculatedLoyaltyDiscount > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: "#10B981" }]}
                >
                  Loyalty Discount:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: "#10B981" }]}
                >
                  -{formatPrice(calculatedLoyaltyDiscount)}
                </StyledText>
              </View>
            )}

            {/* Show promotion discount if applied */}
            {calculatedPromotionDiscount > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: "#F59E0B" }]}
                >
                  Promotion Discount:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: "#F59E0B" }]}
                >
                  -{formatPrice(calculatedPromotionDiscount)}
                </StyledText>
              </View>
            )}

            <View
              style={[
                styles.totalRow,
                {
                  borderTopWidth: 2,
                  borderTopColor: buttonColor,
                  paddingTop: 12,
                  marginTop: 12,
                },
              ]}
            >
              <View style={styles.totalLeft}>
                <StyledText
                  variant="titleMedium"
                  style={[styles.totalLabel, { color: textColor }]}
                >
                  Total Amount (VAT incl):
                </StyledText>
              </View>
              <StyledText
                variant="titleLarge"
                style={[styles.totalValue, { color: buttonColor }]}
              >
                {formatPrice(calculatedTotal)}
              </StyledText>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default BookingSummary;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  scrollContainer: {
    flex: 1,
  },
  section: {
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    marginLeft: 12,
    fontWeight: "600",
  },
  sectionContent: {
    gap: 8,
  },
  vehicleName: {
    fontWeight: "600",
  },
  vehicleDetails: {
    opacity: 0.8,
  },
  serviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  serviceLabel: {
    fontWeight: "500",
  },
  serviceValue: {
    fontWeight: "600",
  },
  dateTimeText: {
    fontWeight: "500",
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeLabel: {
    fontWeight: "500",
  },
  addressText: {
    fontWeight: "500",
  },
  instructionsText: {
    lineHeight: 20,
    fontStyle: "italic",
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  priceLabel: {
    fontWeight: "500",
  },
  priceValue: {
    fontWeight: "600",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    marginTop: 8,
  },
  totalLeft: {
    flex: 1,
  },
  totalLabel: {
    fontWeight: "600",
  },
  totalValue: {
    fontWeight: "bold",
  },
  vatText: {
    marginTop: 2,
    fontSize: 12,
  },
  loyaltyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  loyaltyLabel: {
    fontWeight: "500",
  },
  loyaltyValue: {
    fontWeight: "600",
  },
});
