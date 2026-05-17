import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import OngoingServiceCard from "@/app/components/dashboard/OngoingServiceCard";
import ForthcomingBookingsRow from "@/app/components/dashboard/ForthcomingBookingsRow";
import RecentServicesSection from "@/app/components/dashboard/RecentServicesSection";
import StatsSection from "@/app/components/dashboard/StatsSection";
import LoyaltyCard from "@/app/components/dashboard/LoyaltyCard";
import StyledText from "@/app/components/helpers/StyledText";
import useDashboard from "@/app/app-hooks/useDashboard";
import AllowNotificationModal from "@/app/components/notification/AllowNotificationModal";
import { usePermissions } from "@/app/app-hooks/usePermissions";
import ModalServices from "@/app/utils/ModalServices";
import ReviewComponent from "@/app/components/booking/ReviewComponent";
import { useAppSelector, RootState } from "@/app/store/main_store";
import ReferralSection from "@/app/components/dashboard/ReferralSection";
import FleetDashboardScreen from "./FleetDashboardScreen";
import BranchAdminDashboardScreen from "./BranchAdminDashboardScreen";
import DealershipPartnerDashboardScreen from "@/app/main/dashboard/DealershipPartnerDashboardScreen";
import { useFetchPerksSummaryQuery } from "@/app/store/api/dashboardApi";

const DashboardScreen = () => {
  /* Get the user from Redux store */
  const user = useAppSelector((state: RootState) => state.auth.user); 

  // ALL hooks must be called before any conditional returns
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [hasAskedForPermissions, setHasAskedForPermissions] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const backgroundColor = useThemeColor({}, "background");
  const primaryColor = useThemeColor({}, "primary");

  /* Fetch the neccessary hooks */
  const {
    inProgressAppointment,
    isLoading,
    recentService,
    stats,
    handleRefresh,
    isRefreshing,
  } = useDashboard();

  const { permissionStatus, isLoading: permissionsLoading } = usePermissions();

  // Fetch loyalty + complimentary perks for the regular B2C dashboard.
  // Skip when this user is routed to a fleet/branch/partner dashboard so we don't
  // fetch data that won't be rendered (server also returns is_b2c:false in that case).
  const skipPerksFetch =
    !user ||
    user.is_fleet_owner === true ||
    user.is_branch_admin === true ||
    user.is_dealership === true ||
    !!user.partner_referral_code;
  const { data: perksSummary } = useFetchPerksSummaryQuery(undefined, {
    skip: skipPerksFetch,
  });

  // Show notification modal when dashboard loads, but only if notifications are not already granted
  // and we haven't asked for permissions yet in this session
  // Also check if the user hasn't disabled notifications in settings
  useEffect(() => {
    if (
      !permissionsLoading &&
      !permissionStatus.notifications.granted &&
      !hasAskedForPermissions &&
      user?.push_notification_token !== false // Don't show if user has explicitly disabled in settings
    ) {
      const timer = setTimeout(() => {
        setShowNotificationModal(true);
        setHasAskedForPermissions(true);
      }, 1000); // Show after 1 second

      return () => clearTimeout(timer);
    }
  }, [
    permissionsLoading,
    permissionStatus.notifications.granted,
    hasAskedForPermissions,
    user?.push_notification_token,
  ]);

  /**
   * Handle unrated service press - opens review modal
   */
  const handleUnratedPress = () => {
    if (recentService) {
      setShowReviewModal(true);
    }
  };

  /**
   * Handle review submission - closes modal and refreshes data
   */
  const handleReviewSubmitted = () => {
    setShowReviewModal(false);
    handleRefresh();
  };

  // Route to appropriate dashboard based on user type (AFTER all hooks)
  if (user?.is_dealership || user?.partner_referral_code) {
    return <DealershipPartnerDashboardScreen />;
  } else if (user?.is_fleet_owner) {
    return <FleetDashboardScreen />;
  } else if (user?.is_branch_admin) {
    return <BranchAdminDashboardScreen />;
  }

  // Regular user dashboard (existing code below)

  // Show loading state
  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <StyledText children="Loading appointments..." variant="bodyMedium" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Ongoing Service Card */}
        {inProgressAppointment && (
          <OngoingServiceCard appointment={inProgressAppointment} />
        )}

        <ForthcomingBookingsRow />

        <RecentServicesSection
          bookings={recentService?.booking_reference ? recentService : null}
          onUnratedPress={handleUnratedPress}
        />
        <LoyaltyCard loyalty={perksSummary?.loyalty} />
      </ScrollView>

      {/* Notification Permission Modal */}
      <ModalServices
        visible={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        component={
          <AllowNotificationModal
            onClose={() => setShowNotificationModal(false)}
            onPermissionGranted={() => {
              setShowNotificationModal(false);
              setHasAskedForPermissions(true);
            }}
          />
        }
        showCloseButton={false}
        animationType="fade"
        modalType="fullscreen"
      />

      {/* Review Modal */}
      <ModalServices
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        component={
          <ReviewComponent
            bookingData={recentService || undefined}
            onReviewSubmitted={handleReviewSubmitted}
          />
        }
        showCloseButton={true}
        animationType="slide"
        title="Review"
        modalType="fullscreen"
      />
    </View>
  );
};

export default DashboardScreen;

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
});
