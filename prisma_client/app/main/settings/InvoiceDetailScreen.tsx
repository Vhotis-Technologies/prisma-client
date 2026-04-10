import React, { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import { Ionicons } from "@expo/vector-icons";
import { useLazyGetBulkInvoiceCheckoutQuery } from "@/app/store/api/eventApi";
import { formatCurrency } from "@/app/utils/methods";

function formatPaymentStatus(raw: string): string {
  switch (raw) {
    case "invoice_later":
      return "Unpaid (invoice)";
    case "succeeded":
    case "paid":
      return "Paid";
    default:
      return raw;
  }
}

export default function InvoiceDetailScreen() {
  const { bulkOrderId: idParam } = useLocalSearchParams<{ bulkOrderId: string | string[] }>();
  const bulkOrderId = typeof idParam === "string" ? idParam : idParam?.[0] ?? "";

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primary = useThemeColor({}, "primary");
  const muted = useThemeColor({ light: "#757575", dark: "#9E9E9E" }, "text");
  const error = useThemeColor({}, "error");

  const [fetchCheckout, checkoutState] = useLazyGetBulkInvoiceCheckoutQuery();

  const load = useCallback(() => {
    if (bulkOrderId) void fetchCheckout(bulkOrderId);
  }, [bulkOrderId, fetchCheckout]);

  useEffect(() => {
    load();
  }, [load]);

  const errMsg = useMemo(() => {
    const e = checkoutState.error as { data?: { error?: string } } | undefined;
    return e?.data?.error;
  }, [checkoutState.error]);

  const d = checkoutState.data;
  const payable =
    d &&
    !d.already_paid &&
    d.payment_status === "invoice_later" &&
    Boolean(d.hosted_invoice_url);

  const openPay = () => {
    if (d?.hosted_invoice_url) {
      void Linking.openURL(d.hosted_invoice_url);
    }
  };

  if (!bulkOrderId) {
    return (
      <View style={[styles.center, { backgroundColor }]}>
        <StyledText style={{ color: textColor }}>Missing invoice.</StyledText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={checkoutState.isFetching}
            onRefresh={load}
            colors={[primary]}
          />
        }
      >
        {checkoutState.isLoading && !d ? (
          <ActivityIndicator color={primary} style={{ marginTop: 24 }} />
        ) : errMsg ? (
          <StyledText style={{ color: error, marginTop: 16 }}>{errMsg}</StyledText>
        ) : d ? (
          <>
            <View style={[styles.card, { borderColor }]}>
              <StyledText variant="labelSmall" style={{ color: muted }}>
                Reference
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor, fontFamily: "BarlowMedium" }}>
                {d.booking_reference}
              </StyledText>
              <StyledText variant="bodySmall" style={{ color: muted, marginTop: 8 }}>
                {d.number_of_vehicles} vehicles · {formatCurrency(d.total_amount)}
              </StyledText>
              <StyledText variant="labelLarge" style={{ color: primary, marginTop: 12 }}>
                {formatPaymentStatus(d.payment_status)}
              </StyledText>
              {d.invoice_status ? (
                <StyledText variant="bodySmall" style={{ color: muted, marginTop: 4 }}>
                  Stripe invoice: {d.invoice_status}
                  {d.amount_due_cents > 0
                    ? ` · Due ${formatCurrency(d.amount_due_cents / 100)}`
                    : null}
                </StyledText>
              ) : null}
            </View>

            {d.already_paid ? (
              <StyledText variant="bodyMedium" style={{ color: muted, marginTop: 16 }}>
                This invoice is paid. Payment is recorded on your account. Pull down to refresh if
                you just finished checkout in the browser.
              </StyledText>
            ) : d.payment_status === "cancelled" || d.payment_status === "failed" ? (
              <StyledText variant="bodyMedium" style={{ color: muted, marginTop: 16 }}>
                This order cannot be paid online.
              </StyledText>
            ) : payable ? (
              <StyledButton
                title="Pay with Stripe"
                onPress={openPay}
                variant="tonal"
                style={{ marginTop: 20 }}
              />
            ) : (
              <StyledText variant="bodyMedium" style={{ color: muted, marginTop: 16 }}>
                No hosted payment link is available yet. If you have not received the invoice by
                email, try again later.
              </StyledText>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 5,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scroll: {
    padding: 8,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 5,
    borderWidth: 0.5,
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
