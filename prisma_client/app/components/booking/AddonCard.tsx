import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { AddOnsProps } from "@/app/interfaces/BookingInterfaces";
import StyledText from "@/app/components/helpers/StyledText";
import { formatDuration } from "@/app/utils/methods";

interface AddonCardProps {
  addon: AddOnsProps;
  isSelected: boolean;
  onSelect: (addon: AddOnsProps) => void;
  formatPrice: (price: number) => string;
}

const AddonCard: React.FC<AddonCardProps> = ({
  addon,
  isSelected,
  onSelect,
  formatPrice,
}) => {
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const primaryPurpleColor = useThemeColor({}, "primary");
  const buttonColor = useThemeColor({}, "button");

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isSelected ? primaryPurpleColor : cardColor,
          borderColor: isSelected ? primaryPurpleColor : "#E5E5E5",
        },
      ]}
      onPress={() => onSelect(addon)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <StyledText
            variant="titleMedium"
            style={[styles.title, { color: isSelected ? "white" : textColor }]}
          >
            {addon.name}
          </StyledText>
          <StyledText
            variant="titleLarge"
            style={[
              styles.price,
              { color: isSelected ? "white" : buttonColor },
            ]}
          >
            {formatPrice(addon.price)}
          </StyledText>
        </View>

        <View
          style={[
            styles.checkbox,
            {
              backgroundColor: isSelected ? "white" : "transparent",
              borderColor: isSelected ? "white" : "#E5E5E5",
            },
          ]}
        >
          {isSelected && (
            <Ionicons name="checkmark" size={16} color={primaryPurpleColor} />
          )}
        </View>
      </View>

      <View style={styles.durationContainer}>
        <Ionicons
          name="time-outline"
          size={16}
          color={isSelected ? "white" : textColor}
        />
        <StyledText
          variant="bodyMedium"
          style={[styles.duration, { color: isSelected ? "white" : textColor }]}
        >
          +{formatDuration(addon.extra_duration)}
        </StyledText>
      </View>

      <View style={styles.descriptionContainer}>
        <StyledText
          variant="bodyMedium"
          style={[
            styles.descriptionText,
            { color: isSelected ? "white" : textColor },
          ]}
        >
          {addon.description}
        </StyledText>
      </View>
    </TouchableOpacity>
  );
};

export default AddonCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: 15,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontWeight: "600",
    marginBottom: 4,
  },
  price: {
    fontWeight: "bold",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  duration: {
    marginLeft: 6,
    opacity: 0.8,
  },
  descriptionContainer: {
    gap: 5,
  },
  descriptionText: {
    opacity: 0.9,
    lineHeight: 18,
  },
});
