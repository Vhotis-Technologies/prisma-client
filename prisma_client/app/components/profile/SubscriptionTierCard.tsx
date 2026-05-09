import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import { SubscriptionTierProps } from "@/app/interfaces/SubscriptionInterfaces";

interface SubscriptionTierCardProps {
  tier: SubscriptionTierProps;
  isSelected: boolean;
  onSelect: () => void;
  selectedBillingCycle: "monthly" | "yearly";
  onBillingCycleChange: (cycle: "monthly" | "yearly") => void;
  canStartTrial?: boolean;
  isEarlyAdopter?: boolean;
}

const SubscriptionTierCard: React.FC<SubscriptionTierCardProps> = ({
  tier,
  isSelected,
  onSelect,
  selectedBillingCycle,
  onBillingCycleChange,
  canStartTrial = false,
  isEarlyAdopter = false,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const successColor = useThemeColor({}, "success");

  const currentPrice =
    selectedBillingCycle === "monthly"
      ? tier.monthlyPrice
      : tier.yearlyPrice;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(price);
  };

  return (
    <Pressable
      onPress={onSelect}
      style={[
        styles.container,
        {
          backgroundColor: backgroundColor,
          borderColor: isSelected ? primaryColor : borderColor,
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
    >
      {tier.badge && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: primaryColor + "20",
            },
          ]}
        >
          <StyledText
            style={[styles.badgeText, { color: primaryColor }]}
            variant="labelSmall"
            children={tier.badge}
          />
        </View>
      )}
      {canStartTrial && isSelected && (
        <View
          style={[
            styles.trialBadge,
            {
              backgroundColor: successColor + "20",
            },
          ]}
        >
          <StyledText
            style={[styles.trialBadgeText, { color: successColor }]}
            variant="labelSmall"
            children={isEarlyAdopter ? "2 months free" : "1 month free"}
          />
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.headerContent}>
          <StyledText
            style={[styles.title, { color: textColor }]}
            variant="titleLarge"
            children={tier.name}
          />
          {tier.tagLine && (
            <StyledText
              style={[styles.tagLine, { color: textColor }]}
              variant="bodySmall"
              children={tier.tagLine}
            />
          )}
        </View>
        {isSelected && (
          <View
            style={[
              styles.selectedIndicator,
              { backgroundColor: successColor },
            ]}
          >
            <Ionicons name="checkmark" size={20} color="white" />
          </View>
        )}
      </View>

      <View style={styles.pricingSection}>
        <View style={styles.priceContainer}>
          <StyledText
            style={[styles.price, { color: textColor }]}
            variant="displaySmall"
            children={formatPrice(currentPrice)}
          />
          <StyledText
            style={[styles.pricePeriod, { color: textColor }]}
            variant="bodySmall"
            children={`/${selectedBillingCycle === "monthly" ? "month" : "year"}`}
          />
        </View>

        {selectedBillingCycle === "yearly" && tier.yearlyBillingText && (
          <StyledText
            style={[styles.yearlyText, { color: successColor }]}
            variant="bodySmall"
            children={tier.yearlyBillingText}
          />
        )}
      </View>

      <View style={styles.billingCycleToggle}>
        <Pressable
          onPress={() => onBillingCycleChange("monthly")}
          style={[
            styles.toggleOption,
            {
              backgroundColor:
                selectedBillingCycle === "monthly"
                  ? primaryColor + "20"
                  : "transparent",
              borderColor:
                selectedBillingCycle === "monthly" ? primaryColor : borderColor,
            },
          ]}
        >
          <StyledText
            style={[
              styles.toggleText,
              {
                color:
                  selectedBillingCycle === "monthly" ? primaryColor : textColor,
                fontWeight: selectedBillingCycle === "monthly" ? "600" : "400",
              },
            ]}
            variant="bodyMedium"
            children="Monthly"
          />
        </Pressable>
        <Pressable
          onPress={() => onBillingCycleChange("yearly")}
          style={[
            styles.toggleOption,
            {
              backgroundColor:
                selectedBillingCycle === "yearly"
                  ? primaryColor + "20"
                  : "transparent",
              borderColor:
                selectedBillingCycle === "yearly" ? primaryColor : borderColor,
            },
          ]}
        >
          <StyledText
            style={[
              styles.toggleText,
              {
                color:
                  selectedBillingCycle === "yearly" ? primaryColor : textColor,
                fontWeight: selectedBillingCycle === "yearly" ? "600" : "400",
              },
            ]}
            variant="bodyMedium"
            children="Yearly"
          />
        </Pressable>
      </View>

      <View style={styles.featuresSection}>
        <StyledText
          style={[styles.featuresTitle, { color: textColor }]}
          variant="labelLarge"
          children="Features:"
        />
        {tier.features && tier.features.length > 0 ? (
          tier.features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={successColor}
                style={styles.featureIcon}
              />
              <StyledText
                style={[styles.featureText, { color: textColor }]}
                variant="bodySmall"
                children={feature}
              />
            </View>
          ))
        ) : (
          <StyledText
            style={[styles.noFeatures, { color: textColor }]}
            variant="bodySmall"
            children="No features listed"
          />
        )}
      </View>


      <Pressable
        onPress={onSelect}
        style={[
          styles.selectButton,
          {
            backgroundColor: isSelected ? primaryColor : "transparent",
            borderColor: isSelected ? primaryColor : borderColor,
          },
        ]}
      >
        <StyledText
          style={[
            styles.selectButtonText,
            {
              color: isSelected ? "white" : textColor,
            },
          ]}
          variant="labelLarge"
          children={
            isSelected
              ? canStartTrial
                ? "Start Trial"
                : "Selected"
              : "Select Plan"
          }
        />
      </Pressable>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 5,
    padding: 20,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  trialBadge: {
    position: "absolute",
    top: 2,
    left: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trialBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    marginTop: 8,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  tagLine: {
    fontSize: 14,
    opacity: 0.7,
  },
  selectedIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  pricingSection: {
    marginBottom: 16,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 4,
  },
  price: {
    fontSize: 36,
    fontWeight: "bold",
  },
  pricePeriod: {
    fontSize: 16,
    opacity: 0.7,
    marginLeft: 4,
  },
  yearlyText: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  billingCycleToggle: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  toggleText: {
    fontSize: 14,
  },
  featuresSection: {
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  featureIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  noFeatures: {
    fontSize: 12,
    opacity: 0.6,
    fontStyle: "italic",
  },
  selectButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

export default SubscriptionTierCard;
