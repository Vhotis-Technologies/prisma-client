import React from "react";
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
import {
  useGetTermsAndConditionsQuery,
  useGetPrivacyPolicyQuery,
} from "@/app/store/api/authApi";
import { ActivityIndicator } from "react-native-paper";

const CARD_BG = "#FFFFFF";
const SCREEN_BG = "#E8ECF0";
const PRIMARY_BLUE = "#5B9BD5";
const TEXT_MUTED = "#6B7C8D";

export type DocumentModalType = "terms" | "privacy";

interface DocumentModalProps {
  visible: boolean;
  docType: DocumentModalType | null;
  onClose: () => void;
}

const DocumentModal: React.FC<DocumentModalProps> = ({
  visible,
  docType,
  onClose,
}) => {
  const showTerms = docType === "terms";
  const showPrivacy = docType === "privacy";

  const {
    data: termsData,
    isLoading: termsLoading,
    isError: termsError,
  } = useGetTermsAndConditionsQuery(undefined, { skip: !showTerms || !visible });

  const {
    data: privacyData,
    isLoading: privacyLoading,
    isError: privacyError,
  } = useGetPrivacyPolicyQuery(undefined, {
    skip: !showPrivacy || !visible,
  });

  const isLoading = showTerms ? termsLoading : privacyLoading;
  const isError = showTerms ? termsError : privacyError;
  const data = showTerms ? termsData : privacyData;
  const title = showTerms ? "Terms of Service" : "Privacy Policy";
  const loadMessage = showTerms
    ? "Loading terms and conditions..."
    : "Loading privacy policy...";
  const errorMessage = showTerms
    ? "Failed to load terms and conditions. Please try again."
    : "Failed to load privacy policy. Please try again.";

  const lastUpdatedFormatted =
    data?.last_updated &&
    new Date(data.last_updated).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  if (!visible || !docType) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.screenContainer}>
        <View style={styles.contentWrap}>
          <View style={styles.card}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={PRIMARY_BLUE} />
                <StyledText style={styles.loadingText}>{loadMessage}</StyledText>
              </View>
            ) : isError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color="#D32F2F" />
                <StyledText style={styles.errorText}>{errorMessage}</StyledText>
              </View>
            ) : (
              <>
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
                    <StyledText style={styles.cardTitle}>{title}</StyledText>
                    <StyledText style={styles.cardSubtitle}>
                      Updated {lastUpdatedFormatted ?? "N/A"}
                    </StyledText>
                  </View>
                </View>

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
                        ${data?.content ?? "No content available"}
                      `,
                    }}
                    style={styles.termsWebView}
                    scrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  />
                </View>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={onClose}
                    activeOpacity={0.8}
                  >
                    <StyledText style={styles.closeButtonText}>Close</StyledText>
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
  buttonRow: {
    flexDirection: "row",
    marginTop: "auto",
  },
  closeButton: {
    flex: 1,
    height: 40,
    backgroundColor: PRIMARY_BLUE,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
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

export default DocumentModal;
