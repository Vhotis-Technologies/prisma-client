import React, { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Alert,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import StyledText from "../components/helpers/StyledText";
import StyledTextInput from "../components/helpers/StyledTextInput";
import StyledButton from "../components/helpers/StyledButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import { useRequestPasswordResetMutation } from "@/app/store/api/authApi";


const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  // Theme colors
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const cardColor = useThemeColor({}, "cards");

  // API mutation
  const [requestPasswordReset, { isLoading }] =
    useRequestPasswordResetMutation();

  const handleSendResetEmail = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    try {
      const response = await requestPasswordReset({
        email: email.trim().toLowerCase(),
      }).unwrap();

      if (response.message) {
        setEmailSent(true);
      }
    } catch (error: any) {
      console.error("Password reset error:", error);
      Alert.alert("Error", error.data?.error || "Failed to send reset email");
    }
  };

  if (emailSent) {
    return (
      <View style={[styles.container, { backgroundColor: backgroundColor }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="mail-outline" size={64} color={primaryColor} />
            <StyledText
              variant="headlineSmall"
              style={[styles.title, { color: textColor }]}
            >
              Check Your Email
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.subtitle, { color: textColor }]}
            >
              We've sent a password reset link to {email}
            </StyledText>
          </View>

          <View
            style={[styles.card, { backgroundColor: cardColor, borderColor }]}
          >
            <StyledText
              variant="bodyMedium"
              style={[styles.cardText, { color: textColor }]}
            >
              Please check your email and click the link to reset your password.
              The link will expire in 1 hour.
            </StyledText>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: backgroundColor }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <StyledText
            variant="headlineSmall"
            style={[styles.title, { color: textColor }]}
          >
            Forgot Password?
          </StyledText>
          <StyledText
            variant="bodySmall"
            style={[styles.subtitle, { color: textColor }]}
          >
            Enter your email address and we'll send you a link to reset your
            password
          </StyledText>
        </View>

        <View style={styles.formContainer}>
          <StyledTextInput
            label="Email Address"
            placeholder="Enter your email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <StyledButton
            variant="small"
            onPress={handleSendResetEmail}
            disabled={isLoading}
            style={styles.resetButton}
            title={isLoading ? "Sending..." : "Send Reset Link"}
          />
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
    paddingTop: 60,
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
    marginBottom: 40,
    marginTop: 50,
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
  resetButton: {
    width: "100%",
  },
  card: {
    borderRadius: 10,
    padding: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  cardText: {
    textAlign: "center",
    lineHeight: 22,
  },
});

export default ForgotPasswordScreen;
