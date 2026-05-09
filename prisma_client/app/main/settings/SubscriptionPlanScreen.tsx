import React from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import SubscriptionBillingHistorySection from "@/app/components/profile/SubscriptionBillingHistorySection";
import SubscriptionTierCard from "@/app/components/profile/SubscriptionTierCard";
import CancelSubscriptionModal from "@/app/components/profile/CancelSubscriptionModal";
import ModalServices from "@/app/utils/ModalServices";
import { useFleetSubscription } from "@/app/hooks/useFleetSubscription";
import { useB2cSubscriptions } from "@/app/hooks/useB2cSubscriptions";
import { useAppSelector, RootState } from "@/app/store/main_store";
import { SubscriptionTierProps } from "@/app/interfaces/SubscriptionInterfaces";

const SubscriptionPlanScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const errorColor = useThemeColor({}, "error");
  const mutedColor = useThemeColor({}, "icons");

  const isFleetOwner = useAppSelector(
    (state: RootState) => state.auth.user?.is_fleet_owner === true,
  );

  const fleetHook = useFleetSubscription();
  const b2cHook = useB2cSubscriptions();

  const {
    plans,
    currentSubscription,
    isLoadingPlans,
    isLoadingSubscription,
    plansError,
    selectedTierId,
    selectedBillingCycle,
    isProcessingPayment,
    isCreatingSubscription,
    isCanceling,
    isUpdatingPayment,
    showCancelModal,
    setShowCancelModal,
    handleTierSelect,
    handleBillingCycleChange,
    handleSubscribe,
    handleCancelSubscription,
    handleUpdatePaymentMethod,
  } = isFleetOwner ? fleetHook : b2cHook;

  const selectedTier = plans?.find(
    (tier: SubscriptionTierProps) => tier.id === selectedTierId,
  );

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Trial Status Banner */}
        {currentSubscription && currentSubscription.isTrialing && (
          <View
            style={[
              styles.trialStatusBanner,
              { backgroundColor: primaryColor + "20", borderColor: primaryColor },
            ]}
          >
            <Ionicons name="time-outline" size={20} color={primaryColor} />
            <View style={styles.trialStatusContent}>
              <StyledText
                style={[styles.trialStatusTitle, { color: primaryColor }]}
                variant="bodyMedium"
                children={`Trial Period: ${currentSubscription.trialDaysRemaining || 0} days remaining`}
              />
              {currentSubscription.trialEndDate && (
                <StyledText
                  style={[styles.trialStatusSubtext, { color: textColor }]}
                  variant="bodySmall"
                  children={`Trial ends: ${new Date(currentSubscription.trialEndDate).toLocaleDateString()}`}
                />
              )}
            </View>
          </View>
        )}

        {/* Payment Failure Warning Banner */}
        {currentSubscription &&
          currentSubscription.paymentFailureStatus?.hasFailure && (
            <View
              style={[
                styles.paymentFailureBanner,
                { backgroundColor: errorColor + "20", borderColor: errorColor },
              ]}
            >
              <Ionicons name="alert-circle" size={20} color={errorColor} />
              <View style={styles.paymentFailureContent}>
                <StyledText
                  style={[styles.paymentFailureTitle, { color: errorColor }]}
                  variant="bodyMedium"
                  children="Payment Failed"
                />
                <StyledText
                  style={[styles.paymentFailureSubtext, { color: textColor }]}
                  variant="bodySmall"
                  children={
                    currentSubscription.paymentFailureStatus.gracePeriodUntil
                      ? `Please update your payment method before ${new Date(currentSubscription.paymentFailureStatus.gracePeriodUntil).toLocaleDateString()} to avoid service interruption.`
                      : "Please update your payment method to continue service."
                  }
                />
              </View>
            </View>
          )}

        {/* Active Subscription Banner */}
        {currentSubscription &&
          currentSubscription.status === "active" &&
          !currentSubscription.isTrialing && (
            <View
              style={[
                styles.currentSubscriptionBanner,
                { backgroundColor: primaryColor + "20", borderColor: primaryColor },
              ]}
            >
              <Ionicons name="information-circle" size={20} color={primaryColor} />
              <StyledText
                style={[styles.currentSubscriptionText, { color: primaryColor }]}
                variant="bodyMedium"
                children={`You currently have an active ${currentSubscription.currentPlan} subscription. Selecting a new plan will replace your current subscription.`}
              />
            </View>
          )}

        {/* Subscription Management Section */}
        {currentSubscription &&
          (currentSubscription.status === "active" ||
            currentSubscription.status === "pending" ||
            currentSubscription.isTrialing ||
            currentSubscription.status === "past_due") && (
            <View
              style={[styles.managementSection, { borderColor: borderColor }]}
            >
              <StyledText
                style={[styles.managementTitle, { color: textColor }]}
                variant="titleMedium"
                children="Manage Subscription"
              />

              <View style={styles.managementDetails}>
                <View style={styles.managementRow}>
                  <StyledText
                    style={[styles.managementLabel, { color: textColor }]}
                    variant="bodyMedium"
                    children="Current Plan:"
                  />
                  <StyledText
                    style={[styles.managementValue, { color: textColor }]}
                    variant="bodyMedium"
                    children={currentSubscription.currentPlan || "N/A"}
                  />
                </View>

                <View style={styles.managementRow}>
                  <StyledText
                    style={[styles.managementLabel, { color: textColor }]}
                    variant="bodyMedium"
                    children="Status:"
                  />
                  <StyledText
                    style={[
                      styles.managementValue,
                      {
                        color: currentSubscription.isTrialing
                          ? primaryColor
                          : currentSubscription.status === "past_due"
                            ? errorColor
                          : currentSubscription.status === "pending"
                            ? primaryColor
                            : textColor,
                      },
                    ]}
                    variant="bodyMedium"
                    children={(() => {
                      const status = currentSubscription.status;
                      if (currentSubscription.isTrialing) return "Trial";
                      if (status === "pending") return "Pending payment";
                      if (status === "past_due") return "Payment Failed";
                      return status != null
                        ? status.charAt(0).toUpperCase() + status.slice(1)
                        : "N/A";
                    })()}
                  />
                </View>

                {((currentSubscription.isTrialing &&
                  currentSubscription.trialEndDate) ||
                  currentSubscription.renewsOn) && (
                  <View style={styles.managementRow}>
                    <StyledText
                      style={[styles.managementLabel, { color: textColor }]}
                      variant="bodyMedium"
                      children={
                        currentSubscription.isTrialing
                          ? "Trial Ends:"
                          : "Renews On:"
                      }
                    />
                    <StyledText
                      style={[styles.managementValue, { color: textColor }]}
                      variant="bodyMedium"
                      children={
                        currentSubscription.isTrialing &&
                        currentSubscription.trialEndDate
                          ? new Date(
                              currentSubscription.trialEndDate,
                            ).toLocaleDateString()
                          : currentSubscription.renewsOn
                            ? new Date(
                                currentSubscription.renewsOn,
                              ).toLocaleDateString()
                            : "N/A"
                      }
                    />
                  </View>
                )}

                <View style={styles.managementRow}>
                  <StyledText
                    style={[styles.managementLabel, { color: textColor }]}
                    variant="bodyMedium"
                    children="Billing Cycle:"
                  />
                  <StyledText
                    style={[styles.managementValue, { color: textColor }]}
                    variant="bodyMedium"
                    children={
                      currentSubscription.billingCycle
                        ? currentSubscription.billingCycle
                            .charAt(0)
                            .toUpperCase() +
                          currentSubscription.billingCycle.slice(1)
                        : "N/A"
                    }
                  />
                </View>
              </View>

              <View style={styles.managementActions}>
                <StyledButton
                  title="Update Payment"
                  onPress={handleUpdatePaymentMethod}
                  disabled={isUpdatingPayment}
                  isLoading={isUpdatingPayment}
                  variant="tonal"
                  icon={
                    <Ionicons name="card-outline" size={18} color={primaryColor} />
                  }
                />
                <StyledButton
                  title="Cancel"
                  onPress={() => setShowCancelModal(true)}
                  disabled={isCanceling}
                  variant="tonal"
                  icon={
                    <Ionicons
                      name="close-circle-outline"
                      size={18}
                      color={errorColor}
                    />
                  }
                />
              </View>
            </View>
          )}

        <SubscriptionBillingHistorySection
          isFleetOwner={isFleetOwner}
          borderColor={borderColor}
          textColor={textColor}
          primaryColor={primaryColor}
          errorColor={errorColor}
          mutedColor={mutedColor}
        />

        {isLoadingPlans ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primaryColor} />
            <StyledText
              style={[styles.loadingText, { color: textColor }]}
              variant="bodyMedium"
              children="Loading subscription plans..."
            />
          </View>
        ) : plansError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color={errorColor} />
            <StyledText
              style={[styles.errorText, { color: errorColor }]}
              variant="bodyLarge"
              children="Failed to load subscription plans"
            />
            <StyledText
              style={[styles.errorSubtext, { color: textColor }]}
              variant="bodySmall"
              children="Please try again later"
            />
          </View>
        ) : plans && plans.length > 0 ? (
          <View style={styles.plansContainer}>
            {plans.map((tier: SubscriptionTierProps) => {
              const canStartTrial = currentSubscription?.canStartTrial ?? true;
              const isEarlyAdopter =
                currentSubscription?.isEarlyAdopter ?? false;
              return (
                <SubscriptionTierCard
                  key={tier.id}
                  tier={tier}
                  isSelected={selectedTierId === tier.id}
                  onSelect={() => handleTierSelect(tier.id)}
                  selectedBillingCycle={
                    selectedTierId === tier.id
                      ? selectedBillingCycle
                      : "monthly"
                  }
                  onBillingCycleChange={(cycle) =>
                    handleBillingCycleChange(tier.id, cycle)
                  }
                  canStartTrial={canStartTrial && selectedTierId === tier.id}
                  isEarlyAdopter={isEarlyAdopter}
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="document-text-outline"
              size={48}
              color={textColor}
            />
            <StyledText
              style={[styles.emptyText, { color: textColor }]}
              variant="bodyLarge"
              children="No subscription plans available"
            />
          </View>
        )}
      </ScrollView>

      {selectedTierId && (
        <View style={[styles.footer, { borderTopColor: borderColor }]}>
          <Pressable
            onPress={handleSubscribe}
            disabled={isProcessingPayment || isCreatingSubscription}
            style={[
              styles.subscribeButton,
              {
                backgroundColor: primaryColor,
                opacity:
                  isProcessingPayment || isCreatingSubscription ? 0.6 : 1,
              },
            ]}
          >
            {isProcessingPayment || isCreatingSubscription ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <StyledText
                style={styles.subscribeButtonText}
                variant="labelLarge"
                children={
                  currentSubscription?.canStartTrial
                    ? "Start Trial"
                    : "Subscribe Now"
                }
              />
            )}
          </Pressable>
        </View>
      )}

      <ModalServices
        visible={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        modalType="center"
        title="Cancel Subscription"
        showCloseButton={true}
        component={
          <CancelSubscriptionModal
            onClose={() => setShowCancelModal(false)}
            onCancelAtPeriodEnd={
              currentSubscription?.isTrialing ||
              currentSubscription?.status === "pending"
                ? undefined
                : () => handleCancelSubscription(true)
            }
            onCancelNow={() => handleCancelSubscription(false)}
            isTrialing={currentSubscription?.isTrialing}
            isPendingCheckout={currentSubscription?.status === "pending"}
            isCanceling={isCanceling}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {},
  currentSubscriptionBanner: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  currentSubscriptionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  trialStatusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  trialStatusContent: {
    flex: 1,
  },
  trialStatusTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  trialStatusSubtext: {
    fontSize: 12,
    opacity: 0.7,
  },
  paymentFailureBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  paymentFailureContent: {
    flex: 1,
  },
  paymentFailureTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  paymentFailureSubtext: {
    fontSize: 12,
    opacity: 0.7,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "600",
  },
  errorSubtext: {
    fontSize: 14,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
  },
  summaryContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    gap: 12,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    paddingBottom: 60,
  },
  subscribeButton: {
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  subscribeButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  managementSection: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
  },
  managementTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  managementDetails: {
    gap: 12,
  },
  managementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  managementLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  managementValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  managementActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  managementButton: {
    flex: 1,
  },
  plansContainer: {
    padding: 5,
    gap: 5,
    paddingBottom: 70,
  },
});

export default SubscriptionPlanScreen;
