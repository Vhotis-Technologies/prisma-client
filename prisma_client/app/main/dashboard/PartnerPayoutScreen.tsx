import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import StyledButton from "@/app/components/helpers/StyledButton";
import usePartner from "@/app/app-hooks/usePartner";
import { formatCurrency, formatDate } from "@/app/utils/methods";
import type { PartnerPayoutHistoryItem } from "@/app/store/api/partnerApi";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  cancelled: "Cancelled",
};

const PartnerPayoutScreen = () => {
  const {
    user,
    isPartner,
    userCountry,
    payout,
    payoutHistory,
    payoutForm,
    saveStripe,
    saveBank,
    requestPayment,
    isUpdating,
    isRequesting,
  } = usePartner();

  const {
    editingStripe,
    setEditingStripe,
    editingBank,
    setEditingBank,
    stripeValue,
    setStripeValue,
    accountHolder,
    setAccountHolder,
    iban,
    setIban,
    clearStripeForm,
    clearBankForm,
  } = payoutForm;

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");

  const { data: payoutData, isLoading, error, refetch, pendingCommission, hasStripe, hasBank } = payout;
  const { data: historyItems, isLoading: historyLoading, refetch: refetchHistory } = payoutHistory;

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([refetch(), refetchHistory()]).finally(() => setRefreshing(false));
  }, [refetch, refetchHistory]);

  const getStatusPillStyle = (status: string) => {
    switch (status) {
      case "paid":
        return { backgroundColor: primaryColor + "20", borderColor: primaryColor };
      case "processing":
        return { backgroundColor: primaryColor + "15", borderColor: primaryColor };
      case "pending":
        return { backgroundColor: textColor + "15", borderColor: borderColor };
      case "cancelled":
        return { backgroundColor: textColor + "10", borderColor: borderColor };
      default:
        return { backgroundColor: textColor + "10", borderColor: borderColor };
    }
  };

  const getStatusTextColor = (status: string) => {
    if (status === "paid") return primaryColor;
    return textColor;
  };

  const formatPayoutDate = (item: PartnerPayoutHistoryItem) => {
    if (item.status === "paid" && item.paid_at) {
      return `Paid ${formatDate(item.paid_at)}`;
    }
    return formatDate(item.requested_at);
  };

  if (!isPartner) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor }]}>
        <StyledText variant="bodyLarge" style={{ color: textColor }}>
          Not authorized. Partner access only.
        </StyledText>
        <Pressable style={[styles.backBtn, { borderColor }]} onPress={() => router.back()}>
          <StyledText variant="bodyMedium">Go back</StyledText>
        </Pressable>
      </View>
    );
  }

  if (isLoading && !payoutData) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 12 }}>
          Loading payout details...
        </StyledText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor }]}>
        <StyledText variant="bodyMedium" style={{ color: textColor }}>
          Error loading payout details
        </StyledText>
        <Pressable style={[styles.retryButton, { borderColor }]} onPress={() => refetch()}>
          <StyledText variant="bodyMedium">Retry</StyledText>
        </Pressable>
        <Pressable style={[styles.backBtn, { borderColor }]} onPress={() => router.back()}>
          <StyledText variant="bodyMedium">Go back</StyledText>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />
        }
      >

        {/* Balance / Request hero card */}
        <View style={[styles.heroCard, { backgroundColor: cardColor, borderColor }]}>
          <StyledText variant="labelLarge" style={[styles.heroLabel, { color: textColor }]}>
            Available balance
          </StyledText>
          <StyledText variant="headlineSmall" style={[styles.heroAmount, { color: primaryColor }]}>
            {formatCurrency(pendingCommission, userCountry)}
          </StyledText>
          <StyledText variant="bodySmall" style={[styles.heroSubtext, { color: textColor }]}>
            Request a payout to receive this amount. Processed within 24 hours.
          </StyledText>
          <StyledButton
            variant="medium"
            title="Request payout"
            onPress={requestPayment}
            isLoading={isRequesting}
            disabled={pendingCommission <= 0}
            style={styles.heroButton}
          />
        </View>

        {/* Payment history section */}
        <View style={styles.sectionHead}>
          <StyledText variant="titleSmall" style={{ color: textColor }}>
            Payment history
          </StyledText>
        </View>
        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          {historyLoading ? (
            <View style={styles.historyLoading}>
              <ActivityIndicator size="small" color={primaryColor} />
              <StyledText variant="bodySmall" style={{ color: textColor, marginTop: 8 }}>
                Loading history...
              </StyledText>
            </View>
          ) : !historyItems?.length ? (
            <View style={styles.emptyHistory}>
              <Ionicons name="wallet-outline" size={40} color={iconColor} />
              <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 12, textAlign: "center" }}>
                No payout requests yet
              </StyledText>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8, marginTop: 4, textAlign: "center" }}>
                When you request a payout, it will appear here.
              </StyledText>
            </View>
          ) : (
            <ScrollView
              style={styles.historyScrollView}
              contentContainerStyle={styles.historyScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled
            >
              {historyItems.map((item) => (
                <View key={item.id} style={[styles.historyRow, historyItems.indexOf(item) < historyItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                <View style={styles.historyRowLeft}>
                  <StyledText variant="bodyMedium" style={{ color: textColor }}>
                    {formatPayoutDate(item)}
                  </StyledText>
                  <View style={[styles.statusPill, getStatusPillStyle(item.status)]}>
                    <StyledText variant="labelSmall" style={{ color: getStatusTextColor(item.status) }}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </StyledText>
                  </View>
                </View>
                <StyledText variant="titleSmall" style={{ color: textColor }}>
                  {formatCurrency(item.amount_requested, userCountry)}
                </StyledText>
              </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Payout method (single card: Stripe + Bank) */}
        <View style={styles.sectionHead}>
          <StyledText variant="titleSmall" style={{ color: textColor }}>
            How you get paid
          </StyledText>
        </View>
        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          {/* Stripe */}
          <View style={styles.payoutMethodBlock}>
            <StyledText variant="labelLarge" style={[styles.blockTitle, { color: textColor }]}>
              Stripe Connect Account
            </StyledText>
            {hasStripe && !editingStripe ? (
              <>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {payoutData?.stripe_connect_account_id ?? ""}
                </StyledText>
                <TouchableOpacity onPress={() => setEditingStripe(true)} style={styles.changeLink}>
                  <Ionicons name="pencil" size={18} color={primaryColor} />
                  <StyledText variant="bodySmall" style={{ color: primaryColor, marginLeft: 6 }}>
                    Change
                  </StyledText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <StyledTextInput
                  label="Stripe Connect Account ID"
                  placeholder="acct_..."
                  value={stripeValue}
                  onChangeText={setStripeValue}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.rowButtons}>
                  <StyledButton
                    variant="tonal"
                    title={hasStripe ? "Update" : "Save"}
                    onPress={saveStripe}
                    isLoading={isUpdating}
                    style={{ flex: 1 }}
                  />
                  {editingStripe && hasStripe && (
                    <StyledButton variant="tonal" title="Cancel" onPress={clearStripeForm} style={{ flex: 1 }} />
                  )}
                </View>
              </>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: borderColor }]} />

          {/* Bank account */}
          <View style={styles.payoutMethodBlock}>
            <StyledText variant="labelLarge" style={[styles.blockTitle, { color: textColor }]}>
              Bank account
            </StyledText>
            {hasBank && !editingBank ? (
              <>
                <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                  Account holder
                </StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor, marginBottom: 8 }}>
                  {payoutData?.bank_account?.account_holder_name ?? ""}
                </StyledText>
                <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                  IBAN
                </StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor, marginBottom: 8 }}>
                  {payoutData?.bank_account?.iban_masked ?? "****"}
                </StyledText>
                <TouchableOpacity onPress={() => setEditingBank(true)} style={styles.changeLink}>
                  <Ionicons name="pencil" size={18} color={primaryColor} />
                  <StyledText variant="bodySmall" style={{ color: primaryColor, marginLeft: 6 }}>
                    Change
                  </StyledText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <StyledTextInput
                  label="Account holder name"
                  placeholder="Name on account"
                  value={accountHolder}
                  onChangeText={setAccountHolder}
                  autoCapitalize="words"
                />
                <StyledTextInput
                  label="IBAN"
                  placeholder="e.g. GB82WEST12345698765432"
                  value={iban}
                  onChangeText={setIban}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <View style={styles.rowButtons}>
                  <StyledButton
                    variant="tonal"
                    title={hasBank ? "Update" : "Save"}
                    onPress={saveBank}
                    isLoading={isUpdating}
                    style={{ flex: 1 }}
                  />
                  {editingBank && hasBank && (
                    <StyledButton variant="tonal" title="Cancel" onPress={clearBankForm} style={{ flex: 1 }} />
                  )}
                </View>
              </>
            )}
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default PartnerPayoutScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  heroCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  heroLabel: {
    marginBottom: 4,
  },
  heroAmount: {
    marginBottom: 8,
  },
  heroSubtext: {
    opacity: 0.85,
    marginBottom: 16,
  },
  heroButton: {
    alignSelf: "flex-start",
  },
  sectionHead: {
    marginBottom: 12,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  historyLoading: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyHistory: {
    paddingVertical: 24,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  historyScrollView: {
    maxHeight: 280,
  },
  historyScrollContent: {
    paddingBottom: 8,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  historyRowLeft: {
    flex: 1,
    gap: 8,
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  payoutMethodBlock: {
    paddingVertical: 4,
  },
  blockTitle: {
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  changeLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 8,
  },
  rowButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 8,
  },
  backBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 8,
  },
  bottomPadding: {
    height: 40,
  },
});
