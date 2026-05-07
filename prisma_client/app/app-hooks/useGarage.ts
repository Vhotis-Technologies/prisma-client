/**
 * Garage hook: vehicles list, add/update/delete vehicle, stats, promotions, pending transfers, vehicle events.
 */
import { useCallback, useState, useEffect } from "react";
import { Alert, Platform, InteractionManager } from "react-native";
import {
  MyVehiclesProps,
  MyVehicleStatsProps,
  PromotionsProps,
  BranchVehiclesGroup,
} from "../interfaces/GarageInterface";
import { createNewVehicle, resetNewVehicle } from "../store/slices/garageSlice";
import { RootState, useAppDispatch, useAppSelector } from "../store/main_store";
import { useAlertContext } from "../contexts/AlertContext";
import {
  useAddNewVehicleMutation,
  useLookupVehicleRegistrationMutation,
  useDeleteVehicleMutation,
  useGetMyVehiclesQuery,
  useGetVehicleStatsQuery,
} from "../store/api/garageApi";
import { router } from "expo-router";
import { formatCurrency, formatDate } from "@/app/utils/methods";
import { useSnackbar } from "../contexts/SnackbarContext";
import axios from "axios";
import { API_CONFIG } from "@/constants/Config";
import * as SecureStore from "expo-secure-store";
import * as ExpoImagePicker from "expo-image-picker";
/**
 * Custom hook for managing garage-related functionality including vehicle management.
 *
 * This hook provides comprehensive functionality for:
 * - Managing vehicle data and state
 * - Form validation and submission
 * - Integration with Redux store for state management
 *
 * @returns {Object} An object containing:
 *   - State values: vehicles, vehicleStats, isModalVisible, newVehicle
 *   - State setters: setIsModalVisible
 *   - Vehicle methods: handleAddNewVehicle, handleSubmit
 */
const useGarage = () => {
  const dispatch = useAppDispatch();
  const garage = useAppSelector((state: RootState) => state.garage);
  const user = useAppSelector((state: RootState) => state.auth.user);
  const { showSnackbarWithConfig } = useSnackbar();

  const [vehicleId, setVehicleId] = useState<string>("");

  /* Destructure the mutations here  */
  const [
    addNewVehicle,
    { isLoading: isAddingNewVehicle, error: addNewVehicleError },
  ] = useAddNewVehicleMutation();
  const [lookupVehicleRegistration, { isLoading: isLookupRegistrationLoading }] =
    useLookupVehicleRegistrationMutation();
  const [
    deleteVehicle,
    { isLoading: isDeletingVehicle, error: deleteVehicleError },
  ] = useDeleteVehicleMutation();
  const {
    data: vehiclesData,
    isLoading: isLoadingVehicles,
    refetch: refetchVehicles,
  } = useGetMyVehiclesQuery();

  // Transform vehicles data based on user type
  // For fleet owners: transform grouped response to flat list and also provide grouped version
  // For others: use flat list as-is
  const vehicles: MyVehiclesProps[] = Array.isArray(vehiclesData)
    ? vehiclesData
    : vehiclesData && "branches" in vehiclesData
    ? vehiclesData.branches.flatMap((branch: BranchVehiclesGroup) => branch.vehicles)
    : [];

  const vehiclesByBranch: BranchVehiclesGroup[] | null =
    vehiclesData && "branches" in vehiclesData ? vehiclesData.branches : null;

  // Get vehicle stats for the first vehicle (if available)
  const {
    data: vehicleStatsData,
    isLoading: isLoadingVehicleStats,
    refetch: refetchVehicleStats,
  } = useGetVehicleStatsQuery(vehicleId, {
    skip: !vehicleId,
  });

  const [vehicleStats, setVehicleStats] = useState<MyVehicleStatsProps>({
    vehicle: null,
    total_bookings: 0,
    total_amount: 0,
    last_cleaned: "",
    next_recommended_service: "",
  });

  // Update vehicleStats when vehicleStatsData changes
  useEffect(() => {
    if (vehicleStatsData) {
      setVehicleStats((prev) => {
        // Only update if the data actually changed to prevent unnecessary re-renders
        if (prev.vehicle?.id !== vehicleStatsData.vehicle?.id) {
          return vehicleStatsData;
        }
        // Deep comparison for other stats fields
        if (
          prev.total_bookings !== vehicleStatsData.total_bookings ||
          prev.total_amount !== vehicleStatsData.total_amount ||
          prev.last_cleaned !== vehicleStatsData.last_cleaned ||
          prev.next_recommended_service !== vehicleStatsData.next_recommended_service ||
          JSON.stringify(prev.latest_inspection) !== JSON.stringify(vehicleStatsData.latest_inspection)
        ) {
          return vehicleStatsData;
        }
        return prev;
      });
    }
    // Removed else clause that referenced 'vehicles' array to prevent infinite loops
    // The vehicles array is recreated on every render, causing infinite updates
  }, [vehicleStatsData]); // Only depend on vehicleStatsData to prevent infinite loops

  /* Get the state values here */
  const garageState = useAppSelector((state: RootState) => state.garage);
  const newVehicle = garageState?.newVehicle || null;

  /* import the alert context which will be used to render an alert */
  const { setAlertConfig, setIsVisible } = useAlertContext();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);

  const handleVehicleStatsSelection = useCallback(
    (vehicleId: string) => {
      setVehicleId(vehicleId);
    },
    [setVehicleId]
  );

  /**
   * Updates a specific field in the newVehicle state object.
   * This method is used to handle form input changes for vehicle information.
   * Creates a new vehicle object with the updated field value while preserving existing data.
   *
   * @param {string} field - The field name to update (e.g., 'make', 'model', 'year', 'color', 'licence', 'image')
   * @param {string | any} value - The new value to set for the specified field
   *
   * @example
   * handleAddNewVehicle('make', 'Toyota');
   * handleAddNewVehicle('year', '2020');
   * handleAddNewVehicle('image', imageAsset);
   */
  const collectNewVehicleData = (field: string, value: string | any) => {
    const updatedVehicle = {
      ...(newVehicle || {}),
      [field]: value,
    } as MyVehiclesProps;
    dispatch(createNewVehicle(updatedVehicle));
  };

  /**
   * Creates file metadata for React Native file uploads.
   * In React Native, we don't convert to File objects - we use the URI directly with metadata.
   * This metadata will be used when creating FormData for upload.
   *
   * For web, falls back to fetch and blob conversion.
   *
   * @param {string} uri - The local URI of the file
   * @param {string} filename - The desired filename
   * @param {string} mimeType - The MIME type of the file
   * @returns {Promise<Object>} File metadata object compatible with React Native FormData
   */
  const uriToFile = async (
    uri: string,
    filename: string,
    mimeType: string = "image/jpeg"
  ): Promise<any> => {
    // For React Native, return file metadata directly
    if (Platform.OS !== "web") {
      return {
        uri: Platform.OS === "android" ? uri : uri.replace("file://", ""),
        name: filename,
        type: mimeType,
      };
    }

    // For web, use the old fetch/blob approach
    const response = await fetch(uri);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type });
  };

  /**
   * Shows the image selection modal to allow users to choose between camera and gallery.
   */
  const showImageSelectionModal = () => {
    setIsImageModalVisible(true);
  };

  /**
   * Hides the image selection modal.
   */
  const hideImageSelectionModal = () => {
    setIsImageModalVisible(false);
  };

  /**
   * Processes a selected image by converting it to a File object and storing it in state.
   * Creates a timestamped filename and stores both the URI (for display) and File object (for upload).
   *
   * @param {string} imageUri - The URI of the selected image
   * @throws {Error} If image conversion fails
   */
  const handleImageSelection = async (imageUri: string) => {
    try {
      // Generate a filename based on timestamp
      const timestamp = Date.now();
      const filename = `image_${timestamp}.jpg`;

      // Convert URI to File object or file metadata (for React Native)
      const imageFile = await uriToFile(imageUri, filename, "image/jpeg");

      // Store both the URI (for display) and File object (for upload)
      // Create an object with URI, File, and type for React Native FormData
      const imageData = {
        uri: imageUri,
        file: imageFile,
        filename: filename,
        type: "image/jpeg", // Store MIME type
      };

      // Update Redux state with the image
      collectNewVehicleData("image", imageData);

      // Close the modal after successful selection
      hideImageSelectionModal();
    } catch (error) {
      console.error("Error converting image URI to File:", error);
      showSnackbarWithConfig({
        message: "Failed to process image. Please try again.",
        type: "error",
        duration: 3000,
      });
    }
  };

  /**
   * Handles camera image capture using Expo ImagePicker.
   * Requests camera permissions and launches the camera interface.
   * Processes the captured image through handleImageSelection.
   * Closes the modal after the picker completes to fix Android ActivityResultLauncher issue.
   *
   * @throws {Error} If camera permissions are denied
   */
  const handleCameraSelection = async () => {
    // Request camera permissions first
    const { status } = await ExpoImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      hideImageSelectionModal();
      alert("Sorry, we need camera permissions to make this work!");
      return;
    }

    // Use InteractionManager to ensure all interactions are complete before launching picker
    // This ensures ActivityResultLauncher is properly registered
    InteractionManager.runAfterInteractions(async () => {
      try {
        let result = await ExpoImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          aspect: [4, 3],
          quality: 1,
        });

        // Close modal after picker completes
        hideImageSelectionModal();

        if (!result.canceled) {
          const image = result.assets[0].uri;
          await handleImageSelection(image);
        }
      } catch (error) {
        hideImageSelectionModal();
        console.error("Error launching camera:", error);
      }
    });
  };

  /**
   * Handles image selection from the device's media library using Expo ImagePicker.
   * Requests media library permissions and launches the image picker interface.
   * Processes the selected image through handleImageSelection.
   * Closes the modal after the picker completes to fix Android ActivityResultLauncher issue.
   *
   * @throws {Error} If media library permissions are denied
   */
  const handleFileSelection = useCallback(async (): Promise<void> => {
    // Request media library permissions first
    const { status } =
      await ExpoImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      hideImageSelectionModal();
      showSnackbarWithConfig({
        message: "Sorry, we need media library permissions to make this work!",
        type: "error",
        duration: 3000,
      });
      return;
    }

    // Use InteractionManager to ensure all interactions are complete before launching picker
    // This ensures ActivityResultLauncher is properly registered
    InteractionManager.runAfterInteractions(async () => {
      try {
        let result = await ExpoImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          aspect: [4, 3],
          quality: 1,
        });

        // Close modal after picker completes
        hideImageSelectionModal();

        if (!result.canceled) {
          const image = result.assets[0].uri;
          await handleImageSelection(image);
        }
      } catch (error) {
        hideImageSelectionModal();
        console.error("Error launching image library:", error);
      }
    });
  }, [showSnackbarWithConfig, handleImageSelection, hideImageSelectionModal]);

  /**
   * Prepares FormData object for vehicle upload to the API.
   * Converts all vehicle fields to the format expected by the server.
   *
   * Handles:
   * - Basic vehicle fields (make, model, year, color, licence)
   * - Image file (extracts File object from stored image data)
   * - Proper FormData structure for multipart/form-data requests
   *
   * @returns {Promise<FormData | null>} A Promise that resolves to FormData object or null if no vehicle data
   */
  const prepareVehicleFormData = useCallback(async (): Promise<FormData | null> => {
    if (!newVehicle) return null;
    const formData = new FormData();
    if (newVehicle.make) formData.append("make", newVehicle.make);
    if (newVehicle.model) formData.append("model", newVehicle.model);
    if (newVehicle.year) formData.append("year", newVehicle.year.toString());
    if (newVehicle.color) formData.append("color", newVehicle.color);
    formData.append("entry_mode", "manual");
    if (newVehicle.licence) {
      formData.append("licence", newVehicle.licence);
      formData.append("registration_number", newVehicle.licence);
    }
    if (newVehicle.country)
      formData.append("country", String(newVehicle.country));
    if (newVehicle.branch_id) {
      formData.append("branch_id", newVehicle.branch_id);
    }

    // Add image - React Native FormData requires uri, name, and type
    if (newVehicle.image && newVehicle.image.uri) {
      const imageFormData = {
        uri: newVehicle.image.uri,
        name: newVehicle.image.filename || "image.jpg",
        type: newVehicle.image.type || "image/jpeg",
      };
      formData.append("image", imageFormData as any);
    }

    return formData;
  }, [newVehicle]);

  /**
   * Confirm Ireland lookup and create vehicle server-side using lookup_token.
   */
  const confirmLookupVehicle = useCallback(
    async (lookupToken: string, options?: { branchId?: string }) => {
      const formData = new FormData();
      formData.append("lookup_token", lookupToken);
      if (options?.branchId) {
        formData.append("branch_id", options.branchId);
      }
      const response = await addNewVehicle(formData).unwrap();
      if (response?.message) {
        setAlertConfig({
          title: "Success",
          message: response.message,
          type: "success",
          isVisible: true,
          onConfirm() {
            setIsVisible(false);
            dispatch(resetNewVehicle());
          },
        });
      }
      refetchVehicles();
    },
    [addNewVehicle, dispatch, setAlertConfig, setIsVisible, refetchVehicles],
  );

  /**
   * Handles manual add (after failed lookup): make, model, year, colour, image, licence, country.
   */
  const handleSubmit = useCallback(async (): Promise<boolean> => {
    if (newVehicle?.entry_mode !== "manual") {
      setAlertConfig({
        title: "Cannot submit",
        message: "Complete registration lookup first, or switch to manual entry.",
        type: "error",
        isVisible: true,
        onConfirm() {
          setIsVisible(false);
        },
      });
      return false;
    }

    // Validate required fields (manual mode — registration + vehicle details only)
    if (
      !newVehicle?.make ||
      !newVehicle?.model ||
      !newVehicle?.year ||
      !newVehicle?.licence ||
      !newVehicle?.color ||
      !newVehicle?.image
    ) {
      setAlertConfig({
        title: "Missing Information",
        message:
          "Please fill make, model, year, licence, colour, and add a photo.",
        type: "error",
        isVisible: true,
        onConfirm() {
          setIsVisible(false);
        },
      });
      return false;
    }

    // Validate branch selection for fleet owners
    if (user?.is_fleet_owner && !newVehicle?.branch_id) {
      setAlertConfig({
        title: "Branch Required",
        message: "Please select a branch for this vehicle.",
        type: "error",
        isVisible: true,
        onConfirm() {
          setIsVisible(false);
        },
      });
      return false;
    }

    // Validate the year is a number and is between 1900 and the current year
    if (
      isNaN(Number(newVehicle.year)) ||
      Number(newVehicle.year) < 1900 ||
      Number(newVehicle.year) > new Date().getFullYear()
    ) {
      setAlertConfig({
        title: "Invalid Year",
        message: "Please enter a valid year.",
        type: "error",
        isVisible: true,
        onConfirm() {
          setIsVisible(false);
        },
      });
      return false;
    }

    try {
      const formData = await prepareVehicleFormData();
      if (formData) {
        const response = await addNewVehicle(formData).unwrap();
        if (response && response.message) {
          setAlertConfig({
            title: "Success",
            message: response.message,
            type: "success",
            isVisible: true,
            onConfirm() {
              setIsVisible(false);
              dispatch(resetNewVehicle());
            },
          });
        }
        refetchVehicles();
        return true;
      }
      throw new Error("Failed to prepare vehicle data for submission");
    } catch (error: any) {
      let errorMessage = "Failed to add vehicle. Please try again.";
      if (error?.data?.error) {
        errorMessage = error.data.error;
      } else if (error?.status === 400) {
        errorMessage = "Invalid vehicle data. Please check your input.";
      } else if (error?.status === 401) {
        errorMessage = "You must be logged in to add a vehicle.";
      } else if (error?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setAlertConfig({
        title: "Error",
        message: errorMessage,
        type: "error",
        isVisible: true,
        onConfirm() {
          setIsVisible(false);
        },
      });
      return false;
    }
  }, [
    newVehicle,
    user,
    dispatch,
    setAlertConfig,
    setIsVisible,
    addNewVehicle,
    refetchVehicles,
    prepareVehicleFormData,
  ]);

  /**
   * Delete a specific vehicle using the deleteVehicle mutation
   * @param vehicleId - The id of the vehicle to delete
   * @returns {string} message - Message from the server telling the user that the vehicle has been deleted
   *
   *
   */
  const handleDeleteVehicle = useCallback(
    async (vehicleId: string) => {
      try {
        setAlertConfig({
          title: "Deleting Vehicle",
          message: "Please wait while we delete the vehicle",
          type: "warning",
          isVisible: true,
          onConfirm: async () => {
            const response = await deleteVehicle(vehicleId).unwrap();
            if (response.message && response) {
              // show snackbar
              showSnackbarWithConfig({
                message: response.message,
                type: "success",
                duration: 3000,
              });
              refetchVehicles();
            }
          },
          onClose: () => {
            setIsVisible(false);
          },
        });
      } catch (error: any) {
        let errorMessage = "Failed to delete vehicle. Please try again.";
        if (error?.data?.error) {
          errorMessage = error.data.error;
        }
        showSnackbarWithConfig({
          message: errorMessage,
          type: "error",
          duration: 3000,
        });
      }
    },
    [deleteVehicle, setAlertConfig, setIsVisible, refetchVehicles]
  );

  /**
   * Handle viewing vehicle details by fetching vehicle stats and details
   * @param vehicleId - The id of the vehicle to view details for
   */
  const handleViewDetailsPress = useCallback(
    async (vehicleId: string) => {
      try {
        // Set the vehicle ID for the hook state
        setVehicleId(vehicleId);

        // Make a direct API call to fetch vehicle stats to avoid race condition
        const accessToken = await SecureStore.getItemAsync("access");
        const response = await axios.get(
          `${API_CONFIG.customerAppUrl}/api/v1/garage/get_vehicle_stats/${vehicleId}/`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        // Update the local vehicleStats state with the fetched data
        if (response.data) {
          setVehicleStats(response.data);
          return true;
        } else {
          throw new Error("No data received from server");
        }
      } catch (error: any) {
        let errorMessage = "Failed to fetch vehicle details. Please try again.";
        if (error?.response?.data?.error) {
          errorMessage = error.response.data.error;
        } else if (error?.message) {
          errorMessage = error.message;
        }
        setAlertConfig({
          title: "Error",
          message: errorMessage,
          type: "error",
          isVisible: true,
          onConfirm: () => {
            setIsVisible(false);
          },
        });
        return false;
      }
    },
    [setVehicleId, setVehicleStats, setAlertConfig, setIsVisible]
  );

  return {
    vehicles,
    vehiclesByBranch, // Grouped vehicles by branch (for fleet owners)
    vehicleStats,
    isModalVisible,
    newVehicle,
    isLoadingVehicles,
    isLoadingVehicleStats,
    isAddingNewVehicle,
    setIsModalVisible,
    handleVehicleStatsSelection,
    collectNewVehicleData,
    confirmLookupVehicle,
    lookupVehicleRegistration,
    isLookupRegistrationLoading,
    handleSubmit,
    prepareVehicleFormData,
    handleDeleteVehicle,
    handleViewDetailsPress,
    refetchVehicleStats,
    refetchVehicles,
    // Image selection functions
    isImageModalVisible,
    showImageSelectionModal,
    hideImageSelectionModal,
    handleCameraSelection,
    handleFileSelection,
  };
};

export default useGarage;
