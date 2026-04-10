import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Dimensions,
  TouchableOpacity,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
  import StyledText from "../components/helpers/StyledText";
import StyledTextInput from "../components/helpers/StyledTextInput";
import DocumentModal from "../components/helpers/DocumentModal";
import type { DocumentModalType } from "../components/helpers/DocumentModal";
import AddressSearchInput from "../components/shared/AddressSearchInput";
import { useThemeColor } from "@/hooks/useThemeColor";
import useOnboarding from "../app-hooks/useOnboarding";
import { useAlertContext } from "../contexts/AlertContext";
import StyledButton from "../components/helpers/StyledButton";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get("window");

const OnboardingScreen = () => {
  const {
    signUpData,
    collectSignupData: handleSignUpData,
    registerUser,
    isRegisterLoading,
    termsAccepted,
    setTermsAccepted,
  } = useOnboarding();

  const [documentModalType, setDocumentModalType] =
    useState<DocumentModalType | null>(null);

  const { setAlertConfig, setIsVisible } = useAlertContext();
  const textColor = useThemeColor({}, "text");
  const backgroundColor = useThemeColor({}, "background");
  const borderColor = useThemeColor({}, "borders");
  const buttonColor = useThemeColor({}, "button");
  const errorColor = useThemeColor({}, "error");
  const cardColor = useThemeColor({}, "cards");
  const iconColor = useThemeColor({}, "icons");

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleSubmit = async () => {
    if (!signUpData) return;
    try {
      if (
        !signUpData.name ||
        !signUpData.email ||
        !signUpData.phone ||
        !signUpData.password
      ) {
        setAlertConfig({
          title: "Missing Fields",
          message: "Please fill in all required fields",
          type: "error",
          isVisible: true,
          onConfirm: () => {
            setIsVisible(false);
          },
        });
        return;
      }
      if (signUpData.isDealership && signUpData.isFleetOwner) {
        setAlertConfig({
          title: "Invalid Selection",
          message:
            "You cannot be both a fleet operator and a dealership. Please choose one.",
          type: "error",
          isVisible: true,
          onConfirm: () => setIsVisible(false),
        });
        return;
      }
      const needsBusinessData =
        signUpData.isDealership || signUpData.isFleetOwner;
      if (needsBusinessData) {
        if (!signUpData.business_name?.trim()) {
          setAlertConfig({
            title: "Business Name Required",
            message:
              "Please enter your business name when signing up as a fleet owner or dealership.",
            type: "error",
            isVisible: true,
            onConfirm: () => setIsVisible(false),
          });
          return;
        }
        const addr = signUpData.business_address;
        if (!addr || !addr.address || !addr.city || !addr.country) {
          setAlertConfig({
            title: "Business Address Required",
            message:
              "Please select your business address when signing up as a fleet owner or dealership.",
            type: "error",
            isVisible: true,
            onConfirm: () => setIsVisible(false),
          });
          return;
        }
      }
      if (signUpData.password !== confirmPassword) {
        setPasswordError("Passwords do not match");
        return;
      }
      setPasswordError("");
      await registerUser();
    } catch (error) {
      console.error("Registration failed:", error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Main Content */}
          <View style={styles.content}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <StyledText
                style={[styles.title, { color: textColor }]}
                variant="headlineMedium"
              >
                Create Account
              </StyledText>
            </View>

            {/* Form Section */}
            <View style={styles.formSection}>
              {/* Full Name Input */}
              <View style={styles.inputContainer}>
                <StyledTextInput
                  label="Full Name"
                  placeholder="Enter your full name"
                  value={signUpData?.name || ""}
                  onChangeText={(text) => handleSignUpData("name", text)}
                  keyboardType="default"
                  autoCapitalize="words"
                  style={styles.textInput}
                  placeholderTextColor={
                    textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"
                  }
                />
              </View>

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <StyledTextInput
                  label="Email"
                  placeholder="Enter your email"
                  value={signUpData?.email || ""}
                  onChangeText={(text) => handleSignUpData("email", text)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.textInput}
                  placeholderTextColor={
                    textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"
                  }
                />
              </View>

              {/* Phone Input */}
              <View style={styles.inputContainer}>
                <StyledTextInput
                  label="Phone Number"
                  placeholder="Enter your phone number"
                  value={signUpData?.phone || ""}
                  onChangeText={(text) => handleSignUpData("phone", text)}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  maxLength={12}
                  style={styles.textInput}
                  placeholderTextColor={
                    textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"
                  }
                />
              </View>

              {/* Fleet Owner Checkbox */}
              <View style={styles.fleetOwnerContainer}>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut,
                    );
                    const newVal = !signUpData?.isFleetOwner;
                    handleSignUpData("isFleetOwner", newVal);
                    if (newVal && signUpData?.isDealership) {
                      handleSignUpData("isDealership", false);
                    }
                    if (!newVal && !signUpData?.isDealership) {
                      handleSignUpData("business_name", undefined);
                      handleSignUpData("business_address", undefined);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: borderColor,
                        backgroundColor: signUpData?.isFleetOwner
                          ? buttonColor
                          : "transparent",
                      },
                    ]}
                  >
                    {signUpData?.isFleetOwner && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <StyledText
                      style={[styles.fleetOwnerText, { color: textColor }]}
                    >
                      I operate a fleet
                    </StyledText>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Is Dealership Checkbox */}
              <View style={styles.fleetOwnerContainer}>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut,
                    );
                    const newVal = !signUpData?.isDealership;
                    handleSignUpData("isDealership", newVal);
                    if (newVal && signUpData?.isFleetOwner) {
                      handleSignUpData("isFleetOwner", false);
                    }
                    if (!newVal && !signUpData?.isFleetOwner) {
                      handleSignUpData("business_name", undefined);
                      handleSignUpData("business_address", undefined);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: borderColor,
                        backgroundColor: signUpData?.isDealership
                          ? buttonColor
                          : "transparent",
                      },
                    ]}
                  >
                    {signUpData?.isDealership && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <StyledText
                      style={[styles.fleetOwnerText, { color: textColor }]}
                    >
                      I operate a dealership
                    </StyledText>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <View style={styles.passwordInputWrapper}>
                  <StyledTextInput
                    label="Password"
                    placeholder="Enter your password"
                    value={signUpData?.password || ""}
                    onChangeText={(text) => handleSignUpData("password", text)}
                    secureTextEntry={!isPasswordVisible}
                    autoCapitalize="none"
                    style={styles.textInput}
                    placeholderTextColor={
                      textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"
                    }
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                  >
                    <Ionicons
                      name={isPasswordVisible ? "eye-off" : "eye"}
                      size={20}
                      color={textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password Input */}
              <View style={styles.inputContainer}>
                <View style={styles.passwordInputWrapper}>
                  <StyledTextInput
                    label="Confirm Password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChangeText={(text) => setConfirmPassword(text)}
                    secureTextEntry={!isConfirmPasswordVisible}
                    autoCapitalize="none"
                    style={styles.textInput}
                    placeholderTextColor={
                      textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"
                    }
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() =>
                      setIsConfirmPasswordVisible(!isConfirmPasswordVisible)
                    }
                  >
                    <Ionicons
                      name={isConfirmPasswordVisible ? "eye-off" : "eye"}
                      size={20}
                      color={textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"}
                    />
                  </TouchableOpacity>
                </View>
                {passwordError && (
                  <StyledText style={[styles.errorText, { color: errorColor }]}>
                    {passwordError}
                  </StyledText>
                )}
              </View>

              {/* Referral Code Input */}
              <View style={styles.inputContainer}>
                <StyledTextInput
                  label="Referral Code (Optional)"
                  placeholder="Enter referral code if you have one"
                  value={signUpData?.referred_code || ""}
                  onChangeText={(text) =>
                    handleSignUpData("referred_code", text)
                  }
                  keyboardType="default"
                  autoCapitalize="characters"
                  style={styles.textInput}
                  placeholderTextColor={
                    textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"
                  }
                />
                <StyledText
                  style={[styles.helpText, { color: textColor }]}
                  variant="bodySmall"
                >
                  Get 10% off your first service with a valid referral code.
                  only valid for B2C users.
                </StyledText>
              </View>

              {/* Business section - shown when Fleet Owner or Dealership is checked */}
              {(signUpData?.isDealership || signUpData?.isFleetOwner) && (
                <View style={styles.businessSection}>
                  <View style={styles.inputContainer}>
                    <StyledTextInput
                      label="Business Name"
                      placeholder="Enter your business name"
                      value={signUpData?.business_name || ""}
                      onChangeText={(text) =>
                        handleSignUpData("business_name", text)
                      }
                      keyboardType="default"
                      autoCapitalize="words"
                      style={styles.textInput}
                      placeholderTextColor={
                        textColor === "#FFFFFF" ? "#B0B0B0" : "#999999"
                      }
                    />
                  </View>
                  <View style={styles.inputContainer}>
                    <AddressSearchInput
                      label="Business Address"
                      placeholder="Search for your business address..."
                      onSelect={(result) =>
                        handleSignUpData("business_address", result)
                      }
                      initialSelectedAddress={
                        signUpData?.business_address ?? null
                      }
                    />
                  </View>
                </View>
              )}

              {/* Open terms or privacy document in a read-only modal */}
              <TouchableOpacity
                style={styles.termsContainer}
                onPress={() => setDocumentModalType("terms")}
              >
                <StyledText variant="bodySmall" style={styles.termsText}>
                  Read our terms of service
                </StyledText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.termsContainer}
                onPress={() => setDocumentModalType("privacy")}
              >
                <StyledText variant="bodySmall" style={styles.termsText}>
                  Read our privacy policy
                </StyledText>
              </TouchableOpacity>

              {/* Checkbox: when checked, user has accepted terms and privacy; Continue is then enabled */}
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setTermsAccepted((prev) => !prev)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor,
                      backgroundColor: termsAccepted
                        ? buttonColor
                        : "transparent",
                    },
                  ]}
                >
                  {termsAccepted && (
                    <Ionicons name="checkmark" size={16} color="white" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <StyledText variant="bodySmall">
                    I have read and accepted the terms and conditions and
                    privacy policy
                  </StyledText>
                </View>
              </TouchableOpacity>

              {/* Continue Button - only proceeds to registration when checkbox is accepted; does not open any modal */}

              <StyledButton
                title={isRegisterLoading ? "Creating Account..." : "Continue"}
                onPress={termsAccepted ? handleSubmit : () => {}}
                disabled={!termsAccepted || isRegisterLoading}
                variant="tonal"
              />

              {/* Sign In Link */}
              <View style={styles.signInContainer}>
                <StyledText style={[styles.signInText, { color: textColor }]}>
                  Already have an account?{" "}
                  <StyledText
                    style={[styles.signInLink, { color: buttonColor }]}
                    onPress={() => router.push("/onboarding/SigninScreen")}
                  >
                    Login
                  </StyledText>
                </StyledText>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Read-only document modal: terms or privacy, fetched from API */}
      <DocumentModal
        visible={documentModalType !== null}
        docType={documentModalType}
        onClose={() => setDocumentModalType(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 10,
  },

  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  titleSection: {
    marginBottom: 30,
    padding: 10,
  },
  title: {
    fontWeight: "bold",
  },
  formSection: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 20,
    borderRadius: 20,
  },
  textInput: {
    borderRadius: 20,
    fontSize: 16,
  },
  passwordInputWrapper: {
    position: "relative",
  },
  eyeIcon: {
    position: "absolute",
    right: 12,
    top: 30,
    zIndex: 1,
    padding: 5,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  helpText: {
    fontSize: 10,
    marginTop: 4,
    marginLeft: 4,
    opacity: 0.7,
  },
  fleetOwnerContainer: {
    marginBottom: 10,
    paddingLeft: 10,
  },
  businessSection: {
    marginBottom: 20,
    marginTop: 4,
  },
  fleetOwnerText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  signInContainer: {
    alignItems: "center",
    padding: 20,
  },
  signInText: {
    fontSize: 10,
    textAlign: "center",
  },
  signInLink: {
    fontWeight: "600",
    fontSize: 10,
  },
  termsContainer: {
    padding: 5,
    marginBottom: 5,
  },
  termsText: {
    fontSize: 10,
    opacity: 0.7,
    fontWeight: "700",
  },
});

export default OnboardingScreen;
