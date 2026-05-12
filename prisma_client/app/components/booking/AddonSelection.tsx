import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { AddOnsProps } from "@/app/interfaces/BookingInterfaces";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import AddonCard from "./AddonCard";
import { formatDuration, formatCurrency } from "@/app/utils/methods";

interface AddonSelectionModalProps {
  onClose: () => void;
  onConfirm: () => void;
  addons: AddOnsProps[];
  selectedAddons: AddOnsProps[];
  onAddonSelect: (addon: AddOnsProps) => void;
  totalAddonPrice: number;
  totalAddonDuration: number;
  formatPrice: (price: number) => string;
}

const AddonSelection: React.FC<AddonSelectionModalProps> = ({
  onClose,
  onConfirm,
  addons,
  selectedAddons,
  onAddonSelect,
  totalAddonPrice,
  totalAddonDuration,
  formatPrice,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const primaryPurpleColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "borders");

  const isAddonSelected = (addon: AddOnsProps) => {
    return selectedAddons.some((selected) => selected.id === addon.id);
  };

  return (
    <View style={styles.overlay}>
      <View
        style={[
          styles.modalContainer,
          {
            borderColor: borderColor,
          },
        ]}
      >
        {/* Subtitle */}
        <StyledText
          variant="bodySmall"
          style={[styles.subtitle, { color: textColor }]}
        >
          Enhance your service with these additional options. if you select
          three addons, the cheapest addon will be free.
        </StyledText>

        {/* Add-ons List */}
        <View style={styles.addonsContainer}>
          {addons?.map((addon) => (
            <AddonCard
              key={addon.id}
              addon={addon}
              isSelected={isAddonSelected(addon)}
              onSelect={onAddonSelect}
              formatPrice={formatPrice}
            />
          ))}
        </View>

        {/* Summary */}
        <View
          style={[
            styles.summaryContainer,
            {
              backgroundColor: cardColor,
              borderColor: borderColor,
              opacity: selectedAddons.length > 0 || totalAddonPrice > 0 ? 1 : 0,
              height:
                selectedAddons.length > 0 || totalAddonPrice > 0 ? "auto" : 0,
            },
          ]}
        >
          <View style={styles.summaryRow}>
            <StyledText
              variant="bodyMedium"
              style={[styles.summaryLabel, { color: textColor }]}
            >
              Selected Add-ons:
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.summaryValue, { color: textColor }]}
            >
              {selectedAddons.length}
            </StyledText>
          </View>
          <View style={styles.summaryRow}>
            <StyledText
              variant="bodyMedium"
              style={[styles.summaryLabel, { color: textColor }]}
            >
              Additional Cost:
            </StyledText>
            <StyledText
              variant="titleMedium"
              style={[styles.summaryValue, { color: primaryPurpleColor }]}
            >
              {formatCurrency(totalAddonPrice)}
            </StyledText>
          </View>
          <View style={styles.summaryRow}>
            <StyledText
              variant="bodyMedium"
              style={[styles.summaryLabel, { color: textColor }]}
            >
              Extra Time:
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.summaryValue, { color: textColor }]}
            >
              +{formatDuration(totalAddonDuration)}
            </StyledText>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <StyledButton
            title="Skip Add-ons"
            variant="tonal"
            onPress={onClose}
          />
          <StyledButton
            title="Continue"
            variant="tonal"
            onPress={onConfirm}
            style={styles.continueButton}
          />
        </View>
      </View>
    </View>
  );
};

export default AddonSelection;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    padding:10
  },
  modalContainer: {
    height: "100%",
  },

  title: {
    fontWeight: "600",
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
  },
  subtitle: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    opacity: 0.8,
  },
  addonsContainer: {
    width: "100%",
  },
  summaryContainer: {
    marginHorizontal: 5,
    marginVertical: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  summaryLabel: {
    fontWeight: "500",
  },
  summaryValue: {
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    gap: 12,
  },
  skipButton: {
    flex: 1,
  },
  continueButton: {
    flex: 1,
  },
});
