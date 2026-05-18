import { StyleSheet, View, Pressable, Platform } from "react-native";
import React, { useState } from "react";
import { PromotionsProps } from "../../interfaces/GarageInterface";
import StyledText from "../helpers/StyledText";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { formatDate } from "@/app/utils/methods";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Sits above booking nav buttons (back / next). */
const NAV_CLEARANCE = 76;

function StripePattern() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 14 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.stripe,
            {
              left: -40 + i * 34,
              top: -20 + (i % 5) * 18,
            },
          ]}
        />
      ))}
      <View style={styles.glowOrb} />
      <View style={[styles.glowOrb, styles.glowOrbSecondary]} />
    </View>
  );
}

const PromotionsCard = (promotion: PromotionsProps) => {
  const primary = useThemeColor({}, "primary");
  const gradientEnd = useThemeColor(
    { light: "#1e1040", dark: "#0a0614" },
    "background",
  );
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  if (!promotion?.is_active || dismissed) {
    return null;
  }

  const bottom = insets.bottom + NAV_CLEARANCE;

  if (!expanded) {
    return (
      <View
        style={[styles.overlay, { bottom }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [
            styles.collapsedChip,
            { opacity: pressed ? 0.9 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Show promotion details"
        >
          <LinearGradient
            colors={[primary, gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.collapsedGradient}
          >
            <Ionicons name="gift" size={16} color="#fff" />
            <StyledText variant="labelMedium" style={styles.collapsedText}>
              {promotion.discount_percentage}% off · {promotion.title}
            </StyledText>
            <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.85)" />
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.overlay, { bottom }]} pointerEvents="box-none">
      <View style={styles.cardShadow}>
        <LinearGradient
          colors={[primary, "#3d1f6e", gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <StripePattern />

          <View style={styles.cardInner}>
            <View style={styles.discountColumn}>
              <StyledText variant="displaySmall" style={styles.discountValue}>
                {promotion.discount_percentage}%
              </StyledText>
              <StyledText variant="labelSmall" style={styles.discountLabel}>
                OFF
              </StyledText>
            </View>

            <View style={styles.detailsColumn}>
              <View style={styles.titleRow}>
                <Ionicons
                  name="sparkles"
                  size={14}
                  color="rgba(255,255,255,0.9)"
                />
                <StyledText
                  variant="titleSmall"
                  style={styles.promotionTitle}
                  numberOfLines={2}
                >
                  {promotion.title}
                </StyledText>
              </View>
              <StyledText variant="bodySmall" style={styles.validityText}>
                Valid until {formatDate(promotion.valid_until)}
              </StyledText>
              <StyledText variant="bodySmall" style={styles.appliedHint}>
                Applied automatically at checkout
              </StyledText>
            </View>

            <View style={styles.actionsColumn}>
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <StyledText variant="labelSmall" style={styles.activeText}>
                  Active
                </StyledText>
              </View>
              <Pressable
                onPress={() => setExpanded(false)}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityLabel="Minimize promotion"
              >
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color="rgba(255,255,255,0.9)"
                />
              </Pressable>
              <Pressable
                onPress={() => setDismissed(true)}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityLabel="Dismiss promotion"
              >
                <Ionicons
                  name="close"
                  size={18}
                  color="rgba(255,255,255,0.75)"
                />
              </Pressable>
            </View>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
};

export default PromotionsCard;

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  cardShadow: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  stripe: {
    position: "absolute",
    width: 120,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.07)",
    transform: [{ rotate: "-32deg" }],
  },
  glowOrb: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: -30,
    right: -20,
  },
  glowOrbSecondary: {
    width: 60,
    height: 60,
    top: "auto",
    bottom: -20,
    left: 40,
    right: "auto",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  discountColumn: {
    alignItems: "center",
    minWidth: 56,
    paddingRight: 4,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.15)",
  },
  discountValue: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 28,
    lineHeight: 30,
  },
  discountLabel: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: -2,
  },
  detailsColumn: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  promotionTitle: {
    color: "#fff",
    fontWeight: "700",
    flex: 1,
    lineHeight: 18,
  },
  validityText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
  },
  appliedHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    marginTop: 2,
  },
  actionsColumn: {
    alignItems: "flex-end",
    gap: 6,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(46, 204, 113, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 113, 0.45)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2ecc71",
  },
  activeText: {
    color: "#e8fff0",
    fontWeight: "600",
    fontSize: 10,
  },
  iconBtn: {
    padding: 2,
  },
  collapsedChip: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 999,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  collapsedGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
  },
  collapsedText: {
    color: "#fff",
    fontWeight: "600",
    flex: 1,
  },
});
