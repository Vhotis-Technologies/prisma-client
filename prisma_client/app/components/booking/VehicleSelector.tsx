import React from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Image,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { MyVehiclesProps } from "@/app/interfaces/GarageInterface";
import { vehicleBodyStyleRequiresSuvMpvSurcharge } from "@/app/utils/vehicleBodyStyle";
import StyledText from "@/app/components/helpers/StyledText";
import CircleCheckbox from "@/app/components/helpers/CircleCheckbox";
import LinearGradientComponent from "../helpers/LinearGradientComponent";

interface VehicleSelectorProps {
  vehicles: MyVehiclesProps[];
  selectedVehicle: MyVehiclesProps | null;
  onSelectVehicle: (vehicle: MyVehiclesProps) => void;
  onAddVehicle: () => void;
  isSUV: boolean;
  onSUVChange: (isSUV: boolean) => void;
  isExpressService?: boolean;
  onExpressServiceChange?: (isExpressService: boolean) => void;
}

const VehicleSelector: React.FC<VehicleSelectorProps> = ({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  onAddVehicle,
  isSUV,
  onSUVChange,
  isExpressService = false,
  onExpressServiceChange,
}) => {
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const primaryPurpleColor = useThemeColor({}, "primary");

  // Ensure vehicles is always an array
  const vehiclesList = Array.isArray(vehicles) ? vehicles : [];
  const suvRequiredByBodyStyle = selectedVehicle
    ? vehicleBodyStyleRequiresSuvMpvSurcharge(selectedVehicle.body_style)
    : false;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        <View style={styles.grid}>
          {vehiclesList.map((vehicle) => (
            <TouchableOpacity
              key={vehicle.id}
              style={[
                styles.vehicleCard,
                {
                  backgroundColor: cardColor,
                  borderColor:
                    selectedVehicle?.id === vehicle.id
                      ? primaryPurpleColor
                      : "#E5E5E5",
                },
              ]}
              onPress={() => onSelectVehicle(vehicle)}
            >
            <View style={styles.vehicleImageContainer}>
              {vehicle.image && typeof vehicle.image === "string" ? (
                <Image
                  source={{ uri: vehicle.image }}
                  style={styles.vehicleImage}
                />
              ) : (
                <Image
                  source={require("../../../assets/images/car.jpg")}
                  style={styles.vehicleImage}
                />
              )}
            </View>

            <LinearGradientComponent
              style={styles.vehicleInfo}
              color1={cardColor}
              color2={textColor}
              start={{ x: 0, y: 0 }}
              end={{ x: 3, y: 1 }}
            >
              <StyledText
                variant="titleMedium"
                style={[styles.vehicleName, { color: textColor }]}
              >
                {vehicle.make} {vehicle.model}
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.vehicleDetails, { color: textColor }]}
              >
                {vehicle.year} • {vehicle.color}
              </StyledText>
              <StyledText
                variant="bodySmall"
                style={[styles.licensePlate, { color: textColor }]}
              >
                {vehicle.licence?.toUpperCase() ?? ""}
              </StyledText>
            </LinearGradientComponent>

            {selectedVehicle?.id === vehicle.id && (
              <View
                style={[
                  styles.selectedIndicator,
                  { backgroundColor: primaryPurpleColor },
                ]}
              >
                <Ionicons name="checkmark" size={16} color="white" />
              </View>
            )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Empty State */}
      {vehiclesList.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: cardColor }]}>
          <Ionicons name="car-outline" size={48} color={textColor} />
          <StyledText
            variant="titleMedium"
            style={[styles.emptyTitle, { color: textColor }]}
          >
            No Vehicles Found
          </StyledText>
          <StyledText
            variant="bodyMedium"
            style={[styles.emptyText, { color: textColor }]}
          >
            Add a vehicle to get started with booking
          </StyledText>
          <TouchableOpacity
            style={[
              styles.addVehicleButton,
              { backgroundColor: primaryPurpleColor },
            ]}
            onPress={onAddVehicle}
          >
            <Ionicons name="add" size={20} color="white" />
            <StyledText
              variant="bodyMedium"
              style={styles.addVehicleButtonText}
            >
              Add Vehicle
            </StyledText>
          </TouchableOpacity>
        </View>
      )}

      {selectedVehicle && (
        <View style={[styles.suvSection]}>
          <StyledText variant="titleMedium" style={[styles.suvTitle]}>
            Vehicle Type
          </StyledText>
          <TouchableOpacity
            style={[
              styles.optionCard,
              {
                backgroundColor: isSUV ? primaryPurpleColor : cardColor,
                borderColor: isSUV ? primaryPurpleColor : "#E5E5E5",
              },
            ]}
            onPress={() => onSUVChange(!isSUV)}
            activeOpacity={0.7}
          >
            <View style={styles.optionRow}>
              <View style={styles.suvTextContainer}>
                <StyledText
                  variant="bodyMedium"
                  style={[
                    styles.suvText,
                    { color: isSUV ? "#FFFFFF" : textColor },
                  ]}
                >
                  SUV Vehicle / MPV Vehicle
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[
                    styles.suvDescription,
                    {
                      color: isSUV ? "rgba(255,255,255,0.9)" : textColor,
                      opacity: isSUV ? 1 : 0.7,
                    },
                  ]}
                >
                  Additional 15% surcharge for SUV / MPV cleaning
                </StyledText>
              </View>
              <CircleCheckbox checked={isSUV} accentColor={primaryPurpleColor} />
            </View>
          </TouchableOpacity>
          {suvRequiredByBodyStyle && !isSUV && (
            <StyledText
              variant="bodySmall"
              style={[styles.bodyStyleHint, { color: textColor }]}
            >
              {
                "This vehicle's registered body style requires the SUV / MPV option (15% surcharge)."
              }
            </StyledText>
          )}
        </View>
      )}

      {selectedVehicle && (
        <View style={[styles.suvSection]}>
          <StyledText variant="titleMedium" style={[styles.suvTitle]}>
            Service Options
          </StyledText>
          <TouchableOpacity
            style={[
              styles.optionCard,
              {
                backgroundColor: isExpressService
                  ? primaryPurpleColor
                  : cardColor,
                borderColor: isExpressService
                  ? primaryPurpleColor
                  : "#E5E5E5",
              },
            ]}
            onPress={() => onExpressServiceChange?.(!isExpressService)}
            activeOpacity={0.7}
          >
            <View style={styles.optionRow}>
              <View style={styles.suvTextContainer}>
                <StyledText
                  variant="bodyMedium"
                  style={[
                    styles.suvText,
                    { color: isExpressService ? "#FFFFFF" : textColor },
                  ]}
                >
                  Express Service
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[
                    styles.suvDescription,
                    {
                      color: isExpressService
                        ? "rgba(255,255,255,0.9)"
                        : textColor,
                      opacity: isExpressService ? 1 : 0.7,
                    },
                  ]}
                >
                  Faster service with 2 detailers - Additional €30
                </StyledText>
              </View>
              <CircleCheckbox
                checked={isExpressService}
                accentColor={primaryPurpleColor}
              />
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default VehicleSelector;

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  title: {
    fontWeight: "600",
  },
  addButton: {
    padding: 4,
  },
  scrollContainer: {
    padding: 8,
    paddingBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    justifyContent: "space-between",
  },
  vehicleCard: {
    width: "48%",
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  vehicleImageContainer: {
    width: "100%",
    height: 100,
    marginBottom: 2,
  },
  vehicleImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  vehicleInfo: {
    gap: 2,
    padding: 5,
  },
  vehicleName: {
    fontWeight: "600",
  },
  vehicleDetails: {
    opacity: 0.8,
  },
  licensePlate: {
    fontWeight: "500",
    opacity: 0.7,
  },
  selectedIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    marginTop: 12,
  },
  emptyTitle: {
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 20,
  },
  addVehicleButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addVehicleButtonText: {
    color: "white",
    fontWeight: "600",
    marginLeft: 8,
  },
  suvSection: {
    borderRadius: 20,
    padding: 10,
    marginVertical: 8,

  },
  suvTitle: {
    fontWeight: "600",
    marginBottom: 12,
  },
  optionCard: {
    width: "100%",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  suvTextContainer: {
    flex: 1,
  },
  suvText: {
    fontWeight: "500",
  },
  suvDescription: {
    marginTop: 2,
  },
  bodyStyleHint: {
    marginTop: 8,
    opacity: 0.9,
    lineHeight: 18,
  },
});
