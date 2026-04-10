import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import StyledButton from "@/app/components/helpers/StyledButton";
import useProfile from "@/app/app-hooks/useProfile";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

const ProfileUpdateScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");

  const { userProfile, updateProfilePayload, isUpdatingProfile } = useProfile();
  const { showSnackbarWithConfig } = useSnackbar();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name ?? "");
      setPhone(userProfile.phone ?? "");
      setEmail(userProfile.email ?? "");
      setBusinessName(userProfile.business_name ?? "");
    }
  }, [userProfile]);

  const isBranchAdmin = userProfile?.is_branch_admin === true;
  const canEditBusiness =
    userProfile?.is_fleet_owner === true || userProfile?.is_dealership === true;

  const handleSave = async () => {
    const payload: { name?: string; phone?: string; email?: string; business_name?: string } = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
    };
    if (canEditBusiness) {
      payload.business_name = businessName.trim();
    }
    const success = await updateProfilePayload(payload);
    if (success) {
      showSnackbarWithConfig({
        message: "Profile updated",
        type: "success",
        duration: 3000,
      });
    } else {
      showSnackbarWithConfig({
        message: "Failed to update profile",
        type: "error",
        duration: 3000,
      });
    }
  };

  if (isBranchAdmin) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={[styles.card, { borderColor }]}>
          <StyledText variant="bodyLarge" style={{ color: textColor }}>
            Profile updates are managed by your fleet. You cannot edit your profile here.
          </StyledText>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { borderColor }]}>
          <StyledText variant="labelLarge" style={[styles.sectionLabel, { color: textColor }]}>
            Personal info
          </StyledText>
          <StyledTextInput
            label="Name"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <View style={styles.spacer} />
          <StyledTextInput
            label="Phone"
            placeholder="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <View style={styles.spacer} />
          <StyledTextInput
            label="Email"
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {canEditBusiness && (
            <>
              <View style={styles.spacer} />
              <StyledText variant="labelLarge" style={[styles.sectionLabel, { color: textColor }]}>
                Business info
              </StyledText>
              <StyledTextInput
                label="Business name"
                placeholder="Your business name"
                value={businessName}
                onChangeText={setBusinessName}
                autoCapitalize="words"
              />
            </>
          )}
        </View>

        <StyledButton
          title={isUpdatingProfile ? "Saving..." : "Save changes"}
          onPress={handleSave}
          disabled={isUpdatingProfile}
          variant="tonal"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default ProfileUpdateScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 8,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 5,
    borderWidth: 0.5,
    padding: 16,
    marginBottom: 24,
  },
  sectionLabel: {
    marginBottom: 12,
  },
  spacer: {
    height: 16,
  },
  saveWrap: {
    marginTop: 8,
  },
});
