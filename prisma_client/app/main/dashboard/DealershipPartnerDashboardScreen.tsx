import React, { useState } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import StatsSection from "@/app/components/dashboard/StatsSection";
import ForthcomingBookingsRow from "@/app/components/dashboard/ForthcomingBookingsRow";
import usePartner from "@/app/app-hooks/usePartner";
import { StatCard } from "@/app/interfaces/DashboardInterfaces";
import { formatCurrency } from "@/app/utils/methods";
import * as Clipboard from "expo-clipboard";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

const DealershipPartnerDashboardScreen = () => {
  const { showSnackbarWithConfig } = useSnackbar();
  const [copied, setCopied] = useState(false);

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const buttonColor = useThemeColor({}, "button");
  const iconColor = useThemeColor({}, "icons");

  const { user, userCountry, dashboard } = usePartner();
  const { data: dashboardData, isLoading, error, refetch, isFetching } = dashboard;
  const country = userCountry;

  const handleRefresh = () => {
    refetch();
  };

  const copyReferralCode = async () => {
    const code = dashboardData?.partner?.referral_code;
    if (!code) return;
    try {
      const promotionalMessage = `Get one free basic wash and 40% off washes for 60 days! Use my partner code: ${code}`;
      await Clipboard.setStringAsync(promotionalMessage);
      setCopied(true);
      showSnackbarWithConfig({
        message: "Referral code copied to clipboard",
        type: "success",
        duration: 3000,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showSnackbarWithConfig({
        message: "Failed to copy referral code",
        type: "error",
        duration: 3000,
      });
    }
  };

  if (isLoading && !dashboardData) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <StyledText
          children="Loading partner dashboard..."
          variant="bodyMedium"
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor }]}>
        <StyledText children="Error loading dashboard" variant="bodyMedium" />
        <Pressable
          style={[styles.retryButton, { backgroundColor: buttonColor }]}
          onPress={handleRefresh}
        >
          <StyledText children="Retry" variant="bodyMedium" />
        </Pressable>
      </View>
    );
  }

  const stats: StatCard[] = dashboardData
    ? [
        {
          icon: "people",
          value: dashboardData.referral_metrics.total_referred.toString(),
          label: "Total Referred",
          color: primaryColor,
        },
        {
          icon: "checkmark-circle",
          value: dashboardData.referral_metrics.active.toString(),
          label: "Active Users",
          color: primaryColor,
        },
        {
          icon: "car",
          value: dashboardData.referral_metrics.vehicles_registered.toString(),
          label: "Vehicles",
          color: primaryColor,
        },
      ]
    : [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <StyledText
          variant="titleLarge"
          style={[styles.headerTitle, { color: textColor }]}
        >
          Partner Dashboard
        </StyledText>
        {dashboardData && (
          <>
            <StyledText
              variant="bodyMedium"
              style={[styles.businessName, { color: textColor }]}
            >
              {dashboardData.partner.business_name}
            </StyledText>
            <Pressable
              style={[styles.referralCodeBox, { backgroundColor: cardColor, borderColor }]}
              onPress={copyReferralCode}
            >
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Your referral code
              </StyledText>
              <View style={styles.referralCodeRow}>
                <StyledText
                  variant="titleMedium"
                  style={[styles.referralCode, { color: primaryColor }]}
                >
                  {dashboardData.partner.referral_code}
                </StyledText>
                <Ionicons
                  name={copied ? "checkmark" : "copy"}
                  size={20}
                  color={iconColor}
                  style={styles.referralCodeIcon}
                />
              </View>
            </Pressable>
          </>
        )}
      </View>

      {/* Stats Section */}
      {stats.length > 0 && <StatsSection stats={stats} />}

      <ForthcomingBookingsRow />

      {/* Referral Metrics */}
      {dashboardData && (
        <View style={[styles.section, { backgroundColor: cardColor, borderColor }]}>
          <StyledText
            variant="labelMedium"
            style={[styles.sectionTitle, { color: textColor }]}
          >
            Referral Metrics
          </StyledText>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Conversion
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor }}>
                {(dashboardData.referral_metrics.conversion_rate * 100).toFixed(0)}%
              </StyledText>
            </View>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Churned
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor }}>
                {dashboardData.referral_metrics.churned}
              </StyledText>
            </View>
          </View>
        </View>
      )}

      {/* Activity Metrics */}
      {dashboardData && (
        <View style={[styles.section, { backgroundColor: cardColor, borderColor }]}>
          <StyledText
            variant="labelMedium"
            style={[styles.sectionTitle, { color: textColor }]}
          >
            Activity
          </StyledText>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Completed
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor }}>
                {dashboardData.activity_metrics.completed}
              </StyledText>
            </View>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Cancelled
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor }}>
                {dashboardData.activity_metrics.cancelled}
              </StyledText>
            </View>
          </View>
          <View style={[styles.revenueRow, { borderTopColor: borderColor }]}>
            <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
              Revenue (referred users)
            </StyledText>
            <StyledText variant="titleMedium" style={{ color: primaryColor }}>
              {formatCurrency(dashboardData.activity_metrics.revenue_total, country)}
            </StyledText>
          </View>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                This month
              </StyledText>
              <StyledText variant="bodyMedium" style={{ color: textColor }}>
                {formatCurrency(dashboardData.activity_metrics.revenue_this_month, country)}
              </StyledText>
            </View>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Last month
              </StyledText>
              <StyledText variant="bodyMedium" style={{ color: textColor }}>
                {formatCurrency(dashboardData.activity_metrics.revenue_last_month, country)}
              </StyledText>
            </View>
          </View>
        </View>
      )}

      {/* Commission */}
      {dashboardData && (
        <View style={[styles.section, { backgroundColor: cardColor, borderColor }]}>
          <StyledText
            variant="labelMedium"
            style={[styles.sectionTitle, { color: textColor }]}
          >
            Commission ({dashboardData.commission.commission_rate}% rate)
          </StyledText>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Total earned
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: primaryColor }}>
                {formatCurrency(dashboardData.commission.total_earned, country)}
              </StyledText>
            </View>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Pending
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor }}>
                {formatCurrency(dashboardData.commission.pending, country)}
              </StyledText>
            </View>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Paid
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor }}>
                {formatCurrency(dashboardData.commission.paid, country)}
              </StyledText>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.payoutLink, { borderTopColor: borderColor }]}
            onPress={() => router.push("/main/dashboard/PartnerPayoutScreen")}
          >
            <StyledText variant="bodyMedium" style={{ color: primaryColor }}>
              Payout details & banking
            </StyledText>
            <Ionicons name="chevron-forward" size={20} color={primaryColor} />
          </TouchableOpacity>
        </View>
      )}

      {/* Vehicle Insights */}
      {dashboardData && dashboardData.vehicle_insights.total_vehicles > 0 && (
        <View style={[styles.section, { backgroundColor: cardColor, borderColor }]}>
          <StyledText
            variant="labelMedium"
            style={[styles.sectionTitle, { color: textColor }]}
          >
            Vehicle Insights
          </StyledText>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                Total vehicles
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor }}>
                {dashboardData.vehicle_insights.total_vehicles}
              </StyledText>
            </View>
            <View style={styles.metricItem}>
              <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                No booking activity
              </StyledText>
              <StyledText variant="titleMedium" style={{ color: textColor }}>
                {dashboardData.vehicle_insights.no_booking_activity}
              </StyledText>
            </View>
          </View>
        </View>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
};

export default DealershipPartnerDashboardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
  },
  businessName: {
    marginTop: 4,
    opacity: 0.7,
  },
  referralCodeBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  referralCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  referralCode: {
    fontWeight: "700",
    letterSpacing: 2,
  },
  referralCodeIcon: {
    opacity: 0.7,
  },
  section: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  metricItem: {
    flex: 1,
  },
  revenueRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  payoutLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  bottomPadding: {
    height: 40,
  },
});
