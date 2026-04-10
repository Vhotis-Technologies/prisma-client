import React, { useState } from "react";
import { StyleSheet, View, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import * as Clipboard from "expo-clipboard";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

interface ReferralSectionProps {
  referral: string;
}

const ReferralSection: React.FC<ReferralSectionProps> = ({ referral }) => {
  const { showSnackbar, showSnackbarWithConfig } = useSnackbar();

  const [copied, setCopied] = useState(false);

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const iconColor = useThemeColor({}, "icons");

  const copyReferralCode = async () => {
    try {
      const promotionalMessage = `Join Prisma Valet, the best mobile detailing tech integrated service and get 10% off your first wash! Use code: ${referral}`;
      await Clipboard.setStringAsync(promotionalMessage);
      setCopied(true);
      showSnackbarWithConfig({
        message: "Referral message copied to clipboard",
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      showSnackbarWithConfig({
        message: "Failed to copy referral message",
        type: "error",
        duration: 3000,
      });
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: cardColor, borderColor }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Ionicons name="gift" size={24} color={iconColor} />
          <StyledText style={[styles.title, { color: textColor }]}>
            Refer Friends & Earn
          </StyledText>
        </View>
        <StyledText style={[styles.subtitle, { color: textColor }]}>
          Get 10% off when friends spend €100+
        </StyledText>
      </View>

      {/* Referral Code Display */}
      <View style={[styles.codeContainer, { backgroundColor, borderColor }]}>
        <View style={styles.codeRow}>
          <View style={styles.codeInfo}>
            <StyledText style={[styles.codeLabel, { color: textColor }]}>
              Your Referral Code
            </StyledText>
            <StyledText style={[styles.codeText, { color: textColor }]}>
              {referral}
            </StyledText>
          </View>
          <TouchableOpacity
            style={[styles.copyButton, { backgroundColor }]}
            onPress={copyReferralCode}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy"}
              size={20}
              color={iconColor}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor }]}
          onPress={copyReferralCode}
        >
          <Ionicons name="copy" size={18} color={iconColor} />
          <StyledText style={styles.actionButtonText}>Copy Code</StyledText>
        </TouchableOpacity>
      </View>

      {/* Benefits */}
      <View style={styles.benefitsContainer}>
        <View style={styles.benefitItem}>
          <Ionicons name="checkmark-circle" size={16} color={iconColor} />
          <StyledText style={[styles.benefitText, { color: textColor }]}>
            You get 10% off when friends spend €100+
          </StyledText>
        </View>
        <View style={styles.benefitItem}>
          <Ionicons name="checkmark-circle" size={16} color={iconColor} />
          <StyledText style={[styles.benefitText, { color: textColor }]}>
            Friends get 10% off their first service
          </StyledText>
        </View>
      </View>
    </View>
  );
};

export default ReferralSection;

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
  },
  header: {
    marginBottom: 20,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 8,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  codeContainer: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  codeInfo: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 4,
  },
  codeText: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  copyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  shareButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  actionButtonText: {
    fontWeight: "600",
    fontSize: 14,
  },
  benefitsContainer: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  benefitText: {
    fontSize: 13,
    opacity: 0.8,
  },
});
