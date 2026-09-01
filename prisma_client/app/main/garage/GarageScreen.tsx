import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useEffect, useState } from "react";
import StyledText from "@/app/components/helpers/StyledText";
import useGarage from "@/app/app-hooks/useGarage";
import GarageVehicleComponent from "@/app/components/garage/GarageVehicleComponent";
import { MaterialIcons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { router } from "expo-router";
import ModalServices from "@/app/utils/ModalServices";
import AddNewVehicle from "@/app/components/garage/AddNewVehicle";
import { useAppSelector, RootState } from "@/app/store/main_store";
import PendingTransfersSection from "@/app/components/garage/PendingTransfersSection";
import { ActivityIndicator } from "react-native-paper";
import { canUsePersonalGarage } from "@/app/utils/account";

const GarageScreen = () => {
  const {
    vehicles,
    vehiclesByBranch,
    isLoadingVehicles,
    handleDeleteVehicle,
    refetchVehicles,
    handleViewDetailsPress,
  } = useGarage();

  const user = useAppSelector((state: RootState) => state.auth.user);
  const isFleetOwner = user?.is_fleet_owner === true;
  const showGarage = canUsePersonalGarage(user);

  useEffect(() => {
    if (user && !showGarage) {
      router.replace("/main/bookings/BookingScreen");
    }
  }, [user, showGarage]);

  const backgroundColor = useThemeColor({}, "background");
  const iconColor = useThemeColor({}, "icons");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "borders");

  const [isAddVehicleModalVisible, setIsAddVehicleModalVisible] =
    useState(false);
  const [loadingVehicleId, setLoadingVehicleId] = useState<string | null>(null);

  if (user && !showGarage) {
    return null;
  }

  if (isLoadingVehicles) {
    return (
      <ActivityIndicator
        size="large"
        color={primaryColor}
        style={{ flex: 1, backgroundColor: backgroundColor }}
      />
    );
  }

  return (
    <View style={[styles.maincontainer, { backgroundColor }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isLoadingVehicles}
            onRefresh={() => refetchVehicles()}
          />
        }
      >
        <PendingTransfersSection onTransferResolved={refetchVehicles} />
        {/* Display the list of cars the user has added */}
        <View style={styles.myvehiclecontainer}>
          {isFleetOwner && vehiclesByBranch && vehiclesByBranch.length > 0 ? (
            // Fleet owner: Display vehicles grouped by branch
            <View style={styles.branchesContainer}>
              {vehiclesByBranch.map((branch) => (
                <View key={branch.branch_id} style={styles.branchSection}>
                  <View
                    style={[
                      styles.branchHeader,
                      { borderBottomColor: borderColor },
                    ]}
                  >
                    <StyledText
                      variant="titleMedium"
                      style={[styles.branchHeaderText, { color: textColor }]}
                    >
                      {branch.branch_name}
                    </StyledText>
                    <StyledText
                      variant="bodySmall"
                      style={[styles.branchVehicleCount, { color: textColor }]}
                    >
                      {branch.vehicles.length}{" "}
                      {branch.vehicles.length === 1 ? "vehicle" : "vehicles"}
                    </StyledText>
                  </View>
                  <View style={styles.vehiclesGrid}>
                    {branch.vehicles.map((vehicle, index) => (
                      <GarageVehicleComponent
                        key={`${branch.branch_id}-${vehicle.id}-${index}`}
                        vehicle={vehicle}
                        onViewDetailsPress={async () => {
                          setLoadingVehicleId(vehicle.id);
                          const success = await handleViewDetailsPress(
                            vehicle.id,
                          );
                          setLoadingVehicleId(null);
                          if (success) {
                            router.push({
                              pathname: "/main/garage/VehicleDetailsScreen",
                              params: { vehicleId: vehicle.id },
                            });
                          }
                        }}
                        onUploadDataPress={() => {
                          router.push({
                            pathname: "/main/garage/VehicleDataUploadScreen",
                            params: { vehicleId: vehicle.id },
                          });
                        }}
                        onDeletePress={() => handleDeleteVehicle(vehicle.id)}
                        isLoadingVehicleStats={loadingVehicleId === vehicle.id}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : vehicles && vehicles.length > 0 ? (
            // Branch admin or regular user: Display flat list
            <View style={styles.vehiclesGrid}>
              {vehicles.map((vehicle, index) => (
                <GarageVehicleComponent
                  key={index}
                  vehicle={vehicle}
                  onViewDetailsPress={async () => {
                    setLoadingVehicleId(vehicle.id);
                    const success = await handleViewDetailsPress(vehicle.id);
                    setLoadingVehicleId(null);
                    if (success) {
                      router.push({
                        pathname: "/main/garage/VehicleDetailsScreen",
                        params: { vehicleId: vehicle.id },
                      });
                    }
                  }}
                  onUploadDataPress={() => {
                    router.push({
                      pathname: "/main/garage/VehicleDataUploadScreen",
                      params: { vehicleId: vehicle.id },
                    });
                  }}
                  onDeletePress={() => handleDeleteVehicle(vehicle.id)}
                  isLoadingVehicleStats={loadingVehicleId === vehicle.id}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyStateContainer}>
              <MaterialIcons
                name="directions-car"
                size={80}
                color={iconColor}
                style={styles.emptyStateIcon}
              />
              <StyledText
                variant="titleMedium"
                style={[styles.emptyStateTitle, { color: textColor }]}
              >
                No Vehicles Yet
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.emptyStateDescription, { color: textColor }]}
              >
                You haven't added any vehicles to your garage yet. Add your
                first vehicle to get started with our services.
              </StyledText>
            </View>
          )}
        </View>
      </ScrollView>

      <ModalServices
        visible={isAddVehicleModalVisible}
        onClose={() => setIsAddVehicleModalVisible(false)}
        component={
          <AddNewVehicle
            setIsAddVehicleModalVisible={setIsAddVehicleModalVisible}
          />
        }
        modalType="fullscreen"
        animationType="slide"
        showCloseButton={true}
        title="Add New Vehicle"
      />

      {/* Floating action buttons */}
      {/* Add Vehicle Button */}
      <TouchableOpacity
        style={[
          {
            position: "absolute",
            width: 60,
            height: 60,
            justifyContent: "center",
            alignItems: "center",
            bottom: 70,
            right: 20,
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
          },
          {
            backgroundColor: primaryColor,
            borderColor: borderColor,
          },
        ]}
        onPress={() => setIsAddVehicleModalVisible(true)}
      >
        <MaterialIcons name="add" size={24} color={textColor} />
      </TouchableOpacity>
    </View>
  );
};

export default GarageScreen;

const styles = StyleSheet.create({
  maincontainer: {
    flex: 1,
  },
  myvehiclecontainer: {
    flex: 1,
    paddingHorizontal: 5,
    paddingBottom: 50,
  },
  vehiclesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 2,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    marginBottom: 20,
    opacity: 0.7,
  },
  emptyStateTitle: {
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "600",
  },
  emptyStateDescription: {
    textAlign: "center",
    lineHeight: 22,
    opacity: 0.8,
  },
  branchesContainer: {
    gap: 20,
    paddingBottom: 10,
  },
  branchSection: {
    gap: 5,
  },
  branchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 3,
    borderBottomWidth: 1,
    marginBottom: 2,
  },
  branchHeaderText: {
    fontWeight: "600",
    fontSize: 18,
  },
  branchVehicleCount: {
    fontSize: 12,
  },
});
