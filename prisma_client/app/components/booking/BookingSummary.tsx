import React from "react";
import { StyleSheet, View, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  ServiceTypeProps,
  ValetTypeProps,
  AddOnsProps,
  BookingPriceSummaryBreakdown,
} from "@/app/interfaces/BookingInterfaces";
import { MyVehiclesProps } from "@/app/interfaces/GarageInterface";
import {
  MyAddressProps,
  UserProfileProps,
} from "@/app/interfaces/ProfileInterfaces";
import StyledText from "@/app/components/helpers/StyledText";
import SquareCheckbox from "@/app/components/helpers/SquareCheckbox";
import { formatDate } from "@/app/utils/methods";

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
  promotionDiscountAmount?: number;
  priceSummaryBreakdown?: BookingPriceSummaryBreakdown | null;
  total?: number;
  coolingOffConsent: boolean;
  onCoolingOffConsentChange: (agreed: boolean) => void;
  /** Shown when Sedan plan does not cover an SUV/MPV booking. */
  subscriptionCoverageMessage?: string | null;
  onUpgradeSubscriptionPress?: () => void;
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
  promotionDiscountAmount,
  priceSummaryBreakdown,
  total,
  coolingOffConsent,
  onCoolingOffConsentChange,
  subscriptionCoverageMessage,
  onUpgradeSubscriptionPress,
}) => {
  const srv = priceSummaryBreakdown ?? null;
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
    if (promotionDiscountAmount != null && promotionDiscountAmount >= 0) {
      return promotionDiscountAmount;
    }
    return 0;
  };

  const calculatedLoyaltyDiscount = srv
    ? srv.loyaltyDiscountIncVat
    : loyaltyDiscount || calculateLoyaltyDiscount();
  const calculatedPromotionDiscount = srv
    ? srv.promotionDiscountIncVat
    : calculatePromotionDiscount();
  const calculatedOriginalPrice = srv
    ? srv.stickerSubtotalIncVat
    : originalPrice ?? basePrice + addonPrice + suvPrice + (expressServicePrice ?? 0);

  // Total (VAT inclusive) - server breakdown wins when provided
  const calculatedTotal = srv
    ? srv.totalIncVat
    : total !== undefined
      ? total
      : (finalPrice ??
        calculatedOriginalPrice -
          calculatedLoyaltyDiscount -
          calculatedPromotionDiscount);



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
              {formatDate(selectedDate.toISOString())}
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
                        variant="titleMedium"
                        style={[styles.loyaltyLabel]}
                      >
                        Free Services:
                      </StyledText>
                      <StyledText
                        variant="bodyMedium"
                          style={[styles.loyaltyValue]}
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
                  SUV Surcharge (20%):
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

            {/* Subtotal (VAT inc.) before percentage discounts; server quote uses sticker stack */}
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

            {srv && srv.subscriptionDiscountIncVat > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: "#EC4899" }]}
                >
                  Subscription discount
                  {srv.subscriptionDiscountPercent != null
                    ? ` (${srv.subscriptionDiscountPercent}%)`
                    : ""}
                  :
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: "#EC4899" }]}
                >
                  −{formatPrice(srv.subscriptionDiscountIncVat)}
                </StyledText>
              </View>
            )}

            {!!subscriptionCoverageMessage && (
              <View
                style={[
                  styles.coverageNotice,
                  { borderColor: borderColor, backgroundColor: cardColor },
                ]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={primaryPurpleColor}
                  style={{ marginTop: 2 }}
                />
                <View style={styles.coverageNoticeBody}>
                  <StyledText
                    variant="bodySmall"
                    style={[styles.coverageNoticeText, { color: textColor }]}
                  >
                    {subscriptionCoverageMessage}
                  </StyledText>
                  {onUpgradeSubscriptionPress ? (
                    <TouchableOpacity
                      onPress={onUpgradeSubscriptionPress}
                      style={styles.coverageCta}
                      accessibilityRole="button"
                    >
                      <StyledText
                        variant="labelMedium"
                        style={{ color: primaryPurpleColor, fontWeight: "600" }}
                      >
                        Open subscription settings
                      </StyledText>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}

            {srv && srv.complimentaryStickerSavingsIncVat > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: "#38BDF8" }]}
                >
                  Complimentary Quick Sparkle:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: "#38BDF8" }]}
                >
                  −{formatPrice(srv.complimentaryStickerSavingsIncVat)}
                </StyledText>
              </View>
            )}

            {calculatedLoyaltyDiscount > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: "#10B981" }]}
                >
                  Loyalty discount
                  {srv?.loyaltyDiscountPercent != null
                    ? ` (${srv.loyaltyDiscountPercent}%)`
                    : ""}
                  :
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: "#10B981" }]}
                >
                  −{formatPrice(calculatedLoyaltyDiscount)}
                </StyledText>
              </View>
            )}

            {calculatedPromotionDiscount > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: "#F59E0B" }]}
                >
                  Promotion discount:
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: "#F59E0B" }]}
                >
                  −{formatPrice(calculatedPromotionDiscount)}
                </StyledText>
              </View>
            )}

            {srv && srv.partnerReferralDiscountIncVat > 0 && (
              <View style={styles.priceRow}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceLabel, { color: "#A78BFA" }]}
                >
                  Partner welcome discount
                  {srv.partnerReferralDiscountPercent != null
                    ? ` (${srv.partnerReferralDiscountPercent}%)`
                    : ""}
                  :
                </StyledText>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.priceValue, { color: "#A78BFA" }]}
                >
                  −{formatPrice(srv.partnerReferralDiscountIncVat)}
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

        <View
          style={[styles.section, { backgroundColor: cardColor, borderColor }]}
        >
          <TouchableOpacity
            style={styles.consentRow}
            onPress={() => onCoolingOffConsentChange(!coolingOffConsent)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: coolingOffConsent }}
          >
            <SquareCheckbox
              checked={coolingOffConsent}
              borderColor={borderColor}
              checkedBackgroundColor={buttonColor}
              checkColor="#fff"
              size="default"
              style={styles.consentCheckboxOffset}
            />
            <View style={styles.consentTextWrap}>
              <StyledText variant="bodySmall" style={{ color: textColor }}>
                I agree to the service starting on{" "}
                <StyledText style={{ fontWeight: "600" }}>
                  {formatDate(selectedDate.toISOString())}
                </StyledText>{" "}
                and acknowledge that my right to a full cooling-off period is
                waived once a specific time slot is{" "}
                <StyledText style={{ textDecorationLine: "underline" }}>
                  reserved.
                </StyledText>
              </StyledText>
              <StyledText
                variant="bodySmall"
                style={{ color: textColor, marginTop: 8, opacity: 0.9 }}
              >
                Please check our refund policy.
              </StyledText>
            </View>
          </TouchableOpacity>
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
    flexWrap: "wrap",
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
  coverageNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  coverageNoticeBody: {
    flex: 1,
    gap: 8,
  },
  coverageNoticeText: {
    flex: 1,
    lineHeight: 18,
    opacity: 0.9,
  },
  coverageCta: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  consentCheckboxOffset: {
    marginTop: 2,
  },
  consentTextWrap: {
    flex: 1,
  },
});
