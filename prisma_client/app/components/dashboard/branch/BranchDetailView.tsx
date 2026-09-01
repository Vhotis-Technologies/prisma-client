import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import StyledButton from "@/app/components/helpers/StyledButton";
import ModalServices from "@/app/utils/ModalServices";
import { RescheduleBulkOrderContent } from "@/app/components/dashboard/RescheduleBulkOrderContent";
import BulkOrderConfirmationModal from "@/app/components/booking/BulkOrderConfirmationModal";
import { formatCurrency } from "@/app/utils/methods";
import type {
  BranchProps,
  BranchAdminsResponse,
  BranchBulkOrdersResponse,
  BranchBulkOrderItem,
  BranchVehiclesResponse,
} from "@/app/interfaces/FleetInterfaces";
import BranchBulkOrdersSection from "@/app/components/dashboard/branch/BranchBulkOrdersSection";
import BranchFleetVehicleCard from "@/app/components/dashboard/branch/BranchFleetVehicleCard";
import type { BulkCapacityOption } from "@/app/utils/fleetDashboardUtils";
import type { RescheduleOrderState } from "@/app/app-hooks/useFleet";

export interface BranchDetailViewProps {
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  borderColor: string;
  primaryColor: string;
  selectedBranch: BranchProps;
  branchAdminsData: BranchAdminsResponse | undefined;
  branchVehiclesData: BranchVehiclesResponse | undefined;
  branchBulkOrdersData: BranchBulkOrdersResponse | undefined;
  capPeriod: "weekly" | "monthly";
  setCapPeriod: (p: "weekly" | "monthly") => void;
  capAmount: string;
  setCapAmount: (v: string) => void;
  isSavingCap: boolean;
  bulkOrdersExpanded: boolean;
  setBulkOrdersExpanded: (v: boolean) => void;
  expandedBulkOrderId: string | null;
  setExpandedBulkOrderId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  rescheduleOrder: RescheduleOrderState | null;
  rescheduleNewDate: string;
  setRescheduleNewDate: (v: string) => void;
  rescheduleOptions: BulkCapacityOption[] | null;
  rescheduleSelectedIndex: number;
  setRescheduleSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  setRescheduleSelectedOption: (o: BulkCapacityOption | null) => void;
  rescheduleLoading: boolean;
  isRescheduling: boolean;
  rescheduleConfirmationPayload: {
    order: RescheduleOrderState;
    newDate: string;
    newStartTime: string;
    newEndTime: string;
  } | null;
  handleSaveCap: (branchId: string) => void;
  handleRevertCap: (branchId: string) => void;
  handleCancelBulkOrder: (order: BranchBulkOrderItem) => void;
  openRescheduleModal: (order: BranchBulkOrderItem) => void;
  closeRescheduleModal: () => void;
  clearRescheduleOptions: () => void;
  checkRescheduleCapacity: () => void;
  confirmReschedule: () => void;
  clearRescheduleConfirmation: () => void;
  canCancelOrRescheduleBulkOrder: (order: BranchBulkOrderItem) => boolean;
  isCancelling: boolean;
}

const BranchDetailView = ({
  backgroundColor,
  cardColor,
  textColor,
  borderColor,
  primaryColor,
  selectedBranch,
  branchAdminsData,
  branchVehiclesData,
  branchBulkOrdersData,
  capPeriod,
  setCapPeriod,
  capAmount,
  setCapAmount,
  isSavingCap,
  bulkOrdersExpanded,
  setBulkOrdersExpanded,
  expandedBulkOrderId,
  setExpandedBulkOrderId,
  rescheduleOrder,
  rescheduleNewDate,
  setRescheduleNewDate,
  rescheduleOptions,
  rescheduleSelectedIndex,
  setRescheduleSelectedIndex,
  setRescheduleSelectedOption,
  rescheduleLoading,
  isRescheduling,
  rescheduleConfirmationPayload,
  handleSaveCap,
  handleRevertCap,
  handleCancelBulkOrder,
  openRescheduleModal,
  closeRescheduleModal,
  clearRescheduleOptions,
  checkRescheduleCapacity,
  confirmReschedule,
  clearRescheduleConfirmation,
  canCancelOrRescheduleBulkOrder,
  isCancelling,
}: BranchDetailViewProps) => (
  <>
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      showsVerticalScrollIndicator={false}
    >
      {branchAdminsData &&
        branchAdminsData.admins &&
        branchAdminsData.admins.length > 0 && (
          <View
            style={[
              styles.branchDetailCard,
              { backgroundColor: cardColor, borderColor },
            ]}
          >
            <StyledText
              variant="titleMedium"
              style={[
                styles.sectionTitle,
                { color: textColor, marginBottom: 12 },
              ]}
            >
              Branch Managers
            </StyledText>
            {branchAdminsData.admins.map((admin) => (
              <View key={admin.id} style={[styles.adminCard, { borderColor }]}>
                <View style={styles.adminInfo}>
                  <StyledText
                    variant="bodyLarge"
                    style={{ color: textColor, fontWeight: "600" }}
                  >
                    {admin.name}
                  </StyledText>
                  <StyledText
                    variant="bodySmall"
                    style={{ color: textColor, opacity: 0.7 }}
                  >
                    {admin.email}
                  </StyledText>
                  {admin.invite_pending && (
                    <StyledText
                      variant="labelSmall"
                      style={{ color: primaryColor, fontWeight: "600" }}
                    >
                      Invite pending
                    </StyledText>
                  )}
                  {admin.phone && (
                    <StyledText
                      variant="bodySmall"
                      style={{ color: textColor, opacity: 0.7 }}
                    >
                      {admin.phone}
                    </StyledText>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

      <View
        style={[
          styles.branchDetailCard,
          { backgroundColor: cardColor, borderColor },
        ]}
      >
        <View style={styles.detailRow}>
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor, fontWeight: "600" }}
          >
            Address:
          </StyledText>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            {selectedBranch.address || "N/A"}
          </StyledText>
        </View>
        <View style={styles.detailRow}>
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor, fontWeight: "600" }}
          >
            City:
          </StyledText>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            {selectedBranch.city || "N/A"}
          </StyledText>
        </View>
        <View style={styles.detailRow}>
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor, fontWeight: "600" }}
          >
            Postcode:
          </StyledText>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            {selectedBranch.postcode || "N/A"}
          </StyledText>
        </View>
        <View style={styles.detailRow}>
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor, fontWeight: "600" }}
          >
            Vehicles:
          </StyledText>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            {selectedBranch.vehicle_count || 0}
          </StyledText>
        </View>
        <View style={styles.detailRow}>
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor, fontWeight: "600" }}
          >
            Admins:
          </StyledText>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            {selectedBranch.admin_count || 0}
          </StyledText>
        </View>
      </View>

      <View
        style={[
          styles.branchDetailCard,
          { backgroundColor: cardColor, borderColor },
        ]}
      >
        <StyledText
          variant="titleMedium"
          style={[styles.sectionTitle, { color: textColor }]}
        >
          Spending cap
        </StyledText>
        {selectedBranch.spend_limit != null &&
        selectedBranch.spend_limit > 0 ? (
          <>
            <View style={styles.detailRow}>
              <StyledText
                variant="bodyMedium"
                style={{ color: textColor, fontWeight: "600" }}
              >
                Spent (
                {selectedBranch.spend_limit_period === "weekly"
                  ? "this week"
                  : "this month"}
                ):
              </StyledText>
              <StyledText variant="bodyMedium" style={{ color: textColor }}>
                {formatCurrency(selectedBranch.spent ?? 0)}
              </StyledText>
            </View>
            <View style={styles.detailRow}>
              <StyledText
                variant="bodyMedium"
                style={{ color: textColor, fontWeight: "600" }}
              >
                Remaining:
              </StyledText>
              <StyledText variant="bodyMedium" style={{ color: textColor }}>
                {selectedBranch.remaining != null
                  ? formatCurrency(selectedBranch.remaining)
                  : "—"}
              </StyledText>
            </View>
            <TouchableOpacity
              style={[styles.revertCapButton, { borderColor }]}
              onPress={() => handleRevertCap(selectedBranch.id)}
              disabled={isSavingCap}
            >
              <Ionicons
                name="remove-circle-outline"
                size={18}
                color={textColor}
              />
              <StyledText variant="bodySmall" style={{ color: textColor }}>
                Remove limit
              </StyledText>
            </TouchableOpacity>
          </>
        ) : (
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor, marginBottom: 12 }}
          >
            No spending limit set.
          </StyledText>
        )}
        <View style={styles.capForm}>
          <StyledText
            variant="labelMedium"
            style={{ color: textColor, marginBottom: 8 }}
          >
            Set cap
          </StyledText>
          <View style={[styles.capPeriodRow, { borderColor }]}>
            <TouchableOpacity
              style={[
                styles.capPeriodOption,
                capPeriod === "weekly" && { backgroundColor: primaryColor },
                { borderColor },
              ]}
              onPress={() => setCapPeriod("weekly")}
            >
              <StyledText
                variant="bodySmall"
                style={{ color: capPeriod === "weekly" ? "#fff" : textColor }}
              >
                Weekly
              </StyledText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.capPeriodOption,
                capPeriod === "monthly" && { backgroundColor: primaryColor },
                { borderColor },
              ]}
              onPress={() => setCapPeriod("monthly")}
            >
              <StyledText
                variant="bodySmall"
                style={{
                  color: capPeriod === "monthly" ? "#fff" : textColor,
                }}
              >
                Monthly
              </StyledText>
            </TouchableOpacity>
          </View>
          <StyledTextInput
            label="Spend limit"
            value={capAmount}
            onChangeText={setCapAmount}
            placeholder="0"
            keyboardType="decimal-pad"
            placeholderTextColor="#999999"
          />
          <View style={styles.capFormButtons}>
            <StyledButton
              title="Save cap"
              variant="small"
              onPress={() => handleSaveCap(selectedBranch.id)}
              disabled={isSavingCap || !capAmount.trim()}
              isLoading={isSavingCap}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>

      <BranchBulkOrdersSection
        cardColor={cardColor}
        borderColor={borderColor}
        textColor={textColor}
        primaryColor={primaryColor}
        bulkOrders={branchBulkOrdersData?.bulk_orders}
        bulkOrdersExpanded={bulkOrdersExpanded}
        setBulkOrdersExpanded={setBulkOrdersExpanded}
        expandedBulkOrderId={expandedBulkOrderId}
        setExpandedBulkOrderId={setExpandedBulkOrderId}
        canCancelOrRescheduleBulkOrder={canCancelOrRescheduleBulkOrder}
        handleCancelBulkOrder={handleCancelBulkOrder}
        openRescheduleModal={openRescheduleModal}
        isCancelling={isCancelling}
      />

      {branchVehiclesData && branchVehiclesData.vehicles.length > 0 && (
        <View style={styles.vehiclesSection}>
          <StyledText
            variant="labelMedium"
            style={[styles.sectionTitle, { color: textColor }]}
          >
            Vehicles in Branch
          </StyledText>
          {branchVehiclesData.vehicles.map((vehicle) => (
            <BranchFleetVehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              cardColor={cardColor}
              textColor={textColor}
              borderColor={borderColor}
            />
          ))}
        </View>
      )}
    </ScrollView>

    <ModalServices
      visible={rescheduleOrder != null}
      onClose={closeRescheduleModal}
      title="Reschedule bulk order"
      modalType="sheet"
      component={
        <RescheduleBulkOrderContent
          rescheduleNewDate={rescheduleNewDate}
          setRescheduleNewDate={setRescheduleNewDate}
          rescheduleOptions={rescheduleOptions}
          rescheduleSelectedIndex={rescheduleSelectedIndex}
          setRescheduleSelectedIndex={setRescheduleSelectedIndex}
          setRescheduleSelectedOption={setRescheduleSelectedOption}
          rescheduleLoading={rescheduleLoading}
          isRescheduling={isRescheduling}
          onCheckCapacity={checkRescheduleCapacity}
          onConfirm={confirmReschedule}
          onClose={closeRescheduleModal}
          onDateSelect={clearRescheduleOptions}
          textColor={textColor}
          borderColor={borderColor}
          primaryColor={primaryColor}
        />
      }
    />

    {rescheduleConfirmationPayload && (
      <Modal
        visible={true}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          clearRescheduleConfirmation();
        }}
      >
        <BulkOrderConfirmationModal
          type="rescheduled"
          bookingReference={
            rescheduleConfirmationPayload.order.booking_reference
          }
          numberOfVehicles={
            rescheduleConfirmationPayload.order.number_of_vehicles
          }
          date={
            (rescheduleConfirmationPayload.order.order_data?.date as string)?.slice(
              0,
              10,
            ) ?? ""
          }
          startTime={
            rescheduleConfirmationPayload.order.order_data?.start_time as
              | string
              | undefined
          }
          endTime={
            rescheduleConfirmationPayload.order.order_data?.end_time as
              | string
              | undefined
          }
          serviceName={
            (
              rescheduleConfirmationPayload.order.order_data?.service_type as {
                name?: string;
              }
            )?.name ?? "Bulk service"
          }
          serviceDurationMinutes={
            (
              rescheduleConfirmationPayload.order.order_data?.service_type as {
                duration?: number;
              }
            )?.duration
          }
          address={(() => {
            const addr = rescheduleConfirmationPayload.order.order_data
              ?.address as
              | {
                  address?: string;
                  city?: string;
                  post_code?: string;
                  country?: string;
                }
              | undefined;
            return addr
              ? {
                  address: addr.address,
                  city: addr.city,
                  post_code: addr.post_code,
                  country: addr.country,
                }
              : undefined;
          })()}
          totalAmount={
            (rescheduleConfirmationPayload.order.order_data
              ?.total_amount as number) ?? 0
          }
          newDate={rescheduleConfirmationPayload.newDate}
          newStartTime={rescheduleConfirmationPayload.newStartTime}
          newEndTime={rescheduleConfirmationPayload.newEndTime}
          formatPrice={(amount) => formatCurrency(amount)}
          onClose={clearRescheduleConfirmation}
          onViewDashboard={clearRescheduleConfirmation}
        />
      </Modal>
    )}
  </>
);

export default BranchDetailView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 60,
  },
  branchDetailCard: {
    margin: 10,
    padding: 10,
    borderRadius: 10,
  },
  adminCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  adminInfo: {
    gap: 4,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 2,
  },
  revertCapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  capForm: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.25)",
    gap: 8,
  },
  capPeriodRow: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 0,
  },
  capPeriodOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  capFormButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  vehiclesSection: {
    padding: 12,
    gap: 12,
    paddingBottom: 60,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
});
