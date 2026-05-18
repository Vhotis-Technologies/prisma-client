import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";

const BulkInvoicesQuickAction = () => {
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");

  return (
    <View style={styles.section}>
      <StyledText
        variant="labelMedium"
        style={[styles.sectionTitle, { color: textColor }]}
      >
        Quick Actions
      </StyledText>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: cardColor, borderColor }]}
        onPress={() => router.push("/main/settings/InvoicesScreen" as const)}
        activeOpacity={0.7}
      >
        <Ionicons name="document-text" size={24} color={primaryColor} />
        <View style={styles.buttonText}>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            Invoices
          </StyledText>
          <StyledText
            variant="bodySmall"
            style={{ color: textColor, opacity: 0.75 }}
          >
            View unpaid bulk invoices and pay with Stripe
          </StyledText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={primaryColor} />
      </TouchableOpacity>
    </View>
  );
};

export default BulkInvoicesQuickAction;

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonText: {
    flex: 1,
    gap: 2,
  },
});
