import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../components/helpers/StyledText";
import SquareCheckbox from "../components/helpers/SquareCheckbox";
import StyledTextInput from "../components/helpers/StyledTextInput";
import DocumentModal from "../components/helpers/DocumentModal";
import type { DocumentModalType } from "../components/helpers/DocumentModal";
import AddressSearchInput from "../components/shared/AddressSearchInput";
import { useThemeColor } from "@/hooks/useThemeColor";
import useOnboarding from "../app-hooks/useOnboarding";
import { useAlertContext } from "../contexts/AlertContext";
import StyledButton from "../components/helpers/StyledButton";
import { useAppDispatch } from "../store/main_store";
import {
  clearSignUpAccountSelection,
  setSignUpAccountType,
} from "../store/slices/authSlice";
import type { SignUpAccountType } from "../interfaces/AuthInterface";

const ACCOUNT_TITLE: Record<SignUpAccountType, string> = {
  b2c: "Personal",
  fleet_operator: "Fleet operator",
  dealership: "Dealership",
};

const OnboardingScreen = () => {
  const dispatch = useAppDispatch();
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
  const iconColor = useThemeColor({}, "icons");

  const accountType = signUpData?.signUpAccountType;
  const signUpIsFleet = signUpData?.isFleetOwner;
  const signUpIsDealership = signUpData?.isDealership;

  useEffect(() => {
    if (accountType) return;
    if (signUpIsDealership) {
      dispatch(setSignUpAccountType("dealership"));
      return;
    }
    if (signUpIsFleet) {
      dispatch(setSignUpAccountType("fleet_operator"));
      return;
    }
    router.replace("/onboarding/" as any);
  }, [dispatch, accountType, signUpIsFleet, signUpIsDealership]);

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
      if (!signUpData.signUpAccountType) {
        setAlertConfig({
          title: "Account type required",
          message: "Please go back and choose how you will use Prisma.",
          type: "error",
          isVisible: true,
          onConfirm: () => setIsVisible(false),
        });
        return;
      }
      const needsBusinessData =
        signUpData.signUpAccountType === "fleet_operator" ||
        signUpData.signUpAccountType === "dealership";
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
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
          {/* Main Content */}
          <View style={styles.content}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <StyledText
                style={[styles.title, { color: textColor }]}
                variant="headlineMedium"
              >
                Your details
              </StyledText>
              {accountType && (
                <View style={[styles.accountRow, { borderColor }]}>
                  <View style={styles.accountRowText}>
                    <StyledText
                      variant="bodySmall"
                      style={[styles.accountKindLabel, { color: textColor }]}
                    >
                      Signing up as
                    </StyledText>
                    <StyledText
                      variant="titleSmall"
                      style={{ color: textColor, fontWeight: "600" }}
                    >
                      {ACCOUNT_TITLE[accountType]}
                    </StyledText>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      dispatch(clearSignUpAccountSelection());
                      router.replace("/onboarding/" as any);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <StyledText
                      variant="labelLarge"
                      style={{ color: buttonColor, fontWeight: "600" }}
                    >
                      Change
                    </StyledText>
                  </TouchableOpacity>
                </View>
              )}
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

              {/* Referral Code Input — B2C only */}
              {signUpData?.signUpAccountType === "b2c" && (
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
                    Only valid for personal accounts.
                  </StyledText>
                </View>
              )}

              {/* Business section — fleet operator or dealership */}
              {(signUpData?.signUpAccountType === "fleet_operator" ||
                signUpData?.signUpAccountType === "dealership") && (
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
                <SquareCheckbox
                  checked={termsAccepted}
                  borderColor={borderColor}
                  checkedBackgroundColor={buttonColor}
                  checkColor="white"
                  size="compact"
                  style={styles.checkboxBoxOffset}
                />
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
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  accountRowText: {
    flex: 1,
    marginRight: 12,
  },
  accountKindLabel: {
    opacity: 0.75,
    marginBottom: 2,
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
  businessSection: {
    marginBottom: 20,
    marginTop: 4,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 10,
  },
  checkboxBoxOffset: {
    marginRight: 12,
    marginTop: 2,
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
