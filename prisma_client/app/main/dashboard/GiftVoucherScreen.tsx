import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import StyledText from "@/app/components/helpers/StyledText";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import StyledButton from "@/app/components/helpers/StyledButton";
import usePayment from "@/app/app-hooks/usePayment";
import { useSnackbar } from "@/app/contexts/SnackbarContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";

export default function GiftVoucherScreen() {
  const backgroundColor = useThemeColor({}, "background");
  const borderColor = useThemeColor({}, "borders");
  const cardColor = useThemeColor({}, "cards");
  const primaryColor = useThemeColor({}, "primary");
  const textMuted = useThemeColor(
    { light: "#757575", dark: "#9E9E9E" },
    "text",
  );

  const { openGiftVoucherPaymentSheet } = usePayment();
  const { showSnackbarWithConfig } = useSnackbar();

  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [validityDays, setValidityDays] = useState(45);
  const [busy, setBusy] = useState(false);

  const bumpDays = useCallback((delta: number) => {
    setValidityDays((d) => Math.min(60, Math.max(30, d + delta)));
  }, []);

  const onPay = useCallback(async () => {
    const parsed = parseFloat(amount.replace(",", "."));
    if (!email.trim() || !email.includes("@")) {
      showSnackbarWithConfig({
        message: "Enter a valid recipient email.",
        type: "error",
        duration: 3000,
      });
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      showSnackbarWithConfig({
        message: "Enter a valid credit amount.",
        type: "error",
        duration: 3000,
      });
      return;
    }
    setBusy(true);
    try {
      const result = await openGiftVoucherPaymentSheet(
        email.trim(),
        parsed,
        validityDays,
      );
      if (result.success) {
        showSnackbarWithConfig({
          message:
            "Payment successful. The recipient will receive an email shortly with their code.",
          type: "success",
          duration: 5000,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [
    email,
    amount,
    validityDays,
    openGiftVoucherPaymentSheet,
    showSnackbarWithConfig,
  ]);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { borderColor, backgroundColor: cardColor }]}>
        <StyledText variant="titleMedium" style={styles.headline}>
          Buy a voucher
        </StyledText>
        <StyledText variant="bodySmall" color={textMuted}>
          Purchase credit for someone else. You are charged immediately; Payment
          must confirmed before we email their code(usually within
          moments).
        </StyledText>

        <StyledTextInput
          label="Recipient email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="name@example.com"
        />

        <StyledTextInput
          label="Credit amount"
          info="Recipient can use up to this amount on an eligible booking (same currency as your card charge)."
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="e.g. 50"
        />

        <StyledText variant="labelMedium" style={styles.daysLabel}>
          Use window ({validityDays} days · 30–60)
        </StyledText>
        <View style={styles.stepRow}>
          <Pressable
            onPress={() => bumpDays(-1)}
            disabled={busy || validityDays <= 30}
            style={[styles.stepBtn, { borderColor }]}
          >
            <Ionicons name="remove" size={20} color={primaryColor} />
          </Pressable>
          <StyledText variant="titleMedium" style={styles.dayValue}>
            {validityDays}
          </StyledText>
          <Pressable
            onPress={() => bumpDays(1)}
            disabled={busy || validityDays >= 60}
            style={[styles.stepBtn, { borderColor }]}
          >
            <Ionicons name="add" size={20} color={primaryColor} />
          </Pressable>
        </View>

        {busy ? (
          <ActivityIndicator size="large" color={primaryColor} />
        ) : (
          <StyledButton title="Continue to payment" onPress={() => void onPay()} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 48,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  headline: {
    marginBottom: 4,
  },
  daysLabel: {
    marginTop: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  stepBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  dayValue: {
    minWidth: 40,
    textAlign: "center",
  },
});
