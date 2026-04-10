import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  VehicleHistoryResponse,
  useGetVehicleHistoryQuery,
} from "@/app/store/api/vinLookupApi";
import { useAppSelector, RootState } from "@/app/store/main_store";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

const VehicleHistoryScreen = () => {
  const params = useLocalSearchParams();
  const vin = params.vin as string;
  const historyDataParam = params.historyData as string | undefined;
  
  const user = useAppSelector((state: RootState) => state.auth.user);
  const isAuthenticated = useAppSelector((state: RootState) => state.auth.isAuthenticated);
  const userEmail = user?.email || "";
  
  const { showSnackbarWithConfig } = useSnackbar();
  
  // Use API query if vin is provided, otherwise use passed data
  const {
    data: apiHistoryData,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
    isFetching: isFetchingHistory,
  } = useGetVehicleHistoryQuery(
    { vin, email: userEmail },
    { skip: !vin || !userEmail || !!historyDataParam }
  );
  
  const [historyData, setHistoryData] = useState<VehicleHistoryResponse | null>(null);

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const successColor = useThemeColor({}, "success");
  const warningColor = useThemeColor({}, "warning");
  const errorColor = useThemeColor({}, "error");

  useEffect(() => {
    if (historyDataParam) {
      try {
        const parsed = JSON.parse(historyDataParam);
        setHistoryData(parsed);
      } catch (error) {
        console.error("Error parsing history data:", error);
      }
    } else if (apiHistoryData) {
      setHistoryData(apiHistoryData);
    }
  }, [historyDataParam, apiHistoryData]);

  if (isLoadingHistory) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <StyledText variant="titleLarge" style={[styles.headerTitle, { color: textColor }]}>
            Vehicle History
          </StyledText>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 12 }}>
            Loading vehicle history...
          </StyledText>
        </View>
      </View>
    );
  }

  if (!historyData) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <StyledText variant="titleLarge" style={[styles.headerTitle, { color: textColor }]}>
            Vehicle History
          </StyledText>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={errorColor} />
          <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 16, textAlign: "center" }}>
            No vehicle history data available.
          </StyledText>
        </View>
      </View>
    );
  }

  if (historyData.requires_payment) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <StyledText variant="titleLarge" style={[styles.headerTitle, { color: textColor }]}>
            Vehicle History
          </StyledText>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={48} color={warningColor} />
          <StyledText variant="bodyLarge" style={{ color: textColor, marginTop: 16, textAlign: "center" }}>
            Payment Required
          </StyledText>
          <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 8, textAlign: "center", paddingHorizontal: 20 }}>
            Please complete payment to view the complete vehicle history.
          </StyledText>
        </View>
      </View>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatMileage = (mileage: number) => {
    return mileage.toLocaleString();
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <StyledText variant="titleMedium" style={[styles.headerTitle, { color: textColor }]}>
          Vehicle History
        </StyledText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetchingHistory}
            onRefresh={refetchHistory}
            tintColor={primaryColor}
          />
        }
      >
        {/* Vehicle Overview Card */}
        <View style={[styles.card, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="car-outline" size={24} color={primaryColor} />
            <StyledText variant="titleMedium" style={[styles.cardTitle, { color: textColor }]}>
              Vehicle Overview
            </StyledText>
          </View>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewItem}>
              <StyledText variant="labelSmall" style={[styles.overviewLabel, { color: textColor }]}>
                Make
              </StyledText>
              <StyledText variant="labelLarge" style={[styles.overviewValue, { color: textColor }]}>
                {historyData.vehicle.make}
              </StyledText>
            </View>
            <View style={styles.overviewItem}>
              <StyledText variant="labelSmall" style={[styles.overviewLabel, { color: textColor }]}>
                Model
              </StyledText>
              <StyledText variant="labelLarge" style={[styles.overviewValue, { color: textColor }]}>
                {historyData.vehicle.model}
              </StyledText>
            </View>
            <View style={styles.overviewItem}>
              <StyledText variant="labelSmall" style={[styles.overviewLabel, { color: textColor }]}>
                Year
              </StyledText>
              <StyledText variant="labelLarge" style={[styles.overviewValue, { color: textColor }]}>
                {historyData.vehicle.year}
              </StyledText>
            </View>
            <View style={styles.overviewItem}>
              <StyledText variant="labelSmall" style={[styles.overviewLabel, { color: textColor }]}>
                Color
              </StyledText>
              <StyledText variant="labelLarge" style={[styles.overviewValue, { color: textColor }]}>
                {historyData.vehicle.color}
              </StyledText>
            </View>
            <View style={styles.overviewItem}>
              <StyledText variant="labelSmall" style={[styles.overviewLabel, { color: textColor }]}>
                VIN
              </StyledText>
              <StyledText variant="labelSmall" style={[styles.overviewValue, { color: textColor }]}>
                {historyData.vehicle.vin}
              </StyledText>
            </View>
          </View>
          {historyData.purchase && (
            <>
              <View style={[styles.divider, { backgroundColor: borderColor }]} />
              <View style={styles.purchaseInfo}>
                <Ionicons name="time-outline" size={20} color={textColor} />
                <View style={styles.purchaseDetails}>
                  <StyledText variant="bodySmall" style={{ color: textColor }}>
                    Access expires: {formatDate(historyData.purchase.expires_at)}
                  </StyledText>
                  <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.7 }}>
                    Purchased: {formatDate(historyData.purchase.purchased_at)}
                  </StyledText>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Ownership History */}
        <View style={[styles.card, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-outline" size={24} color={primaryColor} />
            <StyledText variant="titleMedium" style={[styles.cardTitle, { color: textColor }]}>
              Ownership History
            </StyledText>
          </View>
          {historyData.ownership_history && historyData.ownership_history.length > 0 && (
            <>
              <View style={styles.ownershipInfo}>
                <StyledText variant="bodyLarge" style={[styles.ownershipCount, { color: primaryColor }]}>
                  Total Owners: {historyData.ownership_history.length}
                </StyledText>
              </View>
              {historyData.ownership_history.map((owner, index) => (
                <View key={index} style={styles.ownerItem}>
                  <View style={styles.ownerHeader}>
                    <View style={[styles.ownerIndicator, { backgroundColor: owner.is_current ? successColor : borderColor }]} />
                    <View style={styles.ownerDetails}>
                      <StyledText variant="labelLarge" style={{ color: textColor }}>
                        {owner.owner_name}
                      </StyledText>
                      {owner.is_current && (
                        <View style={[styles.currentBadge, { backgroundColor: successColor + "20" }]}>
                          <StyledText variant="labelSmall" style={{ color: successColor }}>
                            Current Owner
                          </StyledText>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.ownerDates}>
                    {owner.start_date && (
                      <StyledText variant="bodySmall" style={{ color: textColor }}>
                        <Ionicons name="calendar-outline" size={14} color={textColor} /> Started: {formatDate(owner.start_date)}
                      </StyledText>
                    )}
                    {owner.end_date && (
                      <StyledText variant="bodySmall" style={{ color: textColor }}>
                        <Ionicons name="calendar-outline" size={14} color={textColor} /> Ended: {formatDate(owner.end_date)}
                      </StyledText>
                    )}
                  </View>
                  {index < (historyData.ownership_history?.length || 0) - 1 && (
                    <View style={[styles.divider, { backgroundColor: borderColor }]} />
                  )}
                </View>
              ))}
            </>
          )}
        </View>

        {/* Events History */}
        {historyData.events && historyData.events.length > 0 && (
          <View style={[styles.card, { backgroundColor: cardColor, borderColor: borderColor }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="list-outline" size={24} color={primaryColor} />
              <StyledText variant="titleMedium" style={[styles.cardTitle, { color: textColor }]}>
                Vehicle Events ({historyData.total_events || historyData.events.length})
              </StyledText>
            </View>
            {historyData.events.map((event, index) => {
              const eventTypeIcons: Record<string, string> = {
                inspection: "checkmark-circle-outline",
                repair: "construct-outline",
                service: "build-outline",
                obd_scan: "hardware-chip-outline",
                damage: "warning-outline",
              };
              const eventTypeColors: Record<string, string> = {
                inspection: successColor,
                repair: warningColor,
                service: primaryColor,
                obd_scan: primaryColor,
                damage: errorColor,
              };
              const iconName = eventTypeIcons[event.event_type] || "list-outline";
              const iconColor = eventTypeColors[event.event_type] || primaryColor;
              
              return (
                <View key={event.id}>
                  <View style={styles.serviceItem}>
                    <View style={[styles.serviceIcon, { backgroundColor: iconColor + "20" }]}>
                      <Ionicons name={iconName as any} size={20} color={iconColor} />
                    </View>
                    <View style={styles.serviceDetails}>
                      <View style={styles.serviceHeader}>
                        <StyledText variant="labelLarge" style={{ color: textColor, textTransform: "capitalize" }}>
                          {event.event_type.replace("_", " ")}
                        </StyledText>
                        {event.visibility === "private" && (
                          <View style={[styles.visibilityBadge, { backgroundColor: borderColor }]}>
                            <Ionicons name="lock-closed" size={12} color={textColor} />
                          </View>
                        )}
                      </View>
                      {event.metadata?.notes && (
                        <StyledText variant="bodySmall" style={{ color: textColor, marginTop: 4 }}>
                          {event.metadata.notes}
                        </StyledText>
                      )}
                      {event.performed_by && (
                        <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.7, marginTop: 2 }}>
                          By: {event.performed_by.name}
                        </StyledText>
                      )}
                      <View style={styles.serviceMeta}>
                        <StyledText variant="bodySmall" style={{ color: textColor }}>
                          {formatDate(event.event_date)}
                        </StyledText>
                      </View>
                    </View>
                  </View>
                  {index < (historyData.events?.length || 0) - 1 && (
                    <View style={[styles.divider, { backgroundColor: borderColor }]} />
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    paddingTop: 40,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "BarlowMedium",
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 16,
    padding: 15,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    marginLeft: 12,
    fontFamily: "BarlowMedium",
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  overviewItem: {
    width: "50%",
    marginBottom: 16,
  },
  overviewLabel: {
    marginBottom: 4,
    opacity: 0.7,
  },
  overviewValue: {
    fontFamily: "BarlowMedium",
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  registrationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ownershipInfo: {
    marginBottom: 16,
  },
  ownershipCount: {
    fontFamily: "BarlowMedium",
  },
  ownerItem: {
    marginBottom: 12,
  },
  ownerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  ownerIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  ownerDetails: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ownerDates: {
    marginLeft: 20,
    gap: 4,
  },
  locationItem: {
    flexDirection: "row",
    marginBottom: 12,
  },
  locationIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  locationDetails: {
    flex: 1,
    gap: 4,
  },
  serviceItem: {
    flexDirection: "row",
    marginBottom: 8,
  },
  serviceIcon: {
    width: 30,
    height: 30,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  serviceDetails: {
    flex: 1,
    gap: 2,
  },
  serviceMeta: {
    marginTop: 4,
  },
  incidentItem: {
    flexDirection: "row",
    marginBottom: 12,
  },
  incidentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  incidentDetails: {
    flex: 1,
    gap: 4,
  },
  incidentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  additionalInfo: {
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  recallsSection: {
    marginTop: 8,
  },
  recallsTitle: {
    marginBottom: 12,
    fontFamily: "BarlowMedium",
  },
  recallItem: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 12,
  },
  recallStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
  },
  recallDetails: {
    flex: 1,
    gap: 4,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  purchaseInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
  },
  purchaseDetails: {
    flex: 1,
    gap: 4,
  },
  serviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  visibilityBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default VehicleHistoryScreen;
