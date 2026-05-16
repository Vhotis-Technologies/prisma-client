import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import type {
  LoyaltyProgressSnapshot,
  LoyaltyTier,
} from "@/app/interfaces/DashboardInterfaces";

interface LoyaltyCardProps {
  loyalty?: LoyaltyProgressSnapshot;
}

const TIER_LABEL: Record<LoyaltyTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

const TIER_ACCENT: Record<LoyaltyTier, string> = {
  bronze: "#B97A4F",
  silver: "#9AA0A6",
  gold: "#C9A227",
  platinum: "#7D3CFF",
};

const LoyaltyCard: React.FC<LoyaltyCardProps> = ({ loyalty }) => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const iconColor = useThemeColor({}, "icons");
  const trackColor = useThemeColor(
    { light: "#E0E0E0", dark: "#2A2A2A" },
    "background",
  );

  if (!loyalty || !loyalty.is_b2c || !loyalty.current_tier) {
    return null;
  }

  const tier = loyalty.current_tier;
  const accent = TIER_ACCENT[tier];
  const isTopTier = loyalty.next_tier === null;

  const completed = loyalty.completed_bookings;
  const lowerBound = loyalty.current_threshold;
  const upperBound = loyalty.next_threshold ?? lowerBound;
  const span = Math.max(1, upperBound - lowerBound);
  const within = Math.max(0, Math.min(span, completed - lowerBound));
  const pct = isTopTier ? 1 : within / span;

  const benefits = loyalty.benefits ?? { discount: 0, free_service: [] };
  const discount = benefits.discount || 0;
  const services = Array.isArray(benefits.free_service) ? benefits.free_service : [];

  return (
    <View style={[styles.container, { backgroundColor: cardColor, borderColor }]}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Ionicons name="trophy" size={22} color={accent} />
          <StyledText style={[styles.title, { color: textColor }]}>
            Loyalty programme
          </StyledText>
        </View>
        <View style={[styles.tierPill, { borderColor: accent, backgroundColor: `${accent}1F` }]}>
          <StyledText style={[styles.tierPillText, { color: accent }]}>
            {TIER_LABEL[tier]}
          </StyledText>
        </View>
      </View>

      <StyledText style={[styles.subtitle, { color: textColor }]}>
        {isTopTier
          ? "You're at the top tier — enjoy every perk."
          : `Complete ${loyalty.washes_to_next} more wash${loyalty.washes_to_next === 1 ? "" : "es"} to reach ${TIER_LABEL[loyalty.next_tier as LoyaltyTier]}.`}
      </StyledText>

      <View style={[styles.progressBlock, { backgroundColor, borderColor }]}>
        <View style={styles.progressLabels}>
          <StyledText style={[styles.progressMuted, { color: textColor }]}>
            {completed} completed
          </StyledText>
          <StyledText style={[styles.progressMuted, { color: textColor }]}>
            {isTopTier ? "Top tier" : `${upperBound} for ${TIER_LABEL[loyalty.next_tier as LoyaltyTier]}`}
          </StyledText>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: accent, width: `${Math.round(pct * 100)}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.benefitsContainer}>
        <StyledText style={[styles.benefitsTitle, { color: textColor }]}>
          Your benefits
        </StyledText>
        <View style={styles.benefitItem}>
          <Ionicons name="pricetag" size={16} color={iconColor} />
          <StyledText style={[styles.benefitText, { color: textColor }]}>
            {discount > 0 ? `${discount}% off paid bookings` : "No service discount at this tier"}
          </StyledText>
        </View>
        {services.length === 0 ? (
          <View style={styles.benefitItem}>
            <Ionicons name="ellipse-outline" size={16} color={iconColor} />
            <StyledText style={[styles.benefitText, { color: textColor }]}>
              Complete more washes to unlock complimentary perks
            </StyledText>
          </View>
        ) : (
          services.map((label) => (
            <View key={label} style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={16} color={accent} />
              <StyledText style={[styles.benefitText, { color: textColor }]}>
                {label}
              </StyledText>
            </View>
          ))
        )}
      </View>
    </View>
  );
};

export default LoyaltyCard;

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  tierPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tierPillText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.8,
  },
  progressBlock: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressMuted: {
    fontSize: 12,
    opacity: 0.7,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  benefitsContainer: {
    gap: 8,
  },
  benefitsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  benefitText: {
    fontSize: 13,
    opacity: 0.85,
    flex: 1,
  },
});
