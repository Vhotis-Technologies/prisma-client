import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledTextInput from "../helpers/StyledTextInput";
import StyledButton from "../helpers/StyledButton";
import { Divider } from "react-native-paper";
import useProfile from "@/app/app-hooks/useProfile";
import AddressSearchInput from "../shared/AddressSearchInput";

/**
 * Content component for adding a new address.
 * Designed to be used inside ModalServices with modalType="fullscreen".
 * The parent provides the modal title and close button in the ModalServices header.
 */
export interface AddAddressModalProps {
  onClose: () => void;
  onSave: () => void;
}

const AddAddressModal: React.FC<AddAddressModalProps> = ({ onClose, onSave }) => {
  const { collectNewAddress, setFullNewAddress, newAddress } = useProfile();
  
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");

  const [isLoading, setIsLoading] = useState(false);
  const [useManualEntry, setUseManualEntry] = useState(false);

  const handleAddressSelect = useCallback(
    (result: { address: string; post_code: string; city: string; country: string; latitude: number; longitude: number }) => {
      setFullNewAddress(result);
    },
    [setFullNewAddress]
  );

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Google Places Address Search */}
          {!useManualEntry && (
            <View style={styles.section}>
              <StyledText
                variant="titleMedium"
                style={[styles.sectionTitle, { color: textColor }]}
              >
                Search for your address
              </StyledText>
              <AddressSearchInput
                label="Address"
                placeholder="Start typing your address..."
                onSelect={handleAddressSelect}
              />
              <TouchableOpacity
                onPress={() => setUseManualEntry(true)}
                style={styles.manualLink}
              >
                <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                  Can't find your address? Enter it manually
                </StyledText>
              </TouchableOpacity>
            </View>
          )}

          {/* Manual Address Form */}
          {useManualEntry && (
            <>
              <View style={styles.dividerContainer}>
                <Divider
                  style={[styles.divider, { backgroundColor: borderColor }]}
                />
                <StyledText
                  variant="bodySmall"
                  style={[styles.dividerText, { color: textColor }]}
                >
                  Manual Entry
                </StyledText>
                <Divider
                  style={[styles.divider, { backgroundColor: borderColor }]}
                />
              </View>

              <View style={styles.section}>
                <StyledText
                  variant="titleMedium"
                  style={[styles.sectionTitle, { color: textColor }]}
                >
                  Enter Address Manually
                </StyledText>
                <TouchableOpacity
                  onPress={() => setUseManualEntry(false)}
                  style={styles.manualLink}
                >
                  <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                    Or search for address instead
                  </StyledText>
                </TouchableOpacity>

                <View style={styles.formContainer}>
                  <StyledTextInput
                    label="Street Address"
                    placeholder="Enter your street address"
                    value={newAddress?.address}
                    onChangeText={(text) => collectNewAddress("address", text)}
                    autoCapitalize="words"
                    style={styles.input}
                  />

                  <View style={styles.inputRow}>
                    <StyledTextInput
                      label="Post Code"
                      placeholder="Post code"
                      value={newAddress?.post_code}
                      onChangeText={(text) => collectNewAddress("post_code", text)}
                      autoCapitalize="characters"
                      style={styles.input}
                    />
                    <StyledTextInput
                      label="City"
                      placeholder="City"
                      value={newAddress?.city}
                      onChangeText={(text) => collectNewAddress("city", text)}
                      autoCapitalize="words"
                      style={styles.input}
                    />
                  </View>

                  <StyledTextInput
                    label="Country"
                    placeholder="Enter country"
                    value={newAddress?.country}
                    onChangeText={(text) => collectNewAddress("country", text)}
                    autoCapitalize="words"
                    style={styles.input}
                  />
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.footer}>
          <StyledButton
            title="Cancel"
            variant="tonal"
            onPress={onClose}
            style={[styles.cancelButton, { borderColor: borderColor }]}
          />
          <StyledButton
            title={isLoading ? "Saving..." : "Save Address"}
            variant="medium"
            onPress={onSave}
            disabled={isLoading}
            style={styles.saveButton}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

export default AddAddressModal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 5,
  },
  content: {
    flex: 1,
    paddingVertical: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 16,
  },
  manualLink: {
    marginTop: 12,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    opacity: 0.5,
    fontWeight: "500",
  },
  formContainer: {
    gap: 16,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  input: {
    marginBottom: 0,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  saveButton: {
    flex: 1,
  },
  cancelButton: {
    borderWidth: 1,
  },
});
