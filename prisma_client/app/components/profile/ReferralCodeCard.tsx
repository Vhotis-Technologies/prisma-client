import React, { useState } from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import * as Clipboard from "expo-clipboard";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

interface ReferralCodeCardProps {
  referral: string;
}

const ReferralCodeCard: React.FC<ReferralCodeCardProps> = ({ referral }) => {
  const { showSnackbarWithConfig } = useSnackbar();
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
        message: "Referral code copied to clipboard",
        type: "success",
        duration: 3000,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showSnackbarWithConfig({
        message: "Failed to copy referral code",
        type: "error",
        duration: 3000,
      });
    }
  };

  return (
    <View
      style={[styles.container]}
    >
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
    </View>
  );
};

export default ReferralCodeCard;

const styles = StyleSheet.create({
  container: {
    margin: 5,
    padding: 5,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 12,
  },
  codeContainer: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
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
});
