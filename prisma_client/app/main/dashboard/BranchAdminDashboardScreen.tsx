import React from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import useDashboard from "@/app/app-hooks/useDashboard";
import { useAppSelector, RootState } from "@/app/store/main_store";
import { useGetBranchSpendQuery } from "@/app/store/api/fleetApi";
import { formatCurrency } from "@/app/utils/methods";
import OngoingServiceCard from "@/app/components/dashboard/OngoingServiceCard";
import RecentServicesSection from "@/app/components/dashboard/RecentServicesSection";
import StatsSection from "@/app/components/dashboard/StatsSection";

const BranchAdminDashboardScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const buttonColor = useThemeColor({}, "button");
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");

  const user = useAppSelector((state: RootState) => state.auth.user);
  const branchName = user?.managed_branch?.name || "Branch";
  const cardColor = useThemeColor({}, "cards");

  const { data: branchSpend } = useGetBranchSpendQuery(undefined, {
    skip: !user?.is_branch_admin,
  });
  const {
    inProgressAppointment,
    isLoading,
    recentService,
    stats,
    handleRefresh,
    isRefreshing,
  } = useDashboard();

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <StyledText children="Loading dashboard..." variant="bodyMedium" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Branch Header */}
      <View style={styles.branchHeader}>
        <StyledText
          variant="titleMedium"
          style={[styles.branchTitle, { color: textColor }]}
        >
          {branchName}
        </StyledText>
        <StyledText
          variant="bodySmall"
          style={[styles.branchSubtitle, { color: textColor }]}
        >
          Branch Admin Dashboard
        </StyledText>
      </View>

      {/* Branch spending (fleet admins only) */}
      {user?.is_branch_admin && (
        <View
          style={[
            styles.spendingCard,
            { backgroundColor: cardColor, borderColor },
          ]}
        >
          <StyledText
            variant="titleMedium"
            style={[styles.spendingCardTitle, { color: textColor }]}
          >
            Branch spending
          </StyledText>
          {!branchSpend ? (
            <StyledText
              variant="bodySmall"
              style={{ color: textColor, opacity: 0.8 }}
            >
              Loading…
            </StyledText>
          ) : branchSpend.spend_limit == null ||
            branchSpend.spend_limit <= 0 ? (
            <StyledText
              variant="bodyMedium"
              style={{ color: textColor, opacity: 0.9 }}
            >
              No spending limit set for your branch.
            </StyledText>
          ) : (
            <>
              <StyledText
                variant="labelMedium"
                style={{ color: textColor, opacity: 0.85, marginBottom: 4 }}
              >
                {branchSpend.spend_limit_period === "weekly"
                  ? "Weekly"
                  : "Monthly"}{" "}
                limit
              </StyledText>
              <View style={styles.spendingRow}>
                <StyledText
                  variant="bodyMedium"
                  style={{ color: textColor, fontWeight: "600" }}
                >
                  Spent:
                </StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {formatCurrency(branchSpend.spent)}
                </StyledText>
              </View>
              <View style={styles.spendingRow}>
                <StyledText
                  variant="bodyMedium"
                  style={{ color: textColor, fontWeight: "600" }}
                >
                  Remaining:
                </StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {branchSpend.remaining != null
                    ? formatCurrency(branchSpend.remaining)
                    : "—"}
                </StyledText>
              </View>
              {branchSpend.spend_limit > 0 && (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, (branchSpend.spent / branchSpend.spend_limit) * 100)}%`,
                        backgroundColor: primaryColor,
                      },
                    ]}
                  />
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Ongoing Service Card */}
      {inProgressAppointment && (
        <OngoingServiceCard appointment={inProgressAppointment} />
      )}

      {/* Upcoming Appointments: always show section with "See all forthcoming bookings" button */}
      <View style={styles.upcomingAppointmentDateContainer}>
        <View style={styles.upcomingSectionHeader}>
          <Pressable
            style={[styles.seeAllButton, { backgroundColor: buttonColor }]}
            onPress={() =>
              router.push("/main/dashboard/ForthcomingBookingsListScreen")
            }
          >
            <StyledText variant="bodySmall" style={styles.seeAllButtonText}>
              See all forthcoming bookings
            </StyledText>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Only display recent services section when there is a real recent service (has booking_reference) */}
      {recentService?.booking_reference && (
        <RecentServicesSection bookings={recentService} />
      )}
      {stats && stats.length > 0 && (
        <StatsSection stats={stats} />
      )}
    </ScrollView>
  );
};

export default BranchAdminDashboardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 5,
    paddingBottom: 30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  branchHeader: {
    padding: 10,
    paddingBottom: 8,
  },
  branchTitle: {
    fontSize: 24,
    fontWeight: "bold",
  },
  branchSubtitle: {
    marginTop: 4,
    opacity: 0.7,
  },
  upcomingAppointmentDateContainer: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  upcomingSectionHeader: {
    alignItems: "center",
    marginBottom: 8,
    padding: 10,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  seeAllButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  spendingCard: {
    marginHorizontal: 16,
    marginBottom: 5,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  spendingCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  spendingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(128,128,128,0.2)",
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
});
