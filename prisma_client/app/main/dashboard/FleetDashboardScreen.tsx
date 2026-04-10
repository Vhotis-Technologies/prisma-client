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
import DateRangePicker from "@/app/components/dashboard/DateRangePicker";
import ChartContainer from "@/app/components/dashboard/charts/ChartContainer";
import BarChart from "@/app/components/dashboard/charts/BarChart";
import LineChart from "@/app/components/dashboard/charts/LineChart";
import PieChart from "@/app/components/dashboard/charts/PieChart";
import { useFleetDashboard } from "@/app/app-hooks/useFleetDashboard";
import { formatCurrency } from "@/app/utils/methods";

const FleetDashboardScreen = () => {
  const [branchesExpanded, setBranchesExpanded] = useState(false);

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const buttonColor = useThemeColor({}, "button");

  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dashboardData,
    isLoading,
    error,
    refetch,
    isFetching,
    branchPerformanceData,
    spendTrendsData,
    healthScoresData,
    bookingActivityData,
    commonIssuesData,
    stats,
  } = useFleetDashboard(primaryColor);

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading && !dashboardData) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <StyledText
          children="Loading fleet dashboard..."
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
        {dashboardData && (
          <StyledText
            variant="titleLarge"
            style={[styles.fleetName, { color: textColor }]}
          >
            {dashboardData.fleet.name}
          </StyledText>
        )}
      </View>

      {/* Date Range Picker */}
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      {/* Stats Section */}
      {stats.length > 0 && <StatsSection stats={stats} />}

      {/* Quick Actions */}
      <View style={styles.quickActionsSection}>
        <StyledText
          variant="labelMedium"
          style={[styles.sectionTitle, { color: textColor }]}
        >
          Quick Actions
        </StyledText>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={[
              styles.quickActionButton,
              { backgroundColor: cardColor, borderColor },
            ]}
            onPress={() =>
              router.push("/main/dashboard/BranchesListScreen")
            }
          >
            <Ionicons name="business" size={24} color={primaryColor} />
            <StyledText
              variant="bodyMedium"
              style={[styles.quickActionText, { color: textColor }]}
            >
              Manage Branches
            </StyledText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.quickActionButton,
              { backgroundColor: cardColor, borderColor },
            ]}
            onPress={() => router.push("/main/dashboard/AdminManagementScreen")}
          >
            <Ionicons name="person-add" size={24} color={primaryColor} />
            <StyledText
              variant="bodyMedium"
              style={[styles.quickActionText, { color: textColor }]}
            >
              Manage Admins
            </StyledText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.quickActionButton,
              { backgroundColor: cardColor, borderColor },
            ]}
            onPress={() =>
              router.push({
                pathname: "/main/dashboard/ForthcomingBookingsListScreen",
                params: { scope: "my_bookings" },
              })
            }
          >
            <Ionicons name="calendar" size={24} color={primaryColor} />
            <StyledText
              variant="bodyMedium"
              style={[styles.quickActionText, { color: textColor }]}
            >
              My bookings
            </StyledText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Branches Dropdown */}
      {dashboardData && dashboardData.branches.length > 0 && (
        <View style={styles.branchesSection}>
          <TouchableOpacity
            style={[
              styles.branchesDropdownTrigger,
              { backgroundColor: cardColor, borderColor },
            ]}
            onPress={() => setBranchesExpanded((prev) => !prev)}
            activeOpacity={0.7}
          >
            <StyledText
              variant="labelMedium"
              style={[styles.branchesDropdownText, { color: textColor }]}
            >
              Branches
            </StyledText>
            <Ionicons
              name={branchesExpanded ? "chevron-up" : "chevron-down"}
              size={22}
              color={textColor}
            />
          </TouchableOpacity>
          {branchesExpanded && (
            <View style={styles.branchesDropdownList}>
              {dashboardData.branches.map((branch) => (
                <Pressable
                  key={branch.id}
                  style={[
                    styles.branchCard,
                    { backgroundColor: cardColor, borderColor },
                  ]}
                  onPress={() => {
                    router.push({
                      pathname: "/main/dashboard/BranchManagementScreen",
                      params: { branchId: branch.id },
                    });
                  }}
                >
                  <View style={styles.branchHeader}>
                    <Ionicons name="location" size={20} color={primaryColor} />
                    <StyledText
                      variant="titleMedium"
                      style={[styles.branchName, { color: textColor }]}
                    >
                      {branch.name}
                    </StyledText>
                  </View>
                  {branch.city && (
                    <StyledText
                      variant="bodySmall"
                      style={[styles.branchLocation, { color: textColor }]}
                    >
                      {branch.city}
                      {branch.address && `, ${branch.address}`}
                    </StyledText>
                  )}
                  <View style={styles.branchStats}>
                    <View style={styles.branchStatItem}>
                      <Ionicons name="car" size={16} color={textColor} />
                      <StyledText
                        variant="bodySmall"
                        style={[styles.branchStatText, { color: textColor }]}
                      >
                        {branch.vehicle_count || 0} vehicles
                      </StyledText>
                    </View>
                    <View style={styles.branchStatItem}>
                      <Ionicons name="calendar" size={16} color={textColor} />
                      <StyledText
                        variant="bodySmall"
                        style={[styles.branchStatText, { color: textColor }]}
                      >
                        {branch.booking_count || 0} bookings
                      </StyledText>
                    </View>
                  </View>
                  {branch.spend_limit != null && branch.spend_limit > 0 ? (
                    <StyledText
                      variant="bodySmall"
                      style={{ color: textColor, opacity: 0.85, marginTop: 4 }}
                    >
                      Spent: {formatCurrency(branch.spent ?? 0)} · Left:{" "}
                      {branch.remaining != null
                        ? formatCurrency(branch.remaining)
                        : "—"}
                    </StyledText>
                  ) : (
                    <StyledText
                      variant="bodySmall"
                      style={{ color: textColor, opacity: 0.7, marginTop: 4 }}
                    >
                      No limit
                    </StyledText>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
};

export default FleetDashboardScreen;

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
    padding: 8,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  header: {
    padding: 10,
    paddingBottom: 8,
  },
  fleetName: {
    marginTop: 4,
    opacity: 0.7,
  },
  quickActionsSection: {
    padding: 8,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  quickActionButton: {
    flex: 1,
    padding: 8,
    borderRadius: 5,
    alignItems: "center",
    borderWidth: 0.5,
    gap: 8,
  },
  quickActionText: {
    textAlign: "center",
  },
  branchesSection: {
    padding: 8,
    paddingTop: 8,
    paddingBottom: 70,
  },
  branchesDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  branchesDropdownText: {
    fontSize: 16,
    fontWeight: "600",
  },
  branchesDropdownList: {
    marginTop: 8,
  },
  branchCard: {
    padding: 16,
    borderRadius: 5,
    marginBottom: 12,
    borderWidth: 0.5,
  },
  branchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  branchName: {
    fontWeight: "600",
  },
  branchLocation: {
    marginBottom: 12,
    opacity: 0.7,
  },
  branchStats: {
    flexDirection: "row",
    gap: 16,
  },
  branchStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  branchStatText: {
    fontSize: 12,
  },
});
