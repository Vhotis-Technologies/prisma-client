import React from "react";
import {
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import { useFetchBookingImagesQuery } from "@/app/store/api/serviceHistoryApi";
import { formatDate } from "@/app/utils/methods";
import { VehicleInspectionProps } from "@/app/interfaces/GarageInterface";

interface InspectionDataModalProps {
  bookingId: string;
}

const getStatusColor = (status: string | null | undefined) => {
  if (!status) return "#6B7280";
  const lower = status.toLowerCase();
  if (lower === "good" || lower === "working") return "#10B981";
  if (
    lower === "needs_work" ||
    lower === "dim" ||
    lower === "low" ||
    lower === "weak" ||
    lower === "needs_change"
  )
    return "#F59E0B";
  if (
    lower === "bad" ||
    lower === "not_working" ||
    lower === "replace" ||
    lower === "needs_refill"
  )
    return "#EF4444";
  return "#6B7280";
};

const formatStatus = (status: string | null | undefined) => {
  if (!status) return "N/A";
  return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

const InspectionDataModal: React.FC<InspectionDataModalProps> = ({
  bookingId,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const iconColor = useThemeColor({}, "icons");

  const {
    data,
    isLoading,
    isError,
    error,
  } = useFetchBookingImagesQuery(
    { booking_id: bookingId },
    { skip: !bookingId }
  );

  const inspection: VehicleInspectionProps | null =
    data?.event_data_management != null
      ? {
          ...data.event_data_management,
          booking_reference: data.booking_reference,
          appointment_date: data.event_data_management?.inspected_at,
        }
      : null;

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: cardColor }]}>
        <ActivityIndicator size="large" color={iconColor} />
        <StyledText
          variant="bodyMedium"
          style={[styles.loadingText, { color: textColor }]}
        >
          Loading inspection...
        </StyledText>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.centered, { backgroundColor: cardColor }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <StyledText
          variant="bodyMedium"
          style={[styles.messageText, { color: textColor }]}
        >
          {(error as any)?.data?.error || "Failed to load inspection data."}
        </StyledText>
      </View>
    );
  }

  if (data?.access_denied) {
    return (
      <View style={[styles.centered, { backgroundColor: cardColor }]}>
        <Ionicons name="lock-closed-outline" size={48} color={iconColor} />
        <StyledText
          variant="titleMedium"
          style={[styles.messageTitle, { color: textColor }]}
        >
          Access Restricted
        </StyledText>
        <StyledText
          variant="bodyMedium"
          style={[styles.messageText, { color: textColor }]}
        >
          {data?.message ||
            "Inspection details are only available with an active fleet subscription."}
        </StyledText>
      </View>
    );
  }

  if (!inspection) {
    return (
      <View style={[styles.centered, { backgroundColor: cardColor }]}>
        <Ionicons name="clipboard-outline" size={48} color={iconColor} />
        <StyledText
          variant="titleMedium"
          style={[styles.messageTitle, { color: textColor }]}
        >
          No Inspection Data
        </StyledText>
        <StyledText
          variant="bodyMedium"
          style={[styles.messageText, { color: textColor }]}
        >
          No inspection was recorded for this booking.
        </StyledText>
      </View>
    );
  }

  const Section = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <View style={[styles.section, { borderBottomColor: borderColor }]}>
      <StyledText
        variant="labelLarge"
        style={[styles.sectionTitle, { color: textColor }]}
      >
        {title}
      </StyledText>
      {children}
    </View>
  );

  const StatusRow = ({
    label,
    value,
  }: {
    label: string;
    value: string | null | undefined;
  }) =>
    value ? (
      <View style={styles.statusRow}>
        <StyledText variant="bodyMedium" style={[styles.label, { color: textColor }]}>
          {label}:
        </StyledText>
        <View
          style={[
            styles.badge,
            { backgroundColor: getStatusColor(value) + "20" },
          ]}
        >
          <StyledText
            variant="bodySmall"
            style={{ color: getStatusColor(value) }}
          >
            {formatStatus(value)}
          </StyledText>
        </View>
      </View>
    ) : null;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {(inspection.booking_reference || inspection.inspected_at) && (
        <View style={[styles.headerBar, { borderBottomColor: borderColor }]}>
          {inspection.booking_reference && (
            <StyledText
              variant="labelMedium"
              style={[styles.refText, { color: textColor }]}
            >
              Booking: {inspection.booking_reference}
            </StyledText>
          )}
          {(inspection.appointment_date || inspection.inspected_at) && (
            <StyledText
              variant="bodySmall"
              style={[styles.dateText, { color: textColor }]}
            >
              {formatDate(
                inspection.appointment_date || inspection.inspected_at || ""
              )}
            </StyledText>
          )}
        </View>
      )}
      <View style={styles.content}>
        {(inspection.headlights_status ||
          inspection.taillights_status ||
          inspection.indicators_status) && (
          <Section title="Lights">
            <StatusRow label="Headlights" value={inspection.headlights_status} />
            <StatusRow label="Taillights" value={inspection.taillights_status} />
            <StatusRow label="Indicators" value={inspection.indicators_status} />
          </Section>
        )}

        {(inspection.oil_level ||
          inspection.coolant_level ||
          inspection.brake_fluid_level) && (
          <Section title="Fluids">
            <StatusRow label="Oil level" value={inspection.oil_level} />
            <StatusRow label="Coolant" value={inspection.coolant_level} />
            <StatusRow label="Brake fluid" value={inspection.brake_fluid_level} />
          </Section>
        )}

        {(inspection.tire_tread_depth || inspection.tire_condition) && (
          <Section title="Tires">
            {inspection.tire_tread_depth != null && (
              <View style={styles.statusRow}>
                <StyledText variant="bodyMedium" style={[styles.label, { color: textColor }]}>
                  Tread depth:
                </StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {inspection.tire_tread_depth} mm
                </StyledText>
              </View>
            )}
            {inspection.tire_condition && (
              <View style={styles.statusRow}>
                <StyledText variant="bodyMedium" style={[styles.label, { color: textColor }]}>
                  Condition:
                </StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {inspection.tire_condition}
                </StyledText>
              </View>
            )}
          </Section>
        )}

        {(inspection.wiper_status ||
          inspection.battery_condition ||
          inspection.vehicle_condition_notes ||
          inspection.damage_report) && (
          <Section title="Other">
            <StatusRow label="Wipers" value={inspection.wiper_status} />
            <StatusRow label="Battery" value={inspection.battery_condition} />
            {inspection.vehicle_condition_notes && (
              <View style={styles.notesBlock}>
                <StyledText
                  variant="labelMedium"
                  style={[styles.label, { color: textColor }]}
                >
                  Condition notes
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[styles.notesText, { color: textColor }]}
                >
                  {inspection.vehicle_condition_notes}
                </StyledText>
              </View>
            )}
            {inspection.damage_report && (
              <View style={styles.notesBlock}>
                <StyledText
                  variant="labelMedium"
                  style={[styles.label, { color: textColor }]}
                >
                  Damage report
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[styles.notesText, { color: "#EF4444" }]}
                >
                  {inspection.damage_report}
                </StyledText>
              </View>
            )}
          </Section>
        )}
      </View>
    </View>
  );
};

export default InspectionDataModal;

const styles = StyleSheet.create({
  container: {
    flex:1
  },
  centered: {
    flex: 1,
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
  },
  messageTitle: {
    marginBottom: 8,
    textAlign: "center",
  },
  messageText: {
    textAlign: "center",
    opacity: 0.9,
  },
  headerBar: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  refText: {
    fontWeight: "600",
  },
  dateText: {
    marginTop: 4,
    opacity: 0.8,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  label: {
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  notesBlock: {
    marginTop: 8,
  },
  notesText: {
    marginTop: 4,
    opacity: 0.9,
  },
});
