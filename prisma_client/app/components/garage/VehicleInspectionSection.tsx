import { StyleSheet, View, TouchableOpacity } from "react-native";
import React, { useMemo, useState } from "react";
import { VehicleInspectionProps } from "@/app/interfaces/GarageInterface";
import StyledText from "../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import { formatDate } from "@/app/utils/methods";
import LinearGradientComponent from "../helpers/LinearGradientComponent";

interface VehicleInspectionSectionProps {
  inspection: VehicleInspectionProps | null | undefined;
}

const VehicleInspectionSection = ({
  inspection,
}: VehicleInspectionSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icons");
  const primaryColor = useThemeColor({}, "primary");

  /**
   * Calculate health score from inspection statuses
   * Returns percentage (0-100) based on "good"/"working" statuses
   */
  const healthScore = useMemo(() => {
    if (!inspection) return null;

    const statuses: Array<string | null | undefined> = [
      inspection.wiper_status,
      inspection.oil_level,
      inspection.coolant_level,
      inspection.brake_fluid_level,
      inspection.battery_condition,
      inspection.headlights_status,
      inspection.taillights_status,
      inspection.indicators_status,
    ];

    const validStatuses = statuses.filter(
      (status) => status !== null && status !== undefined
    );
    if (validStatuses.length === 0) return null;

    const goodStatuses = validStatuses.filter(
      (status) =>
        status === "good" ||
        status === "working" ||
        status === "needs_change" // needs_change is acceptable for fluids
    );

    const score = Math.round((goodStatuses.length / validStatuses.length) * 100);
    return score;
  }, [inspection]);

  /**
   * Get color for health score
   */
  const getHealthScoreColor = (score: number | null) => {
    if (score === null) return "#6B7280";
    if (score >= 80) return "#10B981"; // Green
    if (score >= 50) return "#F59E0B"; // Yellow
    return "#EF4444"; // Red
  };

  /**
   * Get status color for individual items
   */
  const getStatusColor = (status: string | null | undefined) => {
    if (!status) return "#6B7280";
    const lowerStatus = status.toLowerCase();
    if (lowerStatus === "good" || lowerStatus === "working") return "#10B981";
    if (
      lowerStatus === "needs_work" ||
      lowerStatus === "dim" ||
      lowerStatus === "low" ||
      lowerStatus === "weak" ||
      lowerStatus === "needs_change"
    )
      return "#F59E0B";
    if (
      lowerStatus === "bad" ||
      lowerStatus === "not_working" ||
      lowerStatus === "replace" ||
      lowerStatus === "needs_refill"
    )
      return "#EF4444";
    return "#6B7280";
  };

  /**
   * Format status text for display
   */
  const formatStatus = (status: string | null | undefined) => {
    if (!status) return "N/A";
    return status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (!inspection) {
    return (
      <View style={[styles.container, { marginHorizontal: 20, marginBottom: 16 }]}>
        <LinearGradientComponent
          color1={cardColor}
          color2={borderColor}
          style={styles.card}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="clipboard-outline" size={20} color={iconColor} />
              <StyledText
                variant="titleMedium"
                style={[styles.title, { color: textColor }]}
              >
                Latest Inspection
              </StyledText>
            </View>
          </View>
          <StyledText
            variant="bodyMedium"
            style={[styles.emptyText, { color: textColor }]}
          >
            No inspection data available yet.
          </StyledText>
        </LinearGradientComponent>
      </View>
    );
  }

  const score = healthScore;
  const scoreColor = getHealthScoreColor(score);

  return (
    <View style={[styles.container, { marginHorizontal: 20, marginBottom: 16 }]}>
      <LinearGradientComponent
        color1={cardColor}
        color2={borderColor}
        style={styles.card}
      >
        <TouchableOpacity
          onPress={() => setIsExpanded(!isExpanded)}
          activeOpacity={0.7}
          style={styles.header}
        >
          <View style={styles.headerLeft}>
            <Ionicons name="clipboard-outline" size={20} color={iconColor} />
            <StyledText
              variant="titleMedium"
              style={[styles.title, { color: textColor }]}
            >
              Latest Inspection
            </StyledText>
            {(inspection.appointment_date || inspection.inspected_at) && (
              <StyledText
                variant="bodySmall"
                style={[styles.dateText, { color: textColor }]}
              >
                {formatDate(inspection.appointment_date || inspection.inspected_at)}
              </StyledText>
            )}
          </View>
          <View style={styles.headerRight}>
            {score !== null && (
              <View
                style={[
                  styles.healthScoreBadge,
                  { backgroundColor: scoreColor + "20", borderColor: scoreColor },
                ]}
              >
                <StyledText
                  variant="labelLarge"
                  style={[styles.healthScoreText, { color: scoreColor }]}
                >
                  {score}%
                </StyledText>
              </View>
            )}
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={iconColor}
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.content}>
            {/* Lights Section */}
            {(inspection.headlights_status ||
              inspection.taillights_status ||
              inspection.indicators_status) && (
              <View style={styles.section}>
                <StyledText
                  variant="labelLarge"
                  style={[styles.sectionTitle, { color: textColor }]}
                >
                  Lights
                </StyledText>
                {inspection.headlights_status && (
                  <View style={styles.statusRow}>
                    <Ionicons name="bulb-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Headlights:
                    </StyledText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            getStatusColor(inspection.headlights_status) + "20",
                        },
                      ]}
                    >
                      <StyledText
                        variant="bodySmall"
                        style={[
                          styles.statusText,
                          {
                            color: getStatusColor(inspection.headlights_status),
                          },
                        ]}
                      >
                        {formatStatus(inspection.headlights_status)}
                      </StyledText>
                    </View>
                  </View>
                )}
                {inspection.taillights_status && (
                  <View style={styles.statusRow}>
                    <Ionicons name="bulb-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Taillights:
                    </StyledText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            getStatusColor(inspection.taillights_status) + "20",
                        },
                      ]}
                    >
                      <StyledText
                        variant="bodySmall"
                        style={[
                          styles.statusText,
                          {
                            color: getStatusColor(inspection.taillights_status),
                          },
                        ]}
                      >
                        {formatStatus(inspection.taillights_status)}
                      </StyledText>
                    </View>
                  </View>
                )}
                {inspection.indicators_status && (
                  <View style={styles.statusRow}>
                    <Ionicons name="flash-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Indicators:
                    </StyledText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            getStatusColor(inspection.indicators_status) + "20",
                        },
                      ]}
                    >
                      <StyledText
                        variant="bodySmall"
                        style={[
                          styles.statusText,
                          {
                            color: getStatusColor(inspection.indicators_status),
                          },
                        ]}
                      >
                        {formatStatus(inspection.indicators_status)}
                      </StyledText>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Fluids Section */}
            {(inspection.oil_level ||
              inspection.coolant_level ||
              inspection.brake_fluid_level) && (
              <View style={styles.section}>
                <StyledText
                  variant="labelLarge"
                  style={[styles.sectionTitle, { color: textColor }]}
                >
                  Fluids
                </StyledText>
                {inspection.oil_level && (
                  <View style={styles.statusRow}>
                    <Ionicons name="water-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Oil Level:
                    </StyledText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            getStatusColor(inspection.oil_level) + "20",
                        },
                      ]}
                    >
                      <StyledText
                        variant="bodySmall"
                        style={[
                          styles.statusText,
                          { color: getStatusColor(inspection.oil_level) },
                        ]}
                      >
                        {formatStatus(inspection.oil_level)}
                      </StyledText>
                    </View>
                  </View>
                )}
                {inspection.coolant_level && (
                  <View style={styles.statusRow}>
                    <Ionicons name="water-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Coolant Level:
                    </StyledText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            getStatusColor(inspection.coolant_level) + "20",
                        },
                      ]}
                    >
                      <StyledText
                        variant="bodySmall"
                        style={[
                          styles.statusText,
                          { color: getStatusColor(inspection.coolant_level) },
                        ]}
                      >
                        {formatStatus(inspection.coolant_level)}
                      </StyledText>
                    </View>
                  </View>
                )}
                {inspection.brake_fluid_level && (
                  <View style={styles.statusRow}>
                    <Ionicons name="water-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Brake Fluid:
                    </StyledText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            getStatusColor(inspection.brake_fluid_level) + "20",
                        },
                      ]}
                    >
                      <StyledText
                        variant="bodySmall"
                        style={[
                          styles.statusText,
                          {
                            color: getStatusColor(inspection.brake_fluid_level),
                          },
                        ]}
                      >
                        {formatStatus(inspection.brake_fluid_level)}
                      </StyledText>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Tires Section */}
            {(inspection.tire_tread_depth || inspection.tire_condition) && (
              <View style={styles.section}>
                <StyledText
                  variant="labelLarge"
                  style={[styles.sectionTitle, { color: textColor }]}
                >
                  Tires
                </StyledText>
                {inspection.tire_tread_depth && (
                  <View style={styles.statusRow}>
                    <Ionicons name="disc-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Tread Depth:
                    </StyledText>
                    <StyledText
                      variant="bodyMedium"
                      style={[styles.statusValue, { color: textColor }]}
                    >
                      {inspection.tire_tread_depth} mm
                    </StyledText>
                  </View>
                )}
                {inspection.tire_condition && (
                  <View style={styles.statusRow}>
                    <Ionicons name="document-text-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Condition:
                    </StyledText>
                    <StyledText
                      variant="bodyMedium"
                      style={[styles.statusValue, { color: textColor }]}
                    >
                      {inspection.tire_condition}
                    </StyledText>
                  </View>
                )}
              </View>
            )}

            {/* Other Section */}
            {(inspection.wiper_status ||
              inspection.battery_condition ||
              inspection.vehicle_condition_notes ||
              inspection.damage_report) && (
              <View style={styles.section}>
                <StyledText
                  variant="labelLarge"
                  style={[styles.sectionTitle, { color: textColor }]}
                >
                  Other
                </StyledText>
                {inspection.wiper_status && (
                  <View style={styles.statusRow}>
                    <Ionicons name="rainy-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Wipers:
                    </StyledText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            getStatusColor(inspection.wiper_status) + "20",
                        },
                      ]}
                    >
                      <StyledText
                        variant="bodySmall"
                        style={[
                          styles.statusText,
                          { color: getStatusColor(inspection.wiper_status) },
                        ]}
                      >
                        {formatStatus(inspection.wiper_status)}
                      </StyledText>
                    </View>
                  </View>
                )}
                {inspection.battery_condition && (
                  <View style={styles.statusRow}>
                    <Ionicons name="battery-charging-outline" size={16} color={iconColor} />
                    <StyledText variant="bodyMedium" style={styles.statusLabel}>
                      Battery:
                    </StyledText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            getStatusColor(inspection.battery_condition) + "20",
                        },
                      ]}
                    >
                      <StyledText
                        variant="bodySmall"
                        style={[
                          styles.statusText,
                          {
                            color: getStatusColor(inspection.battery_condition),
                          },
                        ]}
                      >
                        {formatStatus(inspection.battery_condition)}
                      </StyledText>
                    </View>
                  </View>
                )}
                {inspection.vehicle_condition_notes && (
                  <View style={styles.notesRow}>
                    <Ionicons name="document-text-outline" size={16} color={iconColor} />
                    <View style={styles.notesContent}>
                      <StyledText variant="bodyMedium" style={styles.statusLabel}>
                        Condition Notes:
                      </StyledText>
                      <StyledText
                        variant="bodySmall"
                        style={[styles.notesText, { color: textColor }]}
                      >
                        {inspection.vehicle_condition_notes}
                      </StyledText>
                    </View>
                  </View>
                )}
                {inspection.damage_report && (
                  <View style={styles.notesRow}>
                    <Ionicons name="warning-outline" size={16} color="#EF4444" />
                    <View style={styles.notesContent}>
                      <StyledText variant="bodyMedium" style={styles.statusLabel}>
                        Damage Report:
                      </StyledText>
                      <StyledText
                        variant="bodySmall"
                        style={[styles.notesText, { color: "#EF4444" }]}
                      >
                        {inspection.damage_report}
                      </StyledText>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </LinearGradientComponent>
    </View>
  );
};

export default VehicleInspectionSection;

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontWeight: "600",
  },
  dateText: {
    fontSize: 12,
    opacity: 0.7,
  },
  healthScoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  healthScoreText: {
    fontWeight: "700",
    fontSize: 14,
  },
  content: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 12,
    fontSize: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  statusLabel: {
    flex: 1,
    minWidth: 100,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontWeight: "600",
    fontSize: 12,
  },
  statusValue: {
    fontWeight: "500",
  },
  notesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 12,
  },
  notesContent: {
    flex: 1,
  },
  notesText: {
    marginTop: 4,
    lineHeight: 20,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 8,
    opacity: 0.7,
  },
});
