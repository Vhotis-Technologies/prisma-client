import { StyleSheet, Text, View, Linking } from "react-native";
import React, { useState } from "react";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledButton from "../helpers/StyledButton";
import { usePermissions } from "@/app/app-hooks/usePermissions";
import { useNotification } from "@/app/app-hooks/useNotification";
import StyledText from "../helpers/StyledText";
import { Snackbar } from "react-native-paper";

const AllowNotificationModal = ({
  onClose,
  onPermissionGranted,
}: {
  onClose: () => void;
  onPermissionGranted?: () => void;
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const {
    requestNotificationPermission,
    checkNotificationPermission,
    permissionStatus,
  } = usePermissions();
  const { saveNotificationToken, expoPushToken, isSavingToken } =
    useNotification();

  // Snackbar state for user feedback
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  // Check if we can ask for permission
  const canAskAgain = permissionStatus.notifications.canAskAgain;

  /**
   * Handle the notification permission requests and call the onPermissionGranted callback if the permission is granted.
   * Also saves the push token to the server when permission is granted.
   */
  const handleEnableNotifications = async () => {
    try {
      const granted = await requestNotificationPermission();

      if (granted) {
        // Save the push token to the server
        if (expoPushToken) {
          await saveNotificationToken(expoPushToken);
        }

        setSnackbarMessage("Notifications enabled successfully!");
        setSnackbarVisible(true);
        onPermissionGranted?.();

        // Close modal after showing success message
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setSnackbarMessage(
          "Permission was previously denied. Please enable notifications in your device settings, then restart the app."
        );
        setSnackbarVisible(true);

        // Close modal after showing error message
        setTimeout(() => {
          onClose();
        }, 4000);
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      setSnackbarMessage(
        "Error requesting permission. Please try again or enable in device settings."
      );
      setSnackbarVisible(true);

      // Close modal after showing error message
      setTimeout(() => {
        onClose();
      }, 3000);
    }
  };

  const handleNotNow = () => {
    onClose();
  };

  return (
    <View style={[styles.content, { backgroundColor }]}>
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor }]}>
        <Text style={[styles.icon, { color: primaryColor }]}>🔔</Text>
      </View>

      {/* Title */}
      <StyledText style={[styles.title]} variant="titleLarge">
        Stay in the Loop!
      </StyledText>

      {/* Description */}
      <StyledText style={[styles.description]} variant="bodyMedium">
        Never miss important updates about your car services! Get notified about
        booking confirmations, service updates, and exclusive offers.
      </StyledText>

      {/* Helpful tip */}
      <StyledText style={[styles.helpText]} variant="bodySmall">
        {canAskAgain
          ? "💡 When you tap 'Enable Notifications', your device will ask for permission. Please tap 'Allow' to receive notifications."
          : "⚠️ Notification permission was previously denied. Please enable notifications in your device settings to receive updates."}
      </StyledText>

      {/* Benefits */}
      <View style={styles.benefitsContainer}>
        <View style={styles.benefitItem}>
          <StyledText style={[styles.benefitIcon, { color: primaryColor }]}>
            ✓
          </StyledText>
          <StyledText style={[styles.benefitText, { color: textColor }]}>
            Booking confirmations
          </StyledText>
        </View>
        <View style={styles.benefitItem}>
          <StyledText style={[styles.benefitIcon, { color: primaryColor }]}>
            ✓
          </StyledText>
          <StyledText style={[styles.benefitText, { color: textColor }]}>
            Service updates
          </StyledText>
        </View>
        <View style={styles.benefitItem}>
          <StyledText style={[styles.benefitIcon, { color: primaryColor }]}>
            ✓
          </StyledText>
          <StyledText style={[styles.benefitText, { color: textColor }]}>
            Exclusive offers
          </StyledText>
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        {canAskAgain ? (
          // Show Enable/Ask Later when we can ask for permission
          <>
            <StyledButton
              title={isSavingToken ? "Setting up..." : "Enable Notifications"}
              variant="medium"
              onPress={handleEnableNotifications}
              style={styles.enableButton}
              disabled={isSavingToken}
            />
            <StyledButton
              title="Ask Later"
              variant="medium"
              onPress={handleNotNow}
              style={[styles.notNowButton, { borderColor }]}
            />
          </>
        ) : (
          // Show Open Settings when permission was permanently denied
          <>
            <StyledButton
              title="Open Settings"
              variant="medium"
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch (error) {
                  console.error("Error opening settings:", error);
                  setSnackbarMessage(
                    "Could not open settings. Please go to device settings manually."
                  );
                  setSnackbarVisible(true);
                }
              }}
              style={[styles.enableButton, { backgroundColor: primaryColor }]}
            />
            <StyledButton
              title="Cancel"
              variant="medium"
              onPress={handleNotNow}
              style={[styles.notNowButton, { borderColor }]}
            />
          </>
        )}
      </View>

      {/* Snackbar for user feedback */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

export default AllowNotificationModal;

const styles = StyleSheet.create({
  content: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    textAlign: "center",
    marginBottom: 16,
  },
  helpText: {
    textAlign: "center",
    marginBottom: 24,
    fontStyle: "italic",
    opacity: 0.8,
  },
  benefitsContainer: {
    width: "100%",
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  benefitIcon: {
    fontSize: 18,
    fontWeight: "bold",
    marginRight: 12,
    width: 20,
    textAlign: "center",
  },
  benefitText: {
    fontSize: 15,
    flex: 1,
  },
  buttonContainer: {
    width: "100%",
    gap: 12,
  },
  enableButton: {
    width: "100%",
  },
  notNowButton: {
    width: "100%",
  },
});
