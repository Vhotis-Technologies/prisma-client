import {
  StyleSheet,
  View,
  Keyboard,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import React, { useState, useEffect } from "react";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import StyledText from "@/app/components/helpers/StyledText";
import useGarage from "@/app/app-hooks/useGarage";
import StyledButton from "@/app/components/helpers/StyledButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import ModalServices from "@/app/utils/ModalServices";
import { useAppSelector, RootState } from "@/app/store/main_store";
import { useGetBranchesQuery } from "@/app/store/api/fleetApi";

/**
 * AddNewVehicleScreen Component
 *
 * A clean, presentation-only component for collecting vehicle information.
 * All business logic and state management is handled by the useGarage hook.
 * This component focuses purely on rendering the UI and delegating user interactions to the hook.
 */
const MIN_VEHICLE_YEAR = 1900;
const MAX_VEHICLE_YEAR = new Date().getFullYear();

const AddNewVehicleScreen = ({
  setIsAddVehicleModalVisible,
}: {
  setIsAddVehicleModalVisible: (visible: boolean) => void;
}) => {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);

  // Theme colors
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "borders");
  const cardColor = useThemeColor({}, "cards");

  // Get user from Redux store
  const user = useAppSelector((state: RootState) => state.auth.user); 

  // Fetch branches if fleet owner
  const { data: branchesData } = useGetBranchesQuery(undefined, {
    skip: !user?.is_fleet_owner,
  });

  const branches = branchesData?.branches || [];

  // Extract all needed methods and state from the useGarage hook
  const {
    newVehicle,
    collectNewVehicleData,
    handleSubmit,
    isLoadingVehicles,
    isAddingNewVehicle,
    isImageModalVisible,
    showImageSelectionModal,
    hideImageSelectionModal,
    handleCameraSelection,
    handleFileSelection,
  } = useGarage();

  // Auto-set branch for branch admin
  useEffect(() => {
    if (user?.is_branch_admin && user?.managed_branch?.id && !newVehicle?.branch_id) {
      collectNewVehicleData("branch_id", user.managed_branch.id);
    }
  }, [user?.is_branch_admin, user?.managed_branch?.id]);

  // Get selected branch info
  const selectedBranch = branches.find(
    (b) => b.id === newVehicle?.branch_id
  );
  const branchAdminBranch = user?.managed_branch;

  const handleBranchSelect = (branchId: string) => {
    collectNewVehicleData("branch_id", branchId);
    setShowBranchModal(false);
  };

  const handleYearChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, "").slice(0, 4);
    collectNewVehicleData("year", digitsOnly);
    if (digitsOnly.length === 4) {
      const yearNum = parseInt(digitsOnly, 10);
      if (yearNum < MIN_VEHICLE_YEAR || yearNum > MAX_VEHICLE_YEAR) {
        setYearError(`Enter a year between ${MIN_VEHICLE_YEAR} and ${MAX_VEHICLE_YEAR}`);
      } else {
        setYearError(null);
      }
    } else {
      setYearError(null);
    }
  };

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      () => {
        setKeyboardVisible(true);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.mainContainer, styles.scrollContent]}>
        <View style={[styles.card]}>
          {/* Vehicle Information Form */}
          <View style={styles.formSection}>
            <StyledText variant="labelMedium">Vehicle Information</StyledText>

            <StyledTextInput
              label="Make"
              placeholder="e.g., Toyota, Honda, Ford"
              value={newVehicle?.make || ""}
              onChangeText={(text) => collectNewVehicleData("make", text)}
            />

            <StyledTextInput
              label="Model"
              value={newVehicle?.model || ""}
              onChangeText={(text) => collectNewVehicleData("model", text)}
            />

            <StyledTextInput
              label="Year"
              placeholder={`e.g., ${MAX_VEHICLE_YEAR}`}
              value={newVehicle?.year?.toString() || ""}
              onChangeText={handleYearChange}
              keyboardType="numeric"
              maxLength={4}
            />
            {yearError && (
              <StyledText variant="bodySmall" style={[styles.fieldError, { color: "#c62828" }]}>
                {yearError}
              </StyledText>
            )}

            <StyledTextInput
              label="Color"
              placeholder="e.g., Red, Blue, Silver"
              value={newVehicle?.color || ""}
              onChangeText={(text) => collectNewVehicleData("color", text)}
            />

            <StyledTextInput
              label="VIN (Vehicle Identification Number)"
              placeholder="e.g., 1HGBH41JXMN109186"
              value={newVehicle?.vin || ""}
              onChangeText={(text) => collectNewVehicleData("vin", text.toUpperCase())}
              maxLength={17}
              autoCapitalize="characters"
            />

            <StyledTextInput
              label="License Plate"
              placeholder="e.g., ABC123"
              value={newVehicle?.licence || ""}
              maxLength={12}
              onChangeText={(text) => collectNewVehicleData("licence", text.toUpperCase())}
              autoCapitalize="characters"
            />

            {/* Branch Selection (for fleet owners) */}
            {user?.is_fleet_owner && (
              <View style={styles.branchSection}>
                <StyledText variant="labelMedium">Branch *</StyledText>
                <TouchableOpacity
                  style={[styles.branchSelector, { borderColor, backgroundColor: cardColor }]}
                  onPress={() => setShowBranchModal(true)}
                >
                  <StyledText
                    variant="bodyMedium"
                    style={[
                      styles.branchSelectorText,
                      {
                        color: selectedBranch ? textColor : textColor + "80",
                      },
                    ]}
                  >
                    {selectedBranch
                      ? `${selectedBranch.name}${selectedBranch.city ? ` - ${selectedBranch.city}` : ""}`
                      : "Select a branch"}
                  </StyledText>
                  <Ionicons name="chevron-down" size={20} color={textColor} />
                </TouchableOpacity>
                {selectedBranch && (
                  <StyledText variant="bodySmall" style={[styles.branchInfo, { color: textColor + "80" }]}>
                    {selectedBranch.address && `${selectedBranch.address}, `}
                    {selectedBranch.postcode && `${selectedBranch.postcode}, `}
                    {selectedBranch.city}
                  </StyledText>
                )}
              </View>
            )}

            {/* Branch Display (for branch admins - read-only) */}
            {user?.is_branch_admin && branchAdminBranch && (
              <View style={styles.branchSection}>
                <StyledText variant="labelMedium">Branch</StyledText>
                <View style={[styles.branchDisplay, { borderColor, backgroundColor: cardColor }]}>
                  <StyledText variant="bodyMedium" style={{ color: textColor }}>
                    {branchAdminBranch.name}
                    {branchAdminBranch.city ? ` - ${branchAdminBranch.city}` : ""}
                  </StyledText>
                </View>
                {branchAdminBranch.address && (
                  <StyledText variant="bodySmall" style={[styles.branchInfo, { color: textColor + "80" }]}>
                    {branchAdminBranch.address}
                    {branchAdminBranch.postcode && `, ${branchAdminBranch.postcode}`}
                    {branchAdminBranch.city && `, ${branchAdminBranch.city}`}
                  </StyledText>
                )}
              </View>
            )}

            {/* Vehicle Image Section */}
            <View style={styles.imageSection}>
              <StyledText variant="labelMedium">Vehicle Image</StyledText>
              <TouchableOpacity
                style={[styles.imagePickerButton, { borderColor }]}
                onPress={showImageSelectionModal}
              >
                {newVehicle?.image?.uri ? (
                  <Image
                    source={{ uri: newVehicle.image.uri }}
                    style={styles.imagePreview}
                  />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons
                      name="camera-outline"
                      size={32}
                      color={textColor}
                    />
                    <StyledText
                      variant="bodySmall"
                      style={[
                        styles.imagePlaceholderText,
                        { color: textColor },
                      ]}
                    >
                      Tap to add image
                    </StyledText>
                  </View>
                )}
              </TouchableOpacity>
              {newVehicle?.image?.uri && (
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => collectNewVehicleData("image", null)}
                >
                  <Ionicons name="trash-outline" size={18} color={textColor} />
                  <StyledText
                    variant="bodySmall"
                    style={[styles.removeImageText, { color: textColor }]}
                  >
                    Remove Image
                  </StyledText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Submit Button */}
        <View style={styles.submitContainer}>
          {isLoadingVehicles || isAddingNewVehicle ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <StyledButton
              title={"Add New Vehicle"}
              onPress={async () => {
                await handleSubmit();
                setIsAddVehicleModalVisible(false);
              }}
              variant="medium"
              disabled={isLoadingVehicles || isAddingNewVehicle || !!yearError}
            />
          )}
        </View>
      </View>

      {/* Image Selection Modal */}
      <ModalServices
        visible={isImageModalVisible}
        onClose={hideImageSelectionModal}
        modalType="center"
        animationType="fade"
        showCloseButton={true}
        title="Select Image Source"
        component={
          <View style={styles.imageModalContent}>
            <TouchableOpacity
              style={[styles.imageOptionButton, { borderColor }]}
              onPress={handleCameraSelection}
            >
              <Ionicons name="camera" size={32} color={primaryColor} />
              <StyledText
                variant="bodyMedium"
                style={[styles.imageOptionText, { color: textColor }]}
              >
                Take Photo
              </StyledText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.imageOptionButton, { borderColor }]}
              onPress={handleFileSelection}
            >
              <Ionicons name="images-outline" size={32} color={primaryColor} />
              <StyledText
                variant="bodyMedium"
                style={[styles.imageOptionText, { color: textColor }]}
              >
                Choose from Gallery
              </StyledText>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Branch Selection Modal (for fleet owners) */}
      {user?.is_fleet_owner && (
        <ModalServices
          visible={showBranchModal}
          onClose={() => setShowBranchModal(false)}
          modalType="center"
          animationType="fade"
          showCloseButton={true}
          title="Select Branch"
          component={
            branches.length === 0 ? (
              <View style={styles.emptyState}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.emptyStateText, { color: textColor }]}
                >
                  No branches available. Please create a branch first.
                </StyledText>
              </View>
            ) : (
              <View style={styles.branchList}>
                {branches.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.branchItem,
                      newVehicle?.branch_id === item.id && {
                        backgroundColor: primaryColor + "20",
                      },
                      { borderBottomColor: borderColor },
                    ]}
                    onPress={() => handleBranchSelect(item.id)}
                  >
                    <View style={styles.branchItemContent}>
                      <StyledText
                        variant="bodyMedium"
                        style={[
                          styles.branchItemText,
                          {
                            color:
                              newVehicle?.branch_id === item.id
                                ? primaryColor
                                : textColor,
                            fontWeight:
                              newVehicle?.branch_id === item.id ? "600" : "400",
                          },
                        ]}
                      >
                        {item.name}
                      </StyledText>
                      {item.city && (
                        <StyledText
                          variant="bodySmall"
                        >
                          {item.city}
                        </StyledText>
                      )}
                    </View>
                    {newVehicle?.branch_id === item.id && (
                      <Ionicons name="checkmark" size={20} color={primaryColor} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )
          }
        />
      )}
    </View>
  );
};

export default AddNewVehicleScreen;

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding:10,
  },
  header: {
    padding: 5,
    paddingBottom: 10,
  },

  card: {
    margin: 5,
  },
  formSection: {
    gap: 5,
    marginVertical: 5,
  },
  fieldError: {
    marginTop: -4,
    marginBottom: 4,
  },

  submitContainer: {
    padding: 20,
    paddingTop: 10,
  },
  submitButton: {
    borderRadius: 12,
    backgroundColor: "#007AFF",
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
  submitButtonText: {
    color: "white",
    fontWeight: "600",
  },
  imageSection: {
    marginTop: 10,
    gap: 8,
  },
  imagePickerButton: {
    width: "100%",
    height: 150,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  imagePlaceholderText: {
    opacity: 0.7,
  },
  removeImageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  removeImageText: {
    fontSize: 12,
  },
  imageModalContent: {
    padding: 20,
    gap: 16,
  },
  imageOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  imageOptionText: {
    fontWeight: "500",
  },
  branchSection: {
    marginTop: 10,
    gap: 8,
  },
  branchSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
  },
  branchSelectorText: {
    flex: 1,
  },
  branchDisplay: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  branchInfo: {
    marginTop: 4,
    paddingLeft: 4,
  },
  branchList: {
    maxHeight: 200,
  },
  branchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 10,
  },
  branchItemContent: {
    flex: 1,
    gap: 2,
  },
  branchItemText: {
    fontSize: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyStateText: {
    textAlign: "center",
  },
});
