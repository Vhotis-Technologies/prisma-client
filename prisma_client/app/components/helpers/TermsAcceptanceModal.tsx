import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  StatusBar,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import StyledText from "./StyledText";
import { useGetTermsAndConditionsQuery } from "@/app/store/api/authApi";
import { ActivityIndicator } from "react-native-paper";

// Design to match Terms of Service reference: light grey background, blue accents, white card
const CARD_BG = "#FFFFFF";
const SCREEN_BG = "#E8ECF0"; // light grey background
const PRIMARY_BLUE = "#5B9BD5";
const PRIMARY_BLUE_LIGHT = "#7EB8E8";
const TEXT_DARK = "#2C3E50";
const TEXT_MUTED = "#6B7C8D";
const BORDER_LIGHT = "#E8EFF5";

interface TermsAcceptanceModalProps {
  visible: boolean;
  onAccept: () => void;
  onClose: () => void;
  onDecline?: () => void;
}

const TermsAcceptanceModal: React.FC<TermsAcceptanceModalProps> = ({
  visible,
  onAccept,
  onClose,
  onDecline,
}) => {
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const {
    data: termsAndConditions,
    isLoading,
    isError,
  } = useGetTermsAndConditionsQuery();

  const lastUpdatedFormatted = termsAndConditions?.last_updated
    ? new Date(termsAndConditions.last_updated).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "N/A";

  const bothAccepted = agreeTerms && agreePrivacy;

  const handleAccept = () => {
    if (bothAccepted) onAccept();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={SCREEN_BG} />

        <View style={styles.contentWrap}>
          <View style={styles.card}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={PRIMARY_BLUE} />
                <StyledText style={styles.loadingText}>
                  Loading terms and conditions...
                </StyledText>
              </View>
            ) : isError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color="#D32F2F" />
                <StyledText style={styles.errorText}>
                  Failed to load terms and conditions. Please try again.
                </StyledText>
              </View>
            ) : (
              <>
                {/* Header: icon + title + update date */}
                <View style={styles.cardHeader}>
                  <View style={styles.docIconWrap}>
                    <View style={styles.docIconBack} />
                    <View style={styles.docIconFront}>
                      <View style={styles.docIconLines}>
                        <View style={styles.docLine} />
                        <View style={styles.docLine} />
                        <View style={styles.docLine} />
                      </View>
                    </View>
                  </View>
                  <View style={styles.cardHeaderText}>
                    <StyledText style={styles.cardTitle}>
                      Terms of Service
                    </StyledText>
                    <StyledText style={styles.cardSubtitle}>
                      Update {lastUpdatedFormatted}
                    </StyledText>
                  </View>
                </View>

                {/* Terms content - flexes to fill space */}
                <View style={styles.termsContentWrap}>
                  <WebView
                    originWhitelist={["*"]}
                    source={{
                      html: `
                        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
                        <style>
                          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; color: #6B7C8D; line-height: 1.6; margin: 0; padding: 0; }
                          strong { color: #2C3E50; }
                          p strong:first-child { color: #5B9BD5; font-weight: bold; }
                          a { color: #5B9BD5; text-decoration: none; }
                        </style>
                        ${termsAndConditions?.content || "No terms available"}
                      `,
                    }}
                    style={styles.termsWebView}
                    scrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  />
                </View>

                {/* Checkboxes - follow terms content */}
                <View style={styles.checkboxGroup}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setAgreeTerms((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        agreeTerms && styles.checkboxChecked,
                      ]}
                    >
                      {agreeTerms && (
                        <Ionicons name="checkmark" size={16} color={PRIMARY_BLUE} />
                      )}
                    </View>
                    <StyledText style={styles.checkboxLabel}>
                      I agree with the{" "}
                      <StyledText style={styles.checkboxLabelBold}>
                        Terms and Conditions
                      </StyledText>
                    </StyledText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setAgreePrivacy((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        agreePrivacy && styles.checkboxChecked,
                      ]}
                    >
                      {agreePrivacy && (
                        <Ionicons name="checkmark" size={16} color={PRIMARY_BLUE} />
                      )}
                    </View>
                    <StyledText style={styles.checkboxLabel}>
                      I agree with the{" "}
                      <StyledText style={styles.checkboxLabelBold}>
                        Privacy Policy
                      </StyledText>
                    </StyledText>
                  </TouchableOpacity>
                </View>

                {/* Buttons - pinned to bottom */}
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.declineButton}
                    onPress={onDecline || onClose}
                    activeOpacity={0.8}
                  >
                    <StyledText style={styles.declineButtonText}>
                      Decline
                    </StyledText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.acceptButton,
                      !bothAccepted && styles.acceptButtonDisabled,
                    ]}
                    onPress={handleAccept}
                    disabled={!bothAccepted}
                    activeOpacity={0.8}
                  >
                    <StyledText
                      style={[
                        styles.acceptButtonText,
                        !bothAccepted && styles.acceptButtonTextDisabled,
                      ]}
                    >
                      Accept
                    </StyledText>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  contentWrap: {
    flex: 1,
  },
  card: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 15,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  docIconWrap: {
    width: 48,
    height: 48,
    marginRight: 14,
    position: "relative",
  },
  docIconBack: {
    position: "absolute",
    left: 6,
    top: 6,
    width: 36,
    height: 44,
    backgroundColor: "#7EB8E8",
    borderRadius: 4,
  },
  docIconFront: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 36,
    height: 44,
    backgroundColor: "#B8D9F5",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    justifyContent: "flex-start",
    paddingTop: 10,
    paddingHorizontal: 6,
  },
  docIconLines: {
    marginTop: 2,
  },
  docLine: {
    height: 3,
    backgroundColor: "rgba(44, 62, 80, 0.25)",
    borderRadius: 2,
    width: "100%",
    marginBottom: 4,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: PRIMARY_BLUE,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: TEXT_MUTED,
  },
  termsContentWrap: {
    flex: 1,
    marginBottom: 20,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FAFBFC",
    minHeight: 120,
  },
  termsWebView: {
    flex: 1,
    backgroundColor: "transparent",
  },
  checkboxGroup: {
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: TEXT_MUTED,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#E8EFF5",
    borderColor: "#9E9E9E",
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: TEXT_MUTED,
  },
  checkboxLabelBold: {
    fontWeight: "bold",
    color: PRIMARY_BLUE,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
  },
  declineButton: {
    flex: 1,
    height: 40,
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: PRIMARY_BLUE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: PRIMARY_BLUE,
  },
  acceptButton: {
    flex: 1,
    height: 40,
    backgroundColor: PRIMARY_BLUE,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  acceptButtonDisabled: {
    backgroundColor: "#B0C4DE",
    opacity: 0.9,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  acceptButtonTextDisabled: {
    color: "rgba(255,255,255,0.8)",
  },
  loadingContainer: {
    flex: 1,
    minHeight: 280,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: TEXT_MUTED,
  },
  errorContainer: {
    flex: 1,
    minHeight: 280,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    marginTop: 16,
    fontSize: 15,
    color: TEXT_MUTED,
    textAlign: "center",
  },
});

export default TermsAcceptanceModal;
