import React, { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Platform,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useAuthContext } from "../contexts/AuthContextProvider";
import StyledText from "../components/helpers/StyledText";
import StyledTextInput from "../components/helpers/StyledTextInput";
import StyledButton from "../components/helpers/StyledButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAlertContext } from "../contexts/AlertContext";
import { useSnackbar } from "../contexts/SnackbarContext";

const SigninScreen = () => {
  const { handleLogin, isLoading } = useAuthContext();
  const { setAlertConfig, setIsVisible } = useAlertContext();
  const { showSnackbarWithConfig } = useSnackbar();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Theme colors
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const cardColor = useThemeColor({}, "cards");

  /**
   * Handle the sign-in process
   */
  const handleSignIn = async () => {
    // Basic validation
    if (!email.trim()) {
      showSnackbarWithConfig({
        message: "Please enter your email address",
        type: "error",
        duration: 3000,
      });
      return;
    }

    if (!password.trim()) {
      showSnackbarWithConfig({
        message: "Please enter your password",
        type: "error",
        duration: 3000,
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showSnackbarWithConfig({
        message: "Please enter a valid email address",
        type: "error",
        duration: 3000,
      });
      return;
    }

    try {
      await handleLogin(email.trim(), password, rememberMe);
    } catch (error) {
      console.error("Sign-in error:", error);
    }
  };

  /**
   * Handle forgot password action
   */
  const handleForgotPassword = () => {
    router.push("/onboarding/ForgotPasswordScreen");
  };

  /**
   * Navigate to sign up screen
   */
  const handleSignUp = () => {
    router.push("/onboarding/OnboardingScreen");
  };

  return (
    <View style={[styles.container, { backgroundColor: backgroundColor }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Section */}
        <View style={styles.header}>
          <StyledText
            variant="headlineSmall"
            style={[styles.title, { color: textColor }]}
          >
            Login
          </StyledText>
        </View>

        {/* Form Section */}
        <View style={styles.formContainer}>
          {/* Email Input */}
          <StyledTextInput
            label="Email"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          {/* Password Input */}
          <View style={styles.passwordContainer}>
            <StyledTextInput
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.passwordInput]}
            />
            <TouchableOpacity
              style={[styles.eyeIcon, { borderColor }]}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={20}
                color={"black"}
              />
            </TouchableOpacity>
          </View>

          {/* Remember Me & Forgot Password Row */}
          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={styles.rememberMeContainer}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View style={[styles.checkbox, { borderColor }]}>
                {rememberMe && (
                  <Ionicons name="checkmark" size={16} color={textColor} />
                )}
              </View>
              <StyledText
                variant="bodyMedium"
                style={[styles.rememberMeText, { color: textColor }]}
              >
                Remember me
              </StyledText>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleForgotPassword}>
              <StyledText variant="bodySmall" style={[styles.forgotPassword]}>
                Forgot Password?
              </StyledText>
            </TouchableOpacity>
          </View>

          {/* Continue Button */}
          <StyledButton
            variant="tonal"
            onPress={handleSignIn}
            disabled={isLoading}
            style={styles.signInButton}
            title={isLoading ? "Signing In..." : "Continue"}
          />
        </View>

        {/* Sign Up Section */}
        <View style={styles.signUpContainer}>
          <StyledText
            variant="bodyMedium"
            style={[styles.signUpText, { color: textColor }]}
          >
            Haven't registered yet?{" "}
          </StyledText>
          <TouchableOpacity onPress={handleSignUp}>
            <StyledText
              variant="bodySmall"
              style={[styles.signUpLink, { color: primaryColor }]}
            >
              Register here
            </StyledText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 10,
    marginTop: 20,
    alignItems: "center",
  },
  title: {
    marginBottom: 8,
    textAlign: "left",
  },
  subtitle: {
    textAlign: "left",
    opacity: 0.7,
  },
  formContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 24,
    width: "100%",
    alignSelf: "center",
  },
  input: {
    marginBottom: 20,
    borderRadius: 20,
  },
  passwordContainer: {
    position: "relative",
    marginBottom: 20,
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: "absolute",
    right: 10,
    top: 25,
    padding: 8,
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rememberMeText: {
    fontSize: 14,
  },
  forgotPassword: {
    fontSize: 10,
    textDecorationLine: "underline",
  },
  signInButton: {
    width: "100%",
  },
  signUpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  signUpText: {
    fontSize: 10,
  },
  signUpLink: {
    fontSize: 10,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});

export default SigninScreen;
