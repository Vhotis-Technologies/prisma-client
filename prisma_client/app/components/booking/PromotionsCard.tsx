import { StyleSheet, View, Pressable } from "react-native";
import React from "react";
import { PromotionsProps } from "../../interfaces/GarageInterface";
import StyledText from "../helpers/StyledText";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { formatDate } from "@/app/utils/methods";
import { useThemeColor } from "@/hooks/useThemeColor";

const PromotionsCard = (promotion: PromotionsProps) => {
  const borderColor = useThemeColor({}, "borders");
  const cardColor = useThemeColor({}, "cards");
  const backgroundColor = useThemeColor({}, "background");
  if (!promotion) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyCard}>
          <Ionicons name="gift-outline" size={48} color="#6c757d" />
          <StyledText variant="labelLarge" style={styles.emptyTitle}>
            No Promotion Available
          </StyledText>
          <StyledText variant="bodyMedium" style={styles.emptyText}>
            Check back later for exciting offers and discounts!
          </StyledText>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={styles.container}>
      <View style={[styles.promotionCard, { backgroundColor:'black' }]}>
        <View style={styles.topRow}>
          <View style={styles.discountBadge}>
            <StyledText variant="labelMedium" style={styles.discountText}>
              {promotion.discount_percentage}% OFF
            </StyledText>
          </View>

          <StyledText variant="titleMedium" style={styles.promotionTitle}>
            {promotion.title}
          </StyledText>

          {promotion.is_active && (
            <View style={styles.activeBadge}>
              <Ionicons name="checkmark-circle" size={14} color="white" />
              <StyledText variant="bodySmall" style={styles.activeText}>
                Active
              </StyledText>
            </View>
          )}
        </View>

        {/* Bottom Row: Expiration Date */}
        <View style={styles.bottomRow}>
          <StyledText variant="bodySmall" style={styles.validityText}>
            Expires: {formatDate(promotion.valid_until)}
          </StyledText>
        </View>
      </View>
    </Pressable>
  );
};

export default PromotionsCard;

const styles = StyleSheet.create({
  container: {
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  promotionCard: {
    width: "100%",
    borderRadius: 5,
  },
  cardGradient: {
    borderRadius: 5,
    padding: 5,
    height: 60,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  discountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  discountText: {
    color: "white",
    fontWeight: "700",
    fontSize: 12,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(40, 167, 69, 0.8)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  activeText: {
    color: "white",
    fontSize: 9,
    fontWeight: "600",
  },
  clickToApplyText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontWeight: "500",
  },
  promotionContent: {
    flex: 1,
  },
  promotionTitle: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  validityContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  validityText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    textAlign: "center",
  },
  termsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  termsText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
  },
  emptyContainer: {
    margin: 16,
  },
  emptyCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  emptyTitle: {
    color: "#6c757d",
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: "#6c757d",
    textAlign: "center",
    lineHeight: 20,
  },
});
