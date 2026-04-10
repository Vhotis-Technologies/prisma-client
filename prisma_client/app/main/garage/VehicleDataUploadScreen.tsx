import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
} from "react-native";
import React, { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector, RootState } from "@/app/store/main_store";
import { setFormData as setFormDataAction, setFullFormData, clearFormData, loadFormData } from "@/app/store/slices/vehicleDataUploadSlice";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import StyledButton from "@/app/components/helpers/StyledButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useGetMyVehiclesQuery, useCreateVehicleEventMutation } from "@/app/store/api/garageApi";
import { CreateVehicleEventRequest, VehicleEventMetadata } from "@/app/interfaces/GarageInterface";
import { API_CONFIG } from "@/constants/Config";
import { useAlertContext } from "@/app/contexts/AlertContext";

interface VehicleDocumentForm {
  event_type: "inspection" | "repair" | "service" | "obd_scan" | "damage";
  event_date: Date;
  country: string;
  inspection_type?: string;
  mileage?: string;
  result: "passed" | "failed" | "pending";
  notes?: string;
  metadata: VehicleEventMetadata;
  visibility: "public" | "private";
}

const EU_COUNTRIES = [
  "United Kingdom",
  "Ireland",
  "France",
  "Germany",
  "Spain",
  "Italy",
  "Portugal",
  "Netherlands",
  "Belgium",
  "Austria",
  "Switzerland",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Poland",
  "Czech Republic",
  "Hungary",
  "Romania",
  "Bulgaria",
  "Greece",
  "Other",
];

const INSPECTION_TYPES: Record<string, string[]> = {
  "United Kingdom": ["MOT", "Pre-MOT Check"],
  "Ireland": ["NCT", "Pre-NCT Check"],
  "France": ["Control Technique", "Contrôle Technique"],
  "Germany": ["TÜV", "Hauptuntersuchung (HU)"],
  "Spain": ["ITV", "Inspección Técnica de Vehículos"],
  "Italy": ["Revisione"],
  "Other": ["General Inspection", "Safety Inspection"],
};

const VehicleDataUploadScreen = () => {
  const params = useLocalSearchParams();
  const vehicleId = params.vehicleId as string;

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icons");
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "borders");
  const cardBackgroundColor = useThemeColor({}, "cards");

  const { setAlertConfig, setIsVisible } = useAlertContext();

  const { data: vehiclesData } = useGetMyVehiclesQuery();
  const vehicles = Array.isArray(vehiclesData)
    ? vehiclesData
    : vehiclesData?.branches?.flatMap((b: any) => b.vehicles) || [];
  const vehicle = vehicles.find((v: any) => v.id === vehicleId);

  const dispatch = useAppDispatch();
  const [createVehicleEvent, { isLoading: isSubmitting }] = useCreateVehicleEventMutation();

  // Get saved form data from Redux slice
  const savedDraft = useAppSelector((state: RootState) => 
    state.vehicleDataUpload.drafts[vehicleId]
  );

  // Initialize form data from saved draft or defaults
  // Note: Component uses Date for event_date, but slice stores as ISO string
  type ComponentFormData = Omit<VehicleDocumentForm, 'event_date'> & { event_date: Date };
  
  const [formData, setFormDataState] = useState<ComponentFormData>(() => {
    if (savedDraft?.formData) {
      return {
        ...savedDraft.formData,
        event_date: new Date(savedDraft.formData.event_date),
        result: savedDraft.formData.result || "passed",
      };
    }
    return {
      event_type: "inspection",
      event_date: new Date(),
      country: "United Kingdom",
      result: "passed",
      metadata: {},
      visibility: "public",
    };
  });

  // Load form data on mount
  useEffect(() => {
    if (vehicleId) {
      dispatch(loadFormData(vehicleId));
    }
  }, [vehicleId, dispatch]);

  // Load defects and advisoryItems from saved metadata
  useEffect(() => {
    if (savedDraft?.formData?.metadata) {
      if (savedDraft.formData.metadata.defects) {
        setDefects(savedDraft.formData.metadata.defects);
      }
      if (savedDraft.formData.metadata.advisory_items) {
        setAdvisoryItems(savedDraft.formData.metadata.advisory_items);
      }
    }
  }, [savedDraft]);

  // Update Redux slice when form data changes
  const setFormData = (newData: VehicleDocumentForm | ((prev: VehicleDocumentForm) => VehicleDocumentForm)) => {
    const updatedData = typeof newData === "function" ? newData(formData) : newData;
    setFormDataState(updatedData);
    
    // Save to Redux slice
    if (vehicleId) {
      dispatch(setFullFormData({
        vehicleId,
        formData: {
          ...updatedData,
          event_date: updatedData.event_date instanceof Date 
            ? updatedData.event_date.toISOString() 
            : updatedData.event_date,
        },
      }));
    }
  };

  // Helper to update a specific field
  const updateFormField = (field: keyof ComponentFormData, value: any) => {
    if (vehicleId) {
      dispatch(setFormDataAction({
        vehicleId,
        field: field as keyof VehicleDocumentForm,
        value: value instanceof Date ? value.toISOString() : value,
      }));
    }
    setFormDataState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPicker, setShowPicker] = useState<{
    type: "event_type" | "country" | "inspection_type" | "result" | "visibility";
    items: string[];
  } | null>(null);
  const [advisoryItems, setAdvisoryItems] = useState<string[]>([]);
  const [currentAdvisory, setCurrentAdvisory] = useState("");
  const [defects, setDefects] = useState<
    Array<{ severity: "dangerous" | "major" | "minor"; description: string }>
  >([]);
  const [currentDefect, setCurrentDefect] = useState<{
    severity: "dangerous" | "major" | "minor";
    description: string;
  }>({ severity: "minor", description: "" });

  const availableInspectionTypes =
    INSPECTION_TYPES[formData.country as keyof typeof INSPECTION_TYPES] ||
    INSPECTION_TYPES["Other"];

  const handleSubmit = async () => {
    if (!vehicleId || !vehicle) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Vehicle information is missing",
        type: "error",
        onConfirm: () => setIsVisible(false),
      });
      return;
    }

    // Validation
    if (formData.event_type === "inspection" && !formData.inspection_type) {
      setAlertConfig({
        isVisible: true,
        title: "Validation Error",
        message: "Please select an inspection type",
        type: "warning",
        onConfirm: () => setIsVisible(false),
      });
      return;
    }

    try {
      const payload: CreateVehicleEventRequest = {
        vehicle_id: vehicleId,
        event_type: formData.event_type,
        event_date: formData.event_date.toISOString(),
        metadata: {
          ...formData.metadata,
          country: formData.country,
          inspection_type: formData.inspection_type,
          mileage: formData.mileage,
          result: formData.result,
          advisory_items: advisoryItems,
          defects: defects,
        },
        visibility: formData.visibility,
        notes: formData.notes,
      };

      const result = await createVehicleEvent(payload).unwrap();

      // Clear form data from Redux slice after successful submission
      if (vehicleId) {
        dispatch(clearFormData(vehicleId));
      }

      setAlertConfig({
        isVisible: true,
        title: "Success",
        message: `${formData.event_type.charAt(0).toUpperCase() + formData.event_type.slice(1)} documented successfully!`,
        type: "success",
        onConfirm: () => {
          setIsVisible(false);
          router.back();
        },
      });
    } catch (error: any) {
      console.error("Error submitting vehicle document:", error);
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: error?.data?.error || error?.message || "Failed to submit document. Please try again.",
        type: "error",
        onConfirm: () => setIsVisible(false),
      });
    }
  };

  const renderPicker = () => {
    if (!showPicker) return null;

    return (
      <Modal
        visible={!!showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBackgroundColor, borderColor }]}>
            <View style={styles.modalHeader}>
              <StyledText variant="titleMedium" style={{ color: textColor, fontWeight: "600" }}>
                Select {showPicker.type.replace("_", " ")}
              </StyledText>
              <TouchableOpacity onPress={() => setShowPicker(null)}>
                <MaterialIcons name="close" size={24} color={textColor} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={showPicker.items}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: borderColor },
                    (showPicker.type === "event_type" && formData.event_type === item) ||
                    (showPicker.type === "country" && formData.country === item) ||
                    (showPicker.type === "inspection_type" && formData.inspection_type === item) ||
                    (showPicker.type === "result" && formData.result === item) ||
                    (showPicker.type === "visibility" && formData.visibility === item)
                      ? { backgroundColor: `${primaryColor}20` }
                      : {},
                  ]}
                  onPress={() => {
                    if (showPicker.type === "event_type") {
                      updateFormField("event_type", item);
                      updateFormField("metadata", {});
                    } else if (showPicker.type === "country") {
                      updateFormField("country", item);
                      updateFormField("inspection_type", undefined);
                    } else if (showPicker.type === "inspection_type") {
                      updateFormField("inspection_type", item);
                    } else if (showPicker.type === "result") {
                      updateFormField("result", item);
                    } else if (showPicker.type === "visibility") {
                      updateFormField("visibility", item);
                    }
                    setShowPicker(null);
                  }}
                >
                  <StyledText variant="bodyMedium" style={{ color: textColor }}>
                    {item}
                  </StyledText>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    );
  };

  if (!vehicle) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <StyledText variant="titleLarge" style={{ color: textColor }}>
            Document Vehicle
          </StyledText>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorContainer}>
          <StyledText variant="bodyLarge" style={{ color: textColor }}>
            Vehicle not found
          </StyledText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Vehicle Info Card */}
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <View style={styles.vehicleInfo}>
            <MaterialIcons name="directions-car" size={24} color={primaryColor} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <StyledText variant="titleMedium" style={{ color: textColor, fontWeight: "600" }}>
                {vehicle.year} {vehicle.make} {vehicle.model}
              </StyledText>
              <StyledText variant="bodySmall" style={{ color: iconColor }}>
                {vehicle.licence?.toUpperCase()} • {vehicle.vin || "No VIN"}
              </StyledText>
            </View>
          </View>
        </View>

        {/* Document Type Selection */}
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
            Document Type
          </StyledText>

          <TouchableOpacity
            style={[styles.pickerButton, { borderColor }]}
            onPress={() =>
              setShowPicker({
                type: "event_type",
                items: ["inspection", "repair", "service", "obd_scan", "damage"],
              })
            }
          >
            <StyledText variant="bodyMedium" style={{ color: textColor }}>
              {formData.event_type.charAt(0).toUpperCase() + formData.event_type.slice(1)}
            </StyledText>
            <MaterialIcons name="arrow-drop-down" size={24} color={iconColor} />
          </TouchableOpacity>
        </View>

        {/* Date Selection */}
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
            Date of Service
          </StyledText>

          <TouchableOpacity
            style={[styles.dateButton, { borderColor }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color={iconColor} />
            <StyledText variant="bodyMedium" style={{ color: textColor, marginLeft: 8 }}>
              {formData.event_date.toLocaleDateString()}
            </StyledText>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={formData.event_date}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(event, selectedDate) => {
                if (Platform.OS === "android") {
                  setShowDatePicker(false);
                }
                if (selectedDate) {
                  updateFormField("event_date", selectedDate);
                }
              }}
            />
          )}
        </View>

        {/* Inspection-Specific Fields */}
        {formData.event_type === "inspection" && (
          <>
            <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
              <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
                Country
              </StyledText>

              <TouchableOpacity
                style={[styles.pickerButton, { borderColor }]}
                onPress={() =>
                  setShowPicker({
                    type: "country",
                    items: EU_COUNTRIES,
                  })
                }
              >
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {formData.country}
                </StyledText>
                <MaterialIcons name="arrow-drop-down" size={24} color={iconColor} />
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
              <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
                Inspection Type
              </StyledText>

              <TouchableOpacity
                style={[styles.pickerButton, { borderColor }]}
                onPress={() =>
                  setShowPicker({
                    type: "inspection_type",
                    items: availableInspectionTypes,
                  })
                }
              >
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {formData.inspection_type || "Select inspection type"}
                </StyledText>
                <MaterialIcons name="arrow-drop-down" size={24} color={iconColor} />
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
              <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
                Result
              </StyledText>

              <TouchableOpacity
                style={[styles.pickerButton, { borderColor }]}
                onPress={() =>
                  setShowPicker({
                    type: "result",
                    items: ["passed", "failed", "pending"],
                  })
                }
              >
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {formData.result.charAt(0).toUpperCase() + formData.result.slice(1)}
                </StyledText>
                <MaterialIcons name="arrow-drop-down" size={24} color={iconColor} />
              </TouchableOpacity>
            </View>

            {/* Inspection Details */}
            <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
              <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
                Inspection Details
              </StyledText>

              <StyledTextInput
                label="Certificate Number (Optional)"
                placeholder="Enter certificate number"
                value={formData.metadata.certificate_number || ""}
                onChangeText={(text) => {
                  const updatedMetadata = { ...formData.metadata, certificate_number: text };
                  updateFormField("metadata", updatedMetadata);
                }}
              />

              <StyledTextInput
                label="Test Station (Optional)"
                placeholder="Name of test station"
                value={formData.metadata.test_station || ""}
                onChangeText={(text) => {
                  const updatedMetadata = { ...formData.metadata, test_station: text };
                  updateFormField("metadata", updatedMetadata);
                }}
              />

              <StyledTextInput
                label="Mileage (Optional)"
                placeholder="e.g., 50000"
                value={formData.mileage || ""}
                onChangeText={(text) => updateFormField("mileage", text)}
                keyboardType="numeric"
              />

              <StyledTextInput
                label="Expiry Date (Optional)"
                placeholder="YYYY-MM-DD"
                value={formData.metadata.expiry_date || ""}
                onChangeText={(text) => {
                  const updatedMetadata = { ...formData.metadata, expiry_date: text };
                  updateFormField("metadata", updatedMetadata);
                }}
              />
            </View>

            {/* Defects Section */}
            {formData.result === "failed" && (
              <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
                <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
                  Defects
                </StyledText>

                <View style={styles.defectInputContainer}>
                  <TouchableOpacity
                    style={[styles.pickerButton, { borderColor, marginBottom: 12 }]}
                    onPress={() => {
                      const severityOptions = ["minor", "major", "dangerous"];
                      const currentIndex = severityOptions.indexOf(currentDefect.severity);
                      const nextIndex = (currentIndex + 1) % severityOptions.length;
                      setCurrentDefect({
                        ...currentDefect,
                        severity: severityOptions[nextIndex] as any,
                      });
                    }}
                  >
                    <StyledText variant="bodyMedium" style={{ color: textColor }}>
                      Severity: {currentDefect.severity.charAt(0).toUpperCase() + currentDefect.severity.slice(1)}
                    </StyledText>
                  </TouchableOpacity>

                  <StyledTextInput
                    label="Defect Description"
                    placeholder="Describe the defect"
                    value={currentDefect.description}
                    onChangeText={(text) => setCurrentDefect({ ...currentDefect, description: text })}
                    multiline
                  />

                  <StyledButton
                    title="Add Defect"
                    variant="tonal"
                    onPress={() => {
                      if (currentDefect.description.trim()) {
                        const updatedDefects = [...defects, currentDefect];
                        setDefects(updatedDefects);
                        const updatedMetadata = { ...formData.metadata, defects: updatedDefects };
                        updateFormField("metadata", updatedMetadata);
                        setCurrentDefect({ severity: "minor", description: "" });
                      }
                    }}
                    style={{ marginTop: 8 }}
                  />
                </View>

                {defects.length > 0 && (
                  <View style={styles.defectsList}>
                    {defects.map((defect, index) => (
                      <View key={index} style={[styles.defectItem, { borderColor }]}>
                        <View style={styles.defectHeader}>
                          <View
                            style={[
                              styles.severityBadge,
                              {
                                backgroundColor:
                                  defect.severity === "dangerous"
                                    ? "#dc3545"
                                    : defect.severity === "major"
                                    ? "#ffc107"
                                    : "#28a745",
                              },
                            ]}
                          >
                            <StyledText
                              variant="bodySmall"
                              style={{ color: "white", fontWeight: "600" }}
                            >
                              {defect.severity.toUpperCase()}
                            </StyledText>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              const updatedDefects = defects.filter((_, i) => i !== index);
                              setDefects(updatedDefects);
                              const updatedMetadata = { ...formData.metadata, defects: updatedDefects };
                              updateFormField("metadata", updatedMetadata);
                            }}
                          >
                            <MaterialIcons name="close" size={20} color={iconColor} />
                          </TouchableOpacity>
                        </View>
                        <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 8 }}>
                          {defect.description}
                        </StyledText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Advisory Items */}
            <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
              <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
                Advisory Items (Optional)
              </StyledText>

              <StyledTextInput
                label="Add Advisory Item"
                placeholder="e.g., Tire wear approaching limit"
                value={currentAdvisory}
                onChangeText={setCurrentAdvisory}
              />

              <StyledButton
                title="Add Advisory"
                variant="tonal"
                onPress={() => {
                  if (currentAdvisory.trim()) {
                    setAdvisoryItems([...advisoryItems, currentAdvisory]);
                    setCurrentAdvisory("");
                  }
                }}
                style={{ marginTop: 8 }}
              />

              {advisoryItems.length > 0 && (
                <View style={styles.advisoryList}>
                  {advisoryItems.map((item, index) => (
                    <View key={index} style={[styles.advisoryItem, { borderColor }]}>
                      <StyledText variant="bodyMedium" style={{ color: textColor }}>
                        • {item}
                      </StyledText>
                      <TouchableOpacity
                        onPress={() => {
                          const updatedAdvisoryItems = advisoryItems.filter((_, i) => i !== index);
                          setAdvisoryItems(updatedAdvisoryItems);
                          const updatedMetadata = { ...formData.metadata, advisory_items: updatedAdvisoryItems };
                          updateFormField("metadata", updatedMetadata);
                        }}
                      >
                        <MaterialIcons name="close" size={18} color={iconColor} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {/* Repair/Service-Specific Fields */}
        {(formData.event_type === "repair" || formData.event_type === "service") && (
          <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
            <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
              Work Details
            </StyledText>

            <StyledTextInput
              label="Work Performed"
              placeholder="Describe the work performed"
              value={formData.metadata.work_performed || ""}
              onChangeText={(text) => {
                const updatedMetadata = { ...formData.metadata, work_performed: text };
                updateFormField("metadata", updatedMetadata);
              }}
              multiline
              numberOfLines={4}
            />

            <StyledTextInput
              label="Parts Replaced (Optional)"
              placeholder="List parts replaced"
              value={formData.metadata.parts_replaced || ""}
              onChangeText={(text) => {
                const updatedMetadata = { ...formData.metadata, parts_replaced: text };
                updateFormField("metadata", updatedMetadata);
              }}
              multiline
            />

            <StyledTextInput
              label="Cost (Optional)"
              placeholder="e.g., 250.00"
              value={formData.metadata.cost || ""}
              onChangeText={(text) => {
                const updatedMetadata = { ...formData.metadata, cost: text };
                updateFormField("metadata", updatedMetadata);
              }}
              keyboardType="decimal-pad"
            />

            <StyledTextInput
              label="Mileage"
              placeholder="e.g., 50000"
              value={formData.mileage || ""}
              onChangeText={(text) => setFormData({ ...formData, mileage: text })}
              keyboardType="numeric"
            />
          </View>
        )}

        {/* OBD Scan-Specific Fields */}
        {formData.event_type === "obd_scan" && (
          <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
            <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
              Diagnostic Information
            </StyledText>

            <StyledTextInput
              label="Fault Codes (Optional)"
              placeholder="e.g., P0301, P0420"
              value={formData.metadata.fault_codes?.join(", ") || ""}
              onChangeText={(text) =>
                {
                  const updatedMetadata = {
                    ...formData.metadata,
                    fault_codes: text.split(",").map((code) => code.trim()).filter(Boolean),
                  };
                  updateFormField("metadata", updatedMetadata);
                }
              }
            />

            <StyledTextInput
              label="Diagnostics Summary"
              placeholder="Summary of diagnostic results"
              value={formData.metadata.diagnostics_summary || ""}
              onChangeText={(text) => {
                const updatedMetadata = { ...formData.metadata, diagnostics_summary: text };
                updateFormField("metadata", updatedMetadata);
              }}
              multiline
              numberOfLines={4}
            />

            <StyledTextInput
              label="Mileage"
              placeholder="e.g., 50000"
              value={formData.mileage || ""}
              onChangeText={(text) => setFormData({ ...formData, mileage: text })}
              keyboardType="numeric"
            />
          </View>
        )}

        {/* Notes Section */}
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
            Additional Notes (Optional)
          </StyledText>

          <StyledTextInput
            placeholder="Add any additional notes or comments"
            value={formData.notes || ""}
            onChangeText={(text) => updateFormField("notes", text)}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Visibility */}
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
            Visibility
          </StyledText>

          <TouchableOpacity
            style={[styles.pickerButton, { borderColor }]}
            onPress={() =>
              setShowPicker({
                type: "visibility",
                items: ["public", "private"],
              })
            }
          >
            <StyledText variant="bodyMedium" style={{ color: textColor }}>
              {formData.visibility === "public"
                ? "Public (Accessible via VIN)"
                : "Private (Owner only)"}
            </StyledText>
            <MaterialIcons name="arrow-drop-down" size={24} color={iconColor} />
          </TouchableOpacity>

          <StyledText variant="bodySmall" style={{ color: iconColor, marginTop: 8 }}>
            Public documents can be accessed by anyone with the vehicle's VIN number
          </StyledText>
        </View>

        {/* Submit Button */}
        <StyledButton
          title={isSubmitting ? "Submitting..." : "Submit Document"}
          variant="medium"
          onPress={handleSubmit}
          disabled={isSubmitting}
          isLoading={isSubmitting}
          style={styles.submitButton}
          icon={!isSubmitting ? <MaterialIcons name="check-circle" size={20} color="white" /> : undefined}
        />
      </ScrollView>

      {/* Picker Modal */}
      {renderPicker()}
    </View>
  );
};

export default VehicleDataUploadScreen;

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
  scrollContent: {
    paddingBottom: 70,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  vehicleInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 16,
  },
  pickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  defectInputContainer: {
    gap: 12,
  },
  defectsList: {
    marginTop: 16,
    gap: 12,
  },
  defectItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  defectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  advisoryList: {
    marginTop: 16,
    gap: 8,
  },
  advisoryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  submitButton: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "80%",
    borderTopWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  pickerItem: {
    padding: 16,
    borderBottomWidth: 1,
  },
});
