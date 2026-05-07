import {
  ScrollView,
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import { formatCurrency, formatDate } from "@/app/utils/methods";
import { useGetVehicleStatsQuery } from "@/app/store/api/garageApi";
import VehicleInspectionSection from "@/app/components/garage/VehicleInspectionSection";
import { useImageDownload } from "@/app/utils/imageDownload";

const VehicleDetailsScreen = () => {
  const params = useLocalSearchParams();
  const vehicleId = params.vehicleId as string;

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icons");
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "borders");
  const cardBackgroundColor = useThemeColor({}, "cards");

  const {
    data: vehicleStats,
    isLoading,
    refetch,
    isFetching,
  } = useGetVehicleStatsQuery(vehicleId, {
    skip: !vehicleId,
  });

  const vehicle = vehicleStats?.vehicle;
  const { share } = useImageDownload();
  const [isSharing, setIsSharing] = React.useState(false);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <StyledText variant="titleLarge" style={{ color: textColor }}>
            Vehicle Details
          </StyledText>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 12 }}>
            Loading vehicle details...
          </StyledText>
        </View>
      </View>
    );
  }

  if (!vehicle || !vehicleStats) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <StyledText variant="titleLarge" style={{ color: textColor }}>
            Vehicle Details
          </StyledText>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={48} color={iconColor} />
          <StyledText variant="bodyLarge" style={{ color: textColor, marginTop: 16, textAlign: "center" }}>
            Vehicle not found
          </StyledText>
          <StyledButton
            title="Go Back"
            variant="tonal"
            onPress={() => router.back()}
            style={{ marginTop: 20 }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor={primaryColor}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Vehicle Image and Basic Info Card */}
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <View style={styles.imageContainer}>
            {vehicle.image?.uri || (vehicle.image && typeof vehicle.image === "string") ? (
              <View style={styles.imageWrapper}>
                <Image
                  source={{
                    uri: vehicle.image?.uri || vehicle.image,
                  }}
                  style={styles.vehicleImage}
                />
                <View style={styles.imageOverlay}>
                  <TouchableOpacity
                    style={[styles.shareButton, { backgroundColor: "rgba(0, 0, 0, 0.6)" }]}
                    onPress={async () => {
                      const imageUrl = vehicle.image?.uri || vehicle.image;
                      if (imageUrl && typeof imageUrl === "string") {
                        setIsSharing(true);
                        try {
                          await share(imageUrl);
                        } catch (error) {
                          console.error("Error sharing image:", error);
                        } finally {
                          setIsSharing(false);
                        }
                      }
                    }}
                    disabled={isSharing}
                    activeOpacity={0.7}
                  >
                    {isSharing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <MaterialIcons name="share" size={20} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.placeholderImage, { backgroundColor: borderColor }]}>
                <MaterialIcons name="directions-car" size={64} color={iconColor} />
              </View>
            )}
          </View>

          <View style={styles.vehicleTitleSection}>
            <StyledText
              variant="headlineSmall"
              style={[styles.vehicleTitle, { color: textColor }]}
            >
              {vehicle.year} {vehicle.make} {vehicle.model}
            </StyledText>

            <View style={styles.vehicleInfoGrid}>
              <View style={styles.infoItem}>
                <Ionicons name="color-palette-outline" size={20} color={vehicle.color?.toLowerCase() || iconColor} />
                <View style={styles.infoItemText}>
                  <StyledText variant="bodySmall" style={{ color: iconColor }}>
                    Color
                  </StyledText>
                  <StyledText variant="bodyMedium" style={{ color: textColor, fontWeight: "500" }}>
                    {vehicle.color || "N/A"}
                  </StyledText>
                </View>
              </View>

              <View style={styles.infoItem}>
                <Ionicons name="card-outline" size={20} color={iconColor} />
                <View style={styles.infoItemText}>
                  <StyledText variant="bodySmall" style={{ color: iconColor }}>
                    Registration
                  </StyledText>
                  <StyledText variant="bodyMedium" style={{ color: textColor, fontWeight: "500" }}>
                    {vehicle.licence?.toUpperCase() || "N/A"}
                  </StyledText>
                </View>
              </View>

            </View>
          </View>
        </View>

        {/* Statistics Card */}
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
            Service Statistics
          </StyledText>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: backgroundColor }]}>
              <View style={[styles.statIconContainer, { backgroundColor: `${primaryColor}15` }]}>
                <Ionicons name="calendar-outline" size={24} color={primaryColor} />
              </View>
              <StyledText variant="headlineSmall" style={{ color: textColor, fontWeight: "700" }}>
                {vehicleStats.total_bookings || 0}
              </StyledText>
              <StyledText variant="bodySmall" style={{ color: iconColor }}>
                Total Bookings
              </StyledText>
            </View>

            <View style={[styles.statCard, { backgroundColor: backgroundColor }]}>
              <View style={[styles.statIconContainer, { backgroundColor: "#28a74515" }]}>
                <Ionicons name="cash-outline" size={24} color="#28a745" />
              </View>
              <StyledText variant="headlineSmall" style={{ color: textColor, fontWeight: "700" }}>
                {formatCurrency(vehicleStats.total_amount || 0)}
              </StyledText>
              <StyledText variant="bodySmall" style={{ color: iconColor }}>
                Total Spent
              </StyledText>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: backgroundColor }]}>
              <View style={[styles.statIconContainer, { backgroundColor: "#ffc10715" }]}>
                <Ionicons name="time-outline" size={24} color="#ffc107" />
              </View>
              <StyledText variant="bodyLarge" style={{ color: textColor, fontWeight: "600" }}>
                {formatDate(vehicleStats.last_cleaned) || "Never"}
              </StyledText>
              <StyledText variant="bodySmall" style={{ color: iconColor }}>
                Last Cleaned
              </StyledText>
            </View>

            <View style={[styles.statCard, { backgroundColor: backgroundColor }]}>
              <View style={[styles.statIconContainer, { backgroundColor: "#dc354515" }]}>
                <Ionicons name="notifications-outline" size={24} color="#dc3545" />
              </View>
              <StyledText variant="bodyLarge" style={{ color: textColor, fontWeight: "600" }}>
                {formatDate(vehicleStats.next_recommended_service) || "Not scheduled"}
              </StyledText>
              <StyledText variant="bodySmall" style={{ color: iconColor }}>
                Next Service
              </StyledText>
            </View>
          </View>
        </View>

        {/* Inspection Section */}
        <VehicleInspectionSection inspection={vehicleStats.latest_inspection} />

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          {/* his will be hidden for now until we have launched, and the system is tested */}
{/*           <StyledButton
            title="Document Service/Inspection"
            variant="large"
            onPress={() => {
              router.push({
                pathname: "/main/garage/VehicleDataUploadScreen",
                params: { vehicleId: vehicle.id },
              });
            }}
            style={styles.actionButton}
            icon={<MaterialIcons name="upload-file" size={20} color="white" />}
          /> */}

          <StyledButton
            title="Book A Wash"
            variant="tonal"
            onPress={() => {
              router.push("/main/bookings/BookingScreen");
            }}
            style={styles.actionButton}
            icon={<MaterialIcons name="local-car-wash" size={20} color={textColor} />}
          />
        </View>
      </ScrollView>
    </View>
  );
};

export default VehicleDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  scrollView: {
    flex: 1,
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
    paddingHorizontal: 24,
  },
  card: {
    margin: 10,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  imageContainer: {
    marginHorizontal: -12,
    marginTop: -12,
    marginBottom: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  imageWrapper: {
    width: "100%",
    height: 350,
    position: "relative",
  },
  vehicleImage: {
    width: "100%",
    height: 350,
    resizeMode: "cover",
  },
  imageOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderImage: {
    width: "100%",
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  vehicleTitleSection: {
    marginTop: 8,
  },
  vehicleTitle: {
    fontWeight: "700",
    marginBottom: 16,
  },
  vehicleInfoGrid: {
    gap: 16,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoItemText: {
    flex: 1,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  actionSection: {
    paddingHorizontal: 16,
    paddingBottom: 70,
    gap: 12,
  },
  actionButton: {
    marginBottom: 0,
  },
});
