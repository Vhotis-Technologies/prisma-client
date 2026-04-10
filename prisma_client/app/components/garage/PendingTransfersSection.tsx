import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import StyledText from "@/app/components/helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  useGetPendingTransfersQuery,
  useApproveTransferMutation,
  useRejectTransferMutation,
} from "@/app/store/api/garageApi";
import { PendingTransferItem } from "@/app/interfaces/GarageInterface";
import { MaterialIcons } from "@expo/vector-icons";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

interface PendingTransfersSectionProps {
  onTransferResolved?: () => void;
}

const PendingTransfersSection: React.FC<PendingTransfersSectionProps> = ({
  onTransferResolved,
}) => {
  const {
    data: transfersData,
    isLoading,
    refetch: refetchTransfers,
  } = useGetPendingTransfersQuery();
  const [approveTransfer, { isLoading: isApproving }] =
    useApproveTransferMutation();
  const [rejectTransfer, { isLoading: isRejecting }] =
    useRejectTransferMutation();
  const { showSnackbarWithConfig } = useSnackbar();
  const [actingTransferId, setActingTransferId] = React.useState<string | null>(null);

  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "borders");
  const cardColor = useThemeColor({}, "cards");

  const totalPending =
    (transfersData?.incoming_transfers?.length ?? 0) +
    (transfersData?.outgoing_transfers?.length ?? 0);
  if (totalPending === 0 && !isLoading) return null;

  const handleApprove = async (transfer: PendingTransferItem) => {
    setActingTransferId(transfer.id);
    try {
      await approveTransfer({ transfer_id: transfer.id }).unwrap();
      showSnackbarWithConfig({
        message: "Transfer approved. Vehicle has been transferred.",
        type: "success",
        duration: 3000,
      });
      refetchTransfers();
      onTransferResolved?.();
    } catch (err: any) {
      showSnackbarWithConfig({
        message: err?.data?.error || "Failed to approve transfer",
        type: "error",
        duration: 3000,
      });
    } finally {
      setActingTransferId(null);
    }
  };

  const handleReject = async (transfer: PendingTransferItem) => {
    setActingTransferId(transfer.id);
    try {
      await rejectTransfer({ transfer_id: transfer.id }).unwrap();
      showSnackbarWithConfig({
        message:
          transfer.is_expired
            ? "This request had already expired."
            : "Transfer request rejected.",
        type: "success",
        duration: 3000,
      });
      refetchTransfers();
      onTransferResolved?.();
    } catch (err: any) {
      showSnackbarWithConfig({
        message: err?.data?.error || "Failed to reject transfer",
        type: "error",
        duration: 3000,
      });
    } finally {
      setActingTransferId(null);
    }
  };

  const renderTransferCard = (
    transfer: PendingTransferItem,
    isIncoming: boolean
  ) => {
    const vehicleLabel = `${transfer.vehicle.make} ${transfer.vehicle.model} (${transfer.vehicle.registration_number})`;
    const subLabel = isIncoming
      ? `${transfer.to_owner.name} wants to receive this vehicle`
      : `Waiting for ${transfer.from_owner.name} to respond`;

    return (
      <View
        key={transfer.id}
        style={[styles.card, { backgroundColor: cardColor, borderColor }]}
      >
        <View style={styles.cardContent}>
          <StyledText
            variant="titleSmall"
            style={[styles.vehicleLabel, { color: textColor }]}
          >
            {vehicleLabel}
          </StyledText>
          <StyledText
            variant="bodySmall"
            style={[styles.subLabel, { color: textColor }]}
          >
            {subLabel}
          </StyledText>
          {transfer.is_expired && (
            <StyledText
              variant="bodySmall"
              style={[styles.expiredBadge, { color: "#c62828" }]}
            >
              Expired
            </StyledText>
          )}
        </View>
        {isIncoming && !transfer.is_expired && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.approveBtn, { backgroundColor: "#2e7d32" }]}
              onPress={() => handleApprove(transfer)}
              disabled={actingTransferId != null}
            >
              {actingTransferId === transfer.id && (isApproving || isRejecting) ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <StyledText variant="labelMedium" style={styles.btnText}>
                  Approve
                </StyledText>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectBtn, { backgroundColor: "#c62828" }]}
              onPress={() => handleReject(transfer)}
              disabled={actingTransferId != null}
            >
              <StyledText variant="labelMedium" style={styles.btnText}>
                Reject
              </StyledText>
            </TouchableOpacity>
          </View>
        )}
        {isIncoming && transfer.is_expired && (
          <TouchableOpacity
            style={[styles.dismissBtn, { borderColor }]}
            onPress={() => handleReject(transfer)}
            disabled={actingTransferId != null}
          >
            <StyledText variant="labelMedium" style={{ color: textColor }}>
              Dismiss
            </StyledText>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.section, { borderColor }]}>
        <ActivityIndicator size="small" color={primaryColor} />
        <StyledText variant="bodySmall" style={{ color: textColor }}>
          Loading transfers...
        </StyledText>
      </View>
    );
  }

  return (
    <View style={[styles.section, { borderColor }]}>
      <View style={styles.sectionHeader}>
        <MaterialIcons name="swap-horiz" size={20} color={primaryColor} />
        <StyledText
          variant="titleMedium"
          style={[styles.sectionTitle, { color: textColor }]}
        >
          Pending transfers
        </StyledText>
      </View>
      {transfersData?.incoming_transfers?.length ? (
        <View style={styles.subSection}>
          <StyledText
            variant="labelMedium"
            style={[styles.subSectionTitle, { color: textColor }]}
          >
            Requests for your vehicles
          </StyledText>
          {transfersData.incoming_transfers.map((t) =>
            renderTransferCard(t, true)
          )}
        </View>
      ) : null}
      {transfersData?.outgoing_transfers?.length ? (
        <View style={styles.subSection}>
          <StyledText
            variant="labelMedium"
            style={[styles.subSectionTitle, { color: textColor }]}
          >
            Your requests (waiting for owner)
          </StyledText>
          {transfersData.outgoing_transfers.map((t) =>
            renderTransferCard(t, false)
          )}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: "600",
  },
  subSection: {
    marginBottom: 12,
  },
  subSectionTitle: {
    marginBottom: 8,
    opacity: 0.9,
  },
  card: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  cardContent: {
    marginBottom: 8,
  },
  vehicleLabel: {
    fontWeight: "600",
    marginBottom: 4,
  },
  subLabel: {
    opacity: 0.85,
  },
  expiredBadge: {
    marginTop: 4,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  approveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  rejectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  btnText: {
    color: "#fff",
  },
});

export default PendingTransfersSection;
