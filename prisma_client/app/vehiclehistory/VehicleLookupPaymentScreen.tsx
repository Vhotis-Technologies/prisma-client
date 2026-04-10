import React, { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useSnackbar } from "@/app/contexts/SnackbarContext";
import { useStripe } from "@stripe/stripe-react-native";
import {
  useInitiateVinLookupPaymentMutation,
  useLazyGetVehicleHistoryQuery,
  useLazyVerifyVinLookupPaymentQuery,
} from "@/app/store/api/vinLookupApi";
import { VehicleBasicInfo } from "@/app/interfaces/VehicleHistoryInterfaces";

const VehicleLookupPaymentScreen = () => {
  const params = useLocalSearchParams();
  const vehicleInfoParam = params.vehicleInfo as string;
  const vin = params.vin as string;
  const paymentAmountParam = params.paymentAmount as string;

  // Parse vehicle info from params
  let vehicleInfo: VehicleBasicInfo | null = null;
  try {
    vehicleInfo = vehicleInfoParam ? JSON.parse(vehicleInfoParam) : null;
  } catch (error) {
    console.error("Error parsing vehicle info:", error);
  }

  // Get payment amount from params (from server) - should always be provided
  const paymentAmount = paymentAmountParam ? parseFloat(paymentAmountParam) : 0;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const successColor = useThemeColor({}, "success");

  const { showSnackbarWithConfig } = useSnackbar();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // Initiate payment mutation
  const [initiatePayment, { isLoading: isInitiatingPayment }] =
    useInitiateVinLookupPaymentMutation();

  // Get vehicle history query
  const [getVehicleHistory] = useLazyGetVehicleHistoryQuery();

  // Verify payment query
  const [verifyPayment] = useLazyVerifyVinLookupPaymentQuery();

  const formatPrice = (amount: number) => {
    return `€${amount.toFixed(2)}`;
  };

  const validateForm = (): { isValid: boolean; error?: string } => {
    if (!fullName || !fullName.trim()) {
      return { isValid: false, error: "Full name is required" };
    }

    if (fullName.trim().length < 2) {
      return { isValid: false, error: "Full name must be at least 2 characters" };
    }

    if (!email || !email.trim()) {
      return { isValid: false, error: "Email is required" };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return { isValid: false, error: "Please enter a valid email address" };
    }

    // Phone is optional but validate format if provided
    if (phone && phone.trim()) {
      const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
      if (!phoneRegex.test(phone.trim())) {
        return { isValid: false, error: "Please enter a valid phone number" };
      }
    }

    return { isValid: true };
  };

  const handleProceedToPayment = async () => {
    if (!vehicleInfo || !vin) {
      showSnackbarWithConfig({
        message: "Vehicle information is missing. Please try again.",
        type: "error",
        duration: 4000,
      });
      router.back();
      return;
    }

    // Validate form
    const validation = validateForm();
    if (!validation.isValid) {
      showSnackbarWithConfig({
        message: validation.error || "Please fill in all required fields correctly.",
        type: "error",
        duration: 4000,
      });
      return;
    }

    setIsProcessingPayment(true);

    try {
      // Initiate payment
      const paymentResponse = await initiatePayment({
        vin: vin,
        email: email.trim().toLowerCase(),
      }).unwrap();

      // Validate that the server amount matches the displayed amount
      if (Math.abs(paymentResponse.amount - paymentAmount) > 0.01) {
        throw new Error(
          `Payment amount mismatch. Expected €${paymentAmount.toFixed(2)}, got €${paymentResponse.amount.toFixed(2)}`
        );
      }

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
      const maxAttempts = 24; // 24 * 1.5s = 36s max
      const pollIntervalMs = 1500;

      while (!verified && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        try {
          const verificationResult = await verifyPayment({
            purchase_reference: paymentResponse.purchase_reference,
            email: email.trim().toLowerCase(),
          }).unwrap();

          if (verificationResult.status === "succeeded") {
            verified = true;

            // Fetch vehicle history
            const historyResult = await getVehicleHistory({
              vin: vin,
              email: email.trim().toLowerCase(),
            }).unwrap();

            // Navigate to history screen
            router.replace({
              pathname: "/vehiclehistory/VehicleHistoryScreen",
              params: {
                vin: vin,
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
            attempts++;
            continue;
          }
          throw error;
        }

        attempts++;
      }

      if (!verified) {
        throw new Error(
          "Verification is taking longer than expected. Check your email or the app later—your purchase may already be active."
        );
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

  if (!vehicleInfo) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <StyledText variant="titleLarge" style={[styles.headerTitle, { color: textColor }]}>
            Payment Information
          </StyledText>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={primaryColor} />
          <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 16, textAlign: "center" }}>
            Vehicle information is missing. Please try again.
          </StyledText>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <StyledText variant="titleLarge" style={[styles.headerTitle, { color: textColor }]}>
          Payment Information
        </StyledText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Vehicle Information Summary */}
        <View style={[styles.vehicleCard, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.vehicleHeader}>
            <Ionicons name="car-outline" size={24} color={primaryColor} />
            <StyledText variant="titleMedium" style={[styles.cardTitle, { color: textColor }]}>
              Vehicle Information
            </StyledText>
          </View>
          <View style={styles.vehicleInfoGrid}>
            <View style={styles.vehicleInfoRow}>
              <StyledText variant="labelSmall" style={[styles.infoLabel, { color: textColor }]}>
                Make:
              </StyledText>
              <StyledText variant="labelLarge" style={[styles.infoValue, { color: textColor }]}>
                {vehicleInfo.make}
              </StyledText>
            </View>
            <View style={styles.vehicleInfoRow}>
              <StyledText variant="labelSmall" style={[styles.infoLabel, { color: textColor }]}>
                Model:
              </StyledText>
              <StyledText variant="labelLarge" style={[styles.infoValue, { color: textColor }]}>
                {vehicleInfo.model}
              </StyledText>
            </View>
            <View style={styles.vehicleInfoRow}>
              <StyledText variant="labelSmall" style={[styles.infoLabel, { color: textColor }]}>
                Year:
              </StyledText>
              <StyledText variant="labelLarge" style={[styles.infoValue, { color: textColor }]}>
                {vehicleInfo.year}
              </StyledText>
            </View>
            <View style={styles.vehicleInfoRow}>
              <StyledText variant="labelSmall" style={[styles.infoLabel, { color: textColor }]}>
                VIN:
              </StyledText>
              <StyledText variant="labelSmall" style={[styles.infoValue, { color: textColor }]}>
                {vehicleInfo.vin}
              </StyledText>
            </View>
          </View>
        </View>

        {/* Payment Amount */}
        <View style={[styles.paymentCard, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.paymentAmountRow}>
            <StyledText variant="labelMedium" style={{ color: textColor }}>
              Payment Amount:
            </StyledText>
            <StyledText variant="titleLarge" style={[styles.paymentAmount, { color: primaryColor }]}>
              {formatPrice(paymentAmount)}
            </StyledText>
          </View>
        </View>

        {/* Personal Information Form */}
        <View style={[styles.formCard, { backgroundColor: cardColor, borderColor: borderColor }]}>
          <View style={styles.formHeader}>
            <Ionicons name="person-outline" size={24} color={primaryColor} />
            <StyledText variant="titleMedium" style={[styles.cardTitle, { color: textColor }]}>
              Personal Information
            </StyledText>
          </View>

          <StyledText
            variant="bodySmall"
            style={[styles.formDescription, { color: textColor }]}
          >
            Please provide your information to complete the payment.
          </StyledText>

          {/* Full Name */}
          <View style={styles.inputContainer}>
            <StyledTextInput
              label="Full Name *"
              placeholder="Enter your full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              style={styles.textInput}
            />
          </View>

          {/* Email */}
          <View style={styles.inputContainer}>
            <StyledTextInput
              label="Email Address *"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.textInput}
            />
          </View>

          {/* Phone */}
          <View style={styles.inputContainer}>
            <StyledTextInput
              label="Phone Number (Optional)"
              placeholder="Enter your phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={styles.textInput}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.cancelButton, { borderColor: borderColor }]}
            activeOpacity={0.7}
          >
            <StyledText variant="labelLarge" style={[styles.cancelButtonText, { color: textColor }]}>
              Back
            </StyledText>
          </TouchableOpacity>
          <StyledButton
            title={
              isProcessingPayment || isInitiatingPayment
                ? "Processing..."
                : "Proceed to Payment"
            }
            onPress={handleProceedToPayment}
            variant="large"
            disabled={isProcessingPayment || isInitiatingPayment}
            isLoading={isProcessingPayment || isInitiatingPayment}
            style={[styles.proceedButton, { backgroundColor: primaryColor }]}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
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
    padding: 20,
    paddingBottom: 32,
  },
  vehicleCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  vehicleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    marginLeft: 12,
    fontFamily: "BarlowMedium",
  },
  vehicleInfoGrid: {
    gap: 12,
  },
  vehicleInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    opacity: 0.7,
  },
  infoValue: {
    fontFamily: "BarlowMedium",
  },
  paymentCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  paymentAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentAmount: {
    fontFamily: "BarlowMedium",
  },
  formCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  formDescription: {
    marginBottom: 20,
    opacity: 0.7,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  textInput: {
    marginBottom: 0,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontFamily: "BarlowMedium",
  },
  proceedButton: {
    flex: 2,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
});

export default VehicleLookupPaymentScreen;
