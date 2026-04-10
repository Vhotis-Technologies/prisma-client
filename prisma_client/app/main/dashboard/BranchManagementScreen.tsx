import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useFleet } from "@/app/app-hooks/useFleet";
import BranchDetailView from "@/app/components/dashboard/branch/BranchDetailView";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";

/**
 * Single-branch detail: managers, address, spending cap, bulk orders, vehicles.
 * List + create branch lives on BranchesListScreen.
 */
const BranchManagementScreen = () => {
  const params = useLocalSearchParams();
  const branchId = params.branchId as string | undefined;

  if (!branchId) {
    return <Redirect href="/main/dashboard/BranchesListScreen" />;
  }

  return <BranchManagementDetail branchId={branchId} />;
};

export default BranchManagementScreen;

function BranchManagementDetail({ branchId }: { branchId: string }) {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");

  const fleet = useFleet({ selectedBranchId: branchId });

  if (fleet.isBranchesLoading) {
    return (
      <View style={[styles.centered, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  if (!fleet.selectedBranch) {
    return (
      <View style={[styles.centered, { backgroundColor, padding: 24 }]}>
        <StyledText
          variant="titleMedium"
          style={{ color: textColor, textAlign: "center", marginBottom: 16 }}
        >
          Branch not found
        </StyledText>
        <StyledButton
          title="Back to branches"
          variant="small"
          onPress={() => router.replace("/main/dashboard/BranchesListScreen")}
        />
      </View>
    );
  }

  return (
    <BranchDetailView
      backgroundColor={backgroundColor}
      cardColor={cardColor}
      textColor={textColor}
      borderColor={borderColor}
      primaryColor={primaryColor}
      selectedBranch={fleet.selectedBranch}
      branchAdminsData={fleet.branchAdminsData}
      branchVehiclesData={fleet.branchVehiclesData}
      branchBulkOrdersData={fleet.branchBulkOrdersData}
      capPeriod={fleet.capPeriod}
      setCapPeriod={fleet.setCapPeriod}
      capAmount={fleet.capAmount}
      setCapAmount={fleet.setCapAmount}
      isSavingCap={fleet.isSavingCap}
      bulkOrdersExpanded={fleet.bulkOrdersExpanded}
      setBulkOrdersExpanded={fleet.setBulkOrdersExpanded}
      expandedBulkOrderId={fleet.expandedBulkOrderId}
      setExpandedBulkOrderId={fleet.setExpandedBulkOrderId}
      rescheduleOrder={fleet.rescheduleOrder}
      rescheduleNewDate={fleet.rescheduleNewDate}
      setRescheduleNewDate={fleet.setRescheduleNewDate}
      rescheduleOptions={fleet.rescheduleOptions}
      rescheduleSelectedIndex={fleet.rescheduleSelectedIndex}
      setRescheduleSelectedIndex={fleet.setRescheduleSelectedIndex}
      setRescheduleSelectedOption={fleet.setRescheduleSelectedOption}
      rescheduleLoading={fleet.rescheduleLoading}
      isRescheduling={fleet.isRescheduling}
      rescheduleConfirmationPayload={fleet.rescheduleConfirmationPayload}
      handleSaveCap={fleet.handleSaveCap}
      handleRevertCap={fleet.handleRevertCap}
      handleCancelBulkOrder={fleet.handleCancelBulkOrder}
      openRescheduleModal={fleet.openRescheduleModal}
      closeRescheduleModal={fleet.closeRescheduleModal}
      clearRescheduleOptions={fleet.clearRescheduleOptions}
      checkRescheduleCapacity={fleet.checkRescheduleCapacity}
      confirmReschedule={fleet.confirmReschedule}
      clearRescheduleConfirmation={fleet.clearRescheduleConfirmation}
      canCancelOrRescheduleBulkOrder={fleet.canCancelOrRescheduleBulkOrder}
      isCancelling={fleet.isCancelling}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
