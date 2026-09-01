import React from "react";
import { View, StyleSheet } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";

export interface CancelSubscriptionModalProps {
  onClose: () => void;
  onCancelAtPeriodEnd?: () => void;
  onCancelNow: () => void;
  isTrialing?: boolean;
  /** Unpaid B2C checkout: only immediate discard makes sense. */
  isPendingCheckout?: boolean;
  isCanceling?: boolean;
  /**
   * User is cancelling so they can switch Sedan ↔ SUV/MPV.
   * Period-end cancel is a poor fit for that path — prefer cancel now.
   */
  isVehicleClassUpgrade?: boolean;
}

const CancelSubscriptionModal: React.FC<CancelSubscriptionModalProps> = ({
  onClose,
  onCancelAtPeriodEnd,
  onCancelNow,
  isTrialing = false,
  isPendingCheckout = false,
  isCanceling = false,
  isVehicleClassUpgrade = false,
}) => {
  const textColor = useThemeColor({}, "text");

  const message = isPendingCheckout
    ? "Checkout is not finished, so nothing has been charged. You can discard it to choose another plan or use Update payment on this screen to try again."
    : isVehicleClassUpgrade
      ? "To switch vehicle class you must cancel your current plan first, then subscribe again with the new class. Cancel now so you can pick Sedan or SUV/MPV and pay the matching price."
    : isTrialing
      ? "Are you sure you want to cancel your trial? You'll lose access immediately."
      : "Are you sure you want to cancel your subscription? You can cancel now or at the end of your billing period.";

  const cancelImmediatelyTitle = isTrialing
    ? "Cancel Trial"
    : isPendingCheckout
      ? "Discard checkout"
      : "Cancel now";

  return (
    <View style={styles.container}>
      <StyledText
        style={[styles.message, { color: textColor }]}
        variant="bodyMedium"
      >
        {message}
      </StyledText>
      <View style={styles.actions}>
        <StyledButton
          title="Keep Subscription"
          onPress={onClose}
          variant="medium"
          style={styles.actionButton}
        />
        {!isTrialing && !isVehicleClassUpgrade && onCancelAtPeriodEnd && (
          <StyledButton
            title="Cancel at Period End"
            onPress={onCancelAtPeriodEnd}
            variant="medium"
            disabled={isCanceling}
            isLoading={isCanceling}
          />
        )}
        <StyledButton
          title={
            isVehicleClassUpgrade && !isTrialing && !isPendingCheckout
              ? "Cancel now & switch class"
              : cancelImmediatelyTitle
          }
          onPress={onCancelNow}
          variant="tonal"
          disabled={isCanceling}
          isLoading={isCanceling}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  message: {
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minWidth: 120,
  },
});

export default CancelSubscriptionModal;
