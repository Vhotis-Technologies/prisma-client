import {
  StyleSheet,
  View,
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
import { LookupVehiclePreview } from "@/app/interfaces/GarageInterface";

/**
 * Wizard: licence lookup (Ireland) → preview confirm OR manual fallback (minimal fields).
 */
const MIN_VEHICLE_YEAR = 1900;
const MAX_VEHICLE_YEAR = new Date().getFullYear();

type WizardStep = "lookup" | "preview" | "manual";

const AddNewVehicleScreen = ({
  setIsAddVehicleModalVisible,
}: {
  setIsAddVehicleModalVisible: (visible: boolean) => void;
}) => {
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("lookup");
  const [lookupToken, setLookupToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<LookupVehiclePreview | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "borders");
  const cardColor = useThemeColor({}, "cards");

  const user = useAppSelector((state: RootState) => state.auth.user);

  const { data: branchesData } = useGetBranchesQuery(undefined, {
    skip: !user?.is_fleet_owner,
  });
  const branches = branchesData?.branches || [];

  const {
    newVehicle,
    collectNewVehicleData,
    handleSubmit,
    isLoadingVehicles,
    isAddingNewVehicle,
    isLookupRegistrationLoading,
    lookupVehicleRegistration,
    confirmLookupVehicle,
    isImageModalVisible,
    showImageSelectionModal,
    hideImageSelectionModal,
    handleCameraSelection,
    handleFileSelection,
  } = useGarage();

  useEffect(() => {
    if (
      user?.is_branch_admin &&
      user?.managed_branch?.id &&
      !newVehicle?.branch_id
    ) {
      collectNewVehicleData("branch_id", user.managed_branch.id);
    }
  }, [user?.is_branch_admin, user?.managed_branch?.id]);

  useEffect(() => {
    collectNewVehicleData("country", "Ireland");
  }, []);

  const selectedBranch = branches.find((b) => b.id === newVehicle?.branch_id);
  const branchAdminBranch = user?.managed_branch;

  const handleBranchSelect = (branchId: string) => {
    collectNewVehicleData("branch_id", branchId);
    setShowBranchModal(false);
  };

  const handleYearChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, "").slice(0, 4);
    collectNewVehicleData("year", digitsOnly === "" ? ("" as any) : digitsOnly);
    if (digitsOnly.length === 4) {
      const yearNum = parseInt(digitsOnly, 10);
      if (yearNum < MIN_VEHICLE_YEAR || yearNum > MAX_VEHICLE_YEAR) {
        setYearError(
          `Enter a year between ${MIN_VEHICLE_YEAR} and ${MAX_VEHICLE_YEAR}`,
        );
      } else {
        setYearError(null);
      }
    } else {
      setYearError(null);
    }
  };

  /* Method is designed to call the lookupVehicleRegistration mutation to get the vehicle details using the registration number, from the server. */
  const runLookup = async () => {
    setLookupError(null);
    const reg = (newVehicle?.licence || "").trim();
    if (!reg) {
      setLookupError("Enter your registration number.");
      return;
    }
    try {
      const res = await lookupVehicleRegistration({
        licence: reg,
        registration_number: reg,
        country: newVehicle?.country || "Ireland",
      }).unwrap();
      setPreview(res.preview);
      setLookupToken(res.lookup_token);
      setWizardStep("preview");
    } catch (e: any) {
      const msg =
        e?.data?.error ||
        e?.error ||
        "We could not look up this registration. Try again or enter your vehicle manually.";
      setLookupError(String(msg));
    }
  };

  /* Allows the user to enter their vehicle details manually, if the lookup fails. */
  const goManual = () => {
    collectNewVehicleData("entry_mode", "manual");
    collectNewVehicleData("country", newVehicle?.country || "Ireland");
    collectNewVehicleData(
      "licence",
      (newVehicle?.licence || "").trim().toUpperCase(),
    );
    setWizardStep("manual");
    setLookupError(null);
  };

  /* Confirms the lookup vehicle details and saves the vehicle to the database. */
  const onConfirmLookup = async () => {
    if (!lookupToken) return;
    if (user?.is_fleet_owner && !newVehicle?.branch_id) {
      setLookupError("Select a branch for this vehicle.");
      return;
    }
    try {
      await confirmLookupVehicle(lookupToken, {
        branchId: newVehicle?.branch_id,
      });
      setIsAddVehicleModalVisible(false);
    } catch (e: any) {
      const msg = e?.data?.error || e?.error || "Could not save this vehicle.";
      setLookupError(String(msg));
    }
  };

  /* Allows the user to select a branch for the vehicle, if they are a fleet owner. */
  const branchPickerFleet = user?.is_fleet_owner ? (
    <View style={styles.branchSection}>
      <StyledText variant="labelMedium">Branch *</StyledText>
      <TouchableOpacity
        style={[
          styles.branchSelector,
          { borderColor, backgroundColor: cardColor },
        ]}
        onPress={() => setShowBranchModal(true)}
      >
        <StyledText
          variant="bodyMedium"
          style={[
            styles.branchSelectorText,
            { color: selectedBranch ? textColor : textColor + "80" },
          ]}
        >
          {selectedBranch
            ? `${selectedBranch.name}${selectedBranch.city ? ` - ${selectedBranch.city}` : ""}`
            : "Select a branch"}
        </StyledText>
        <Ionicons name="chevron-down" size={20} color={textColor} />
      </TouchableOpacity>
    </View>
  ) : null;

  /* Displays the branch that the user is a branch admin for, if they are a branch admin. */
  const branchReadOnlyAdmin =
    user?.is_branch_admin && branchAdminBranch ? (
      <View style={styles.branchSection}>
        <StyledText variant="labelMedium">Branch</StyledText>
        <View
          style={[
            styles.branchDisplay,
            { borderColor, backgroundColor: cardColor },
          ]}
        >
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            {branchAdminBranch.name}
            {branchAdminBranch.city ? ` - ${branchAdminBranch.city}` : ""}
          </StyledText>
        </View>
      </View>
    ) : null;

  /* Displays the main component of the Add New Vehicle screen. */
  return (
    <View style={{ flex: 1 }}>
      <View
        style={[styles.mainContainer]}
      >
        <View style={[styles.card]}>
          {wizardStep === "lookup" && (
            <View style={styles.formSection}>
              <StyledText variant="labelLarge">
                Look up vehicle (Ireland)
              </StyledText>
              <StyledText
                variant="bodySmall"
                style={{ marginBottom: 8 }}
              >
                Enter your registration—we will fetch details from the motor
                registry. If lookup fails, you can add the vehicle manually.
              </StyledText>
              <StyledTextInput
                label="Licence plate"
                placeholder="e.g. 141W1184"
                value={newVehicle?.licence || ""}
                onChangeText={(text) =>
                  collectNewVehicleData(
                    "licence",
                    text.toUpperCase().replace(/\s+/g, ""),
                  )
                }
                autoCapitalize="characters"
              />
              <StyledTextInput
                label="Country"
                value={newVehicle?.country || "Ireland"}
                onChangeText={(text) => collectNewVehicleData("country", text)}
              />
              {lookupError ? (
                <StyledText
                  variant="bodySmall"
                  style={{ color: "#c62828", marginVertical: 6 }}
                >
                  {lookupError}
                </StyledText>
              ) : null}
              <StyledButton
                title={
                  isLookupRegistrationLoading
                    ? "Looking up…"
                    : "Look up registration"
                }
                onPress={runLookup}
                variant="medium"
                disabled={
                  isLookupRegistrationLoading ||
                  isAddingNewVehicle ||
                  !(newVehicle?.licence || "").trim()
                }
              />
              <View style={{ height: 12 }} />
              <StyledButton
                title="Skip — enter manually"
                onPress={goManual}
                variant="medium"
                disabled={isAddingNewVehicle}
              />
            </View>
          )}

          {/* Displays the preview of the vehicle details, if the lookup is successful. */}
          {wizardStep === "preview" && preview && (
            <View style={styles.formSection}>
              <StyledText variant="labelMedium">
                Is this your vehicle?
              </StyledText>
              <View
                style={[
                  styles.previewCard,
                  { borderColor, backgroundColor: cardColor },
                ]}
              >
                {preview.image_url ? (
                  <Image
                    source={{ uri: preview.image_url }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[styles.previewImagePlaceholder, { borderColor }]}
                  >
                    <Ionicons name="car-outline" size={40} color={textColor} />
                  </View>
                )}
                <StyledText
                  variant="bodyMedium"
                  style={{ color: textColor, marginTop: 8 }}
                >
                  {preview.make} {preview.model} ({preview.year})
                </StyledText>
                <StyledText variant="bodySmall" style={{ color: textColor }}>
                  Registration: {preview.registration_number}
                </StyledText>
                {preview.color ? (
                  <StyledText variant="bodySmall" style={{ color: textColor }}>
                    Colour: {preview.color}
                  </StyledText>
                ) : null}
                {preview.body_style ? (
                  <StyledText variant="bodySmall" style={{ color: textColor }}>
                    Body: {preview.body_style}
                  </StyledText>
                ) : null}
              </View>
              {lookupError ? (
                <StyledText
                  variant="bodySmall"
                  style={{ color: "#c62828", marginVertical: 6 }}
                >
                  {lookupError}
                </StyledText>
              ) : null}
              {branchPickerFleet}
              {branchReadOnlyAdmin}
              <StyledButton
                title={isAddingNewVehicle ? "Saving…" : "Yes, add this vehicle"}
                onPress={onConfirmLookup}
                variant="medium"
                disabled={
                  isAddingNewVehicle ||
                  !!(user?.is_fleet_owner && !newVehicle?.branch_id)
                }
              />
              <View style={{ height: 10 }} />
              <StyledButton
                title="Not my vehicle — enter manually"
                onPress={goManual}
                variant="medium"
                disabled={isAddingNewVehicle}
              />
              <View style={{ height: 10 }} />
              <StyledButton
                title="Back"
                onPress={() => {
                  setWizardStep("lookup");
                  setLookupToken(null);
                  setPreview(null);
                  setLookupError(null);
                }}
                variant="medium"
                disabled={isAddingNewVehicle}
              />
            </View>
          )}

          {/* Displays the manual entry of the vehicle details, if the lookup is unsuccessful. */}
          {wizardStep === "manual" && (
            <View style={styles.formSection}>
              <StyledText variant="labelLarge">
                Vehicle information (manual)
              </StyledText>

              <StyledTextInput
                label="Make"
                placeholder="e.g., Toyota"
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
              {yearError ? (
                <StyledText
                  variant="bodySmall"
                  style={[styles.fieldError, { color: "#c62828" }]}
                >
                  {yearError}
                </StyledText>
              ) : null}
              <StyledTextInput
                label="Color"
                placeholder="e.g., Red"
                value={newVehicle?.color || ""}
                onChangeText={(text) => collectNewVehicleData("color", text)}
              />

              {branchPickerFleet}
              {branchReadOnlyAdmin}

              <View style={styles.imageSection}>
                <StyledText variant="labelMedium">Vehicle photo *</StyledText>
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
              </View>
              <StyledButton
                title="Back to lookup"
                onPress={() => setWizardStep("lookup")}
                variant="tonal"
                disabled={isAddingNewVehicle}
              />
            </View>
          )}
        </View>

        {wizardStep === "manual" ? (
          <View style={styles.submitContainer}>
            {isLoadingVehicles || isAddingNewVehicle ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <StyledButton
                title={"Save vehicle"}
                onPress={async () => {
                  await handleSubmit();
                  setIsAddVehicleModalVisible(false);
                }}
                variant="medium"
                disabled={
                  isLoadingVehicles || isAddingNewVehicle || !!yearError
                }
              />
            )}
          </View>
        ) : null}
      </View>

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
                      {item.city ? (
                        <StyledText variant="bodySmall">{item.city}</StyledText>
                      ) : null}
                    </View>
                    {newVehicle?.branch_id === item.id ? (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={primaryColor}
                      />
                    ) : null}
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
  mainContainer: { flex: 1, padding: 10, paddingBottom: 32 },
  card: { margin: 5 },
  formSection: { gap: 6},
  fieldError: { marginTop: -4, marginBottom: 4 },
  submitContainer: { padding: 20, paddingTop: 10 },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  previewImage: { width: "100%", height: 140, borderRadius: 10 },
  previewImagePlaceholder: {
    width: "100%",
    height: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  imageSection: { marginTop: 10, gap: 8 },
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
  imagePreview: { width: "100%", height: "100%", resizeMode: "cover" },
  imagePlaceholder: { justifyContent: "center", alignItems: "center", gap: 8 },
  imagePlaceholderText: { opacity: 0.7 },
  imageModalContent: { padding: 20, gap: 16 },
  imageOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  imageOptionText: { fontWeight: "500" },
  branchSection: { marginTop: 10, gap: 8 },
  branchSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
  },
  branchSelectorText: { flex: 1 },
  branchDisplay: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  branchList: { maxHeight: 220 },
  branchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 10,
  },
  branchItemContent: { flex: 1, gap: 2 },
  branchItemText: { fontSize: 16 },
  emptyState: { padding: 40, alignItems: "center" },
  emptyStateText: { textAlign: "center" },
});
