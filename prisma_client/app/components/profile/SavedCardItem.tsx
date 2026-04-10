import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";
import { PaymentMethod } from "@/app/store/api/eventApi";

interface SavedCardItemProps {
  card: PaymentMethod;
  onDelete: (cardId: string) => void;
  isDeleting?: boolean;
}

const SavedCardItem: React.FC<SavedCardItemProps> = ({
  card,
  onDelete,
  isDeleting = false,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardBackground = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const iconColor = useThemeColor({}, "icons");

  // Get card brand icon
  const getCardIcon = (brand: string) => {
    switch (brand.toLowerCase()) {
      case "visa":
        return "card";
      case "mastercard":
        return "card";
      case "amex":
        return "card";
      case "discover":
        return "card";
      default:
        return "card";
    }
  };

  // Get card brand color
  const getCardColor = (brand: string) => {
    switch (brand.toLowerCase()) {
      case "visa":
        return "#1A1F71";
      case "mastercard":
        return "#EB001B";
      case "amex":
        return "#006FCF";
      case "discover":
        return "#FF6000";
      default:
        return "#6B7280";
    }
  };

  const cardColor = getCardColor(card.card.brand);
  const cardIcon = getCardIcon(card.card.brand);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: cardBackground, borderColor },
      ]}
    >
      <View style={styles.cardInfo}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconContainer}>
            <Ionicons name={cardIcon as any} size={24} color={cardColor} />
          </View>
          <View style={styles.cardDetails}>
            <StyledText
              variant="titleMedium"
              style={[styles.cardBrand, { color: textColor }]}
            >
              {card.card.brand.toUpperCase()}
            </StyledText>
            <StyledText variant="bodyMedium" style={{ color: textColor }}>
              •••• •••• •••• {card.card.last4}
            </StyledText>
            <StyledText
              variant="bodySmall"
              style={{ color: textColor, opacity: 0.7 }}
            >
              Expires {card.card.exp_month.toString().padStart(2, "0")}/
              {card.card.exp_year}
            </StyledText>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <StyledButton
          title="Delete"
          onPress={() => onDelete(card.id)}
          variant="small"
          style={[styles.deleteButton, { backgroundColor: "#FF4444" }]}
          disabled={isDeleting}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    marginVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardInfo: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardDetails: {
    flex: 1,
  },
  cardBrand: {
    fontWeight: "600",
    marginBottom: 2,
  },
  actions: {
    marginLeft: 12,
  },
  deleteButton: {
    minWidth: 80,
  },
});

export default SavedCardItem;
