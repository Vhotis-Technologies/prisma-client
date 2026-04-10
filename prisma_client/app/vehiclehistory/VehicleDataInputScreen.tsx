import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import VehicleExistsModal from "@/app/components/vehiclehistory/VehicleExistsModal";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useSnackbar } from "@/app/contexts/SnackbarContext";
import { useStripe } from "@stripe/stripe-react-native";
import {
  useLazyCheckVinExistsQuery,
  useLazyGetVehicleHistoryQuery,
  useInitiateVinLookupPaymentMutation,
  useLazyVerifyVinLookupPaymentQuery,
  VehicleBasicInfo,
} from "@/app/store/api/vinLookupApi";
import { useAppSelector, RootState } from "@/app/store/main_store";
import {
  VehicleBasicInfo as VehicleBasicInfoInterface,
} from "@/app/interfaces/VehicleHistoryInterfaces";

// VIN validation function
const validateVIN = (vin: string): { isValid: boolean; error?: string } => {
  const trimmedVIN = vin.trim().toUpperCase();
  
  if (!trimmedVIN) {
    return { isValid: false, error: "VIN is required" };
  }
  
  if (trimmedVIN.length !== 17) {
    return { isValid: false, error: "VIN must be exactly 17 characters" };
  }
  
  // VIN should be alphanumeric (excluding I, O, Q to avoid confusion)
  const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
  if (!vinRegex.test(trimmedVIN)) {
    return {
      isValid: false,
      error: "VIN contains invalid characters (I, O, Q are not allowed)",
    };
  }
  
  return { isValid: true };
};

const VehicleDataInputScreen = () => {
  const [vin, setVin] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [vehicleInfo, setVehicleInfo] = useState<VehicleBasicInfoInterface | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [purchaseReference, setPurchaseReference] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(5.0); // Default, will be updated from server

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");

  const { showSnackbarWithConfig } = useSnackbar();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const user = useAppSelector((state: RootState) => state.auth.user);
  const isAuthenticated = useAppSelector((state: RootState) => state.auth.isAuthenticated);

  // Get user email - use authenticated user's email or require input for unregistered users
  const userEmail = user?.email || "";

  // Check VIN exists query (only runs when vin is valid and we trigger it)
  const [checkVinExists, { isLoading: isCheckingVin }] = useLazyCheckVinExistsQuery();

  // Get vehicle history query
  const [getVehicleHistory] = useLazyGetVehicleHistoryQuery();

  // Initiate payment mutation
  const [initiatePayment, { isLoading: isInitiatingPayment }] = useInitiateVinLookupPaymentMutation();

  // Verify payment query
  const [verifyPayment] = useLazyVerifyVinLookupPaymentQuery();

  const handleCheckVIN = async () => {
    // Validate VIN
    const validation = validateVIN(vin);
    if (!validation.isValid) {
      showSnackbarWithConfig({
        message: validation.error || "Invalid VIN",
        type: "error",
        duration: 3000,
      });
      return;
    }

    const trimmedVIN = vin.trim().toUpperCase();

    try {
      // Check if VIN exists
      const result = await checkVinExists(trimmedVIN).unwrap();

      if (!result.exists || !result.vehicle) {
        showSnackbarWithConfig({
          message: "Vehicle not found in our database. Please check the VIN and try again.",
          type: "error",
          duration: 4000,
        });
        return;
      }

      // Set vehicle info
      setVehicleInfo({
        make: result.vehicle.make,
        model: result.vehicle.model,
        year: result.vehicle.year,
        color: "", // Not provided in basic info
        vin: result.vehicle.vin,
      });

      // Set payment amount from server response (use default if not provided)
      if (result.price) {
        setPaymentAmount(result.price);
      }

      // Check if user has valid purchase
      if (isAuthenticated && userEmail) {
        const historyResult = await getVehicleHistory({ vin: trimmedVIN, email: userEmail }).unwrap();
        
        if (!historyResult.requires_payment) {
          // User has valid purchase - navigate directly to history
          router.push({
            pathname: "/vehiclehistory/VehicleHistoryScreen",
            params: {
              vin: trimmedVIN,
              historyData: JSON.stringify(historyResult),
            },
          });
          return;
        }
      }

      // Show modal for payment
      setShowModal(true);
    } catch (error: any) {
      console.error("Error checking VIN:", error);
      showSnackbarWithConfig({
        message: error?.data?.error || "Failed to check VIN. Please try again.",
        type: "error",
        duration: 4000,
      });
    }
  };

  const handleProceedToPayment = async () => {
    if (!vehicleInfo) return;

    // This handler is only for authenticated users
    // Unregistered users will navigate to payment screen via modal
    if (!isAuthenticated || !userEmail) {
      showSnackbarWithConfig({
        message: "Please sign in to proceed with payment.",
        type: "error",
        duration: 4000,
      });
      return;
    }

    const email = userEmail;

    setShowModal(false);
    setIsProcessingPayment(true);

    try {
      // Initiate payment
      const paymentResponse = await initiatePayment({
        vin: vehicleInfo.vin,
        email: email.trim().toLowerCase(),
      }).unwrap();

      // Validate that the server amount matches the displayed amount
      if (Math.abs(paymentResponse.amount - paymentAmount) > 0.01) {
        throw new Error(
          `Payment amount mismatch. Expected €${paymentAmount.toFixed(2)}, got €${paymentResponse.amount.toFixed(2)}`
        );
      }

      setPurchaseReference(paymentResponse.purchase_reference);

      // Initialize payment sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentResponse.paymentIntent,
        merchantDisplayName: "Prisma Valet - Vehicle History",
        customerEphemeralKeySecret: paymentResponse.ephemeralKey,
        customerId: paymentResponse.customer,
        returnURL: "prismaclient://payment-success",
      });

      if (initError) {
        throw new Error(initError.message);
      }

      // Present payment sheet
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === "Canceled") {
          showSnackbarWithConfig({
            message: "Payment was cancelled.",
            type: "info",
            duration: 3000,
          });
          setIsProcessingPayment(false);
          return;
        }
        throw new Error(presentError.message);
      }

      // Payment successful - poll for verification
      showSnackbarWithConfig({
        message: "Payment successful! Verifying purchase...",
        type: "success",
        duration: 3000,
      });

      // Poll for payment verification
      let verified = false;
      let attempts = 0;
      const maxAttempts = 20; // 20 attempts * 2.5s = 50 seconds max

      while (!verified && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait 2.5 seconds

        try {
          const verificationResult = await verifyPayment({
            purchase_reference: paymentResponse.purchase_reference,
            email: email.trim().toLowerCase(),
          }).unwrap();

          if (verificationResult.status === "succeeded") {
            verified = true;
            
            // Fetch vehicle history
            const historyResult = await getVehicleHistory({
              vin: vehicleInfo.vin,
              email: email.trim().toLowerCase(),
            }).unwrap();

            // Navigate to history screen
            router.push({
              pathname: "/vehiclehistory/VehicleHistoryScreen",
              params: {
                vin: vehicleInfo.vin,
                historyData: JSON.stringify(historyResult),
              },
            });
            break;
          } else if (verificationResult.status === "failed") {
            throw new Error("Payment verification failed");
          }
          // If pending, continue polling
        } catch (error: any) {
          if (error?.data?.error && error.data.error.includes("not found")) {
            // Purchase not created yet, continue polling
            attempts++;
            continue;
          }
          throw error;
        }

        attempts++;
      }

      if (!verified) {
        throw new Error("Payment verification timeout. Please contact support.");
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      showSnackbarWithConfig({
        message: error?.message || error?.data?.error || "Payment failed. Please try again.",
        type: "error",
        duration: 4000,
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setVehicleInfo(null);
  };

  return (
    <View
      style={{ flex: 1, backgroundColor }}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: primaryColor + "20" }]}>
              <Ionicons name="car-outline" size={48} color={primaryColor} />
            </View>
            <StyledText variant="titleLarge" style={[styles.title, { color: textColor }]}>
              Check Vehicle History
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.subtitle, { color: textColor }]}
            >
              Enter the Vehicle Identification Number (VIN) to view complete
              vehicle history including ownership, location, and service records.
            </StyledText>
          </View>

          {/* Input Card */}
          <View style={[styles.inputCard, { backgroundColor: cardColor, borderColor: borderColor }]}>
            <StyledTextInput
              label="Vehicle Identification Number (VIN)"
              placeholder="Enter 17-character VIN"
              value={vin}
              onChangeText={(text) => setVin(text.toUpperCase())}
              maxLength={17}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.vinInput}
            />
            <StyledText
              variant="bodySmall"
              style={[styles.infoText, { color: textColor }]}
            >
              The VIN is a 17-character code found on your vehicle's dashboard
              or driver's side door.
            </StyledText>

            <StyledButton
              title={
                isCheckingVin || isInitiatingPayment
                  ? "Checking..."
                  : isProcessingPayment
                  ? "Processing Payment..."
                  : "Check Vehicle"
              }
              onPress={handleCheckVIN}
              variant="large"
              disabled={isCheckingVin || isProcessingPayment || isInitiatingPayment || !vin.trim()}
              isLoading={isCheckingVin || isProcessingPayment || isInitiatingPayment}
              style={[styles.checkButton, { backgroundColor: primaryColor }]}
            />
          </View>

          {/* Info Section */}
          <View style={[styles.infoCard, { backgroundColor: cardColor, borderColor: borderColor }]}>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle-outline" size={24} color={primaryColor} />
              <View style={styles.infoContent}>
                <StyledText
                  variant="labelMedium"
                  style={[styles.infoTitle, { color: textColor }]}
                >
                  What you'll get:
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[styles.infoDescription, { color: textColor }]}
                >
                  • Complete ownership history
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[styles.infoDescription, { color: textColor }]}
                >
                  • Location history
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[styles.infoDescription, { color: textColor }]}
                >
                  • Service and maintenance records
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[styles.infoDescription, { color: textColor }]}
                >
                  • Accident and incident reports
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[styles.infoDescription, { color: textColor }]}
                >
                  • Title status and recall information
                </StyledText>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Vehicle Exists Modal */}
      {vehicleInfo && (
        <VehicleExistsModal
          visible={showModal}
          onClose={handleCloseModal}
          onProceedToPayment={handleProceedToPayment}
          vehicleInfo={vehicleInfo}
          paymentAmount={paymentAmount}
          vin={vin.trim().toUpperCase()}
          isAuthenticated={isAuthenticated}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  content: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    textAlign: "center",
    marginBottom: 12,
    fontFamily: "BarlowMedium",
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  inputCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
  },
  vinInput: {
    marginBottom: 12,
  },
  infoText: {
    marginBottom: 20,
    lineHeight: 18,
  },
  checkButton: {
    marginTop: 8,
  },
  infoCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    marginBottom: 8,
    fontFamily: "BarlowMedium",
  },
  infoDescription: {
    marginBottom: 4,
    lineHeight: 20,
  },
});

export default VehicleDataInputScreen;
