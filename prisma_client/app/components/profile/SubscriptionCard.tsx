import React from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../helpers/StyledText";
import { useGetCurrentSubscriptionQuery } from "@/app/store/api/subscriptionApi";
import { useThemeColor } from "@/hooks/useThemeColor";

interface SubscriptionCardProps {
  onManageSubscription?: () => void;
}

const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  onManageSubscription,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const successColor = useThemeColor({}, "success");
  const errorColor = useThemeColor({}, "error");
  const warningColor = useThemeColor({}, "warning");

  const {
    data: response,
    isLoading,
    error,
  } = useGetCurrentSubscriptionQuery();

  const subscription = response?.subscription ?? null;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string | undefined, hasCurrentPlan?: boolean) => {
    switch (status) {
      case "active":
        return successColor;
      case "trialing":
        return successColor; // trial is active
      case "pending":
        return warningColor;
      case "past_due":
        return warningColor;
      case "expired":
      case "canceled":
      case "cancelled":
        return errorColor;
      default:
        return hasCurrentPlan ? successColor : textColor;
    }
  };

  const getStatusText = (status: string | undefined, hasCurrentPlan?: boolean) => {
    switch (status) {
      case "active":
        return "Active";
      case "trialing":
        return "Trialing";
      case "pending":
        return "Pending Payment";
      case "past_due":
        return "Past Due";
      case "expired":
        return "Expired";
      case "canceled":
      case "cancelled":
        return "Cancelled";
      default:
        // If we have a plan name but no/unknown status, treat as active
        return hasCurrentPlan ? "Active" : "No Subscription";
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: backgroundColor,
          borderColor: borderColor,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name="card-outline"
            size={24}
            color={useThemeColor({}, "tint")}
          />
          <View style={styles.headerText}>
            <StyledText
              style={[styles.title, { color: textColor }]}
              children="Subscription Plan"
            />
            <StyledText
              style={[styles.subtitle, { color: textColor }]}
              variant="bodySmall"
              children="Manage your fleet subscription"
            />
          </View>
        </View>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={textColor} />
            <StyledText
              style={[styles.loadingText, { color: textColor }]}
              children="Loading subscription..."
            />
          </View>
        ) : error ? (
          <StyledText
            style={[styles.errorText, { color: errorColor }]}
            variant="bodySmall"
            children="Error loading subscription data"
          />
        ) : subscription ? (
          <>
            <View style={styles.planInfo}>
              <StyledText
                style={[styles.planLabel, { color: textColor }]}
                children="Current Plan:"
              />
              <StyledText
                style={[styles.planValue, { color: textColor }]}
                children={subscription.currentPlan || "N/A"}
              />
            </View>

            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(subscription.status, !!subscription.currentPlan) + "20" },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: getStatusColor(subscription.status, !!subscription.currentPlan) },
                  ]}
                />
                <StyledText
                  style={[
                    styles.statusText,
                    { color: getStatusColor(subscription.status, !!subscription.currentPlan) },
                  ]}
                  children={getStatusText(subscription.status, !!subscription.currentPlan)}
                />
              </View>
            </View>

            {subscription.status === "active" && subscription.renewsOn && (
              <View style={styles.renewalInfo}>
                <StyledText
                  style={[styles.renewalLabel, { color: textColor }]}
                  variant="bodySmall"
                  children={`Renews on: ${formatDate(subscription.renewsOn)}`}
                />
                <StyledText
                  style={[styles.billingCycle, { color: textColor }]}
                  variant="bodySmall"
                  children={`Billing: ${subscription.billingCycle}`}
                />
              </View>
            )}

            {subscription.status === "pending" && (
              <StyledText
                style={[styles.description, { color: warningColor }]}
                variant="bodySmall"
                children="Please complete payment to activate your subscription."
              />
            )}
          </>
        ) : (
          <>
            <View style={styles.planInfo}>
              <StyledText
                style={[styles.planLabel, { color: textColor }]}
                children="Current Plan:"
              />
              <StyledText
                style={[styles.planValue, { color: textColor }]}
                children="No Active Subscription"
              />
            </View>

            <StyledText
              style={[styles.description, { color: textColor }]}
              variant="bodySmall"
              children="Subscribe to unlock detailed vehicle history, before/after images, and detailed reports for your fleet."
            />
          </>
        )}
      </View>

      {onManageSubscription && (
        <Pressable
          style={[styles.button, { borderColor: borderColor }]}
          onPress={onManageSubscription}
        >
          <StyledText
            style={[styles.buttonText, { color: textColor }]}
            children="Manage Subscription"
          />
          <Ionicons name="chevron-forward" size={16} color={textColor} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 10,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.7,
  },
  content: {
    marginBottom: 12,
  },
  planInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  planLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  planValue: {
    fontSize: 14,
    fontStyle: "italic",
  },
  description: {
    fontSize: 12,
    opacity: 0.8,
    lineHeight: 18,
    marginTop: 8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 12,
    opacity: 0.7,
  },
  errorText: {
    fontSize: 12,
    paddingVertical: 8,
  },
  statusContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  renewalInfo: {
    marginTop: 8,
    gap: 4,
  },
  renewalLabel: {
    fontSize: 12,
    opacity: 0.8,
  },
  billingCycle: {
    fontSize: 11,
    opacity: 0.6,
    textTransform: "capitalize",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
  },
});

export default SubscriptionCard;
