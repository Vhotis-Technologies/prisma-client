import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";

export interface CancelSubscriptionModalProps {
  onClose: () => void;
  onCancelAtPeriodEnd?: () => void;
  onCancelNow: () => void;
  isTrialing?: boolean;
  isCanceling?: boolean;
}

const CancelSubscriptionModal: React.FC<CancelSubscriptionModalProps> = ({
  onClose,
  onCancelAtPeriodEnd,
  onCancelNow,
  isTrialing = false,
  isCanceling = false,
}) => {
  const textColor = useThemeColor({}, "text");
  const errorColor = useThemeColor({}, "error");

  const message = isTrialing
    ? "Are you sure you want to cancel your trial? You'll lose access immediately."
    : "Are you sure you want to cancel your subscription? You can cancel now or at the end of your billing period.";

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
        {!isTrialing && onCancelAtPeriodEnd && (
          <StyledButton
            title="Cancel at Period End"
            onPress={onCancelAtPeriodEnd}
            variant="medium"
            disabled={isCanceling}
            isLoading={isCanceling}
          />
        )}
        <StyledButton
          title='Cancel Trial'
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
