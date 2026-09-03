import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "./StyledText";
import { Colors } from "@/constants/Colors";
import { LinearGradient } from "expo-linear-gradient";

const { width: screenWidth } = Dimensions.get("window");

const AlertModal = ({
  isVisible,
  onClose,
  onConfirm,
  title,
  message,
  type = "error",
  confirmLabel,
  cancelLabel,
}: {
  isVisible: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  type?: "success" | "error" | "warning";
  confirmLabel?: string;
  cancelLabel?: string;
}) => {
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const warningColor = useThemeColor({}, "warning");
  const errorColor = useThemeColor({}, "error");
  const successColor = useThemeColor({}, "success");
  const backgroundColor = useThemeColor({}, "background");
  const primaryColor = useThemeColor({}, "primary");
  // Function to determine title color based on type
  const getTitleColor = () => {
    switch (type) {
      case "success":
        return successColor;
      case "error":
        return errorColor;
      case "warning":
        return warningColor;
      default:
        return errorColor;
    }
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: cardColor,
              borderColor: borderColor + "30",
            },
          ]}
        >
          <StyledText
            variant="titleMedium"
            style={[styles.title, { color: getTitleColor() }]}
            children={title}
          />
          <StyledText
            variant="bodyMedium"
            style={[styles.message, { color: textColor }]}
            children={message}
          />

          <View style={[styles.buttonContainer, { borderTopColor: borderColor }]}>
            {onClose && (
              <TouchableOpacity
                onPress={onClose}
                style={[
                  styles.button,
                  { borderColor: borderColor },
                ]}
                activeOpacity={0.7}
              >
                <StyledText
                  children={cancelLabel ?? "Cancel"}
                  variant="labelMedium"
                  style={[styles.cancelButtonText, { color: textColor }]}
                />
              </TouchableOpacity>
            )}

            {onConfirm && (
              <TouchableOpacity
                onPress={() => {
                  onConfirm?.();
                  onClose?.();
                }}
                style={[
                  styles.button,
                  !onClose && { backgroundColor: primaryColor },
                ]}
                activeOpacity={0.8}
              >
                <StyledText
                  children={confirmLabel ?? "Confirm"}
                  variant="labelMedium"
                  style={[
                    styles.confirmButtonText,
                    { color: !onClose ? "#fff" : textColor },
                  ]}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContainer: {
    borderRadius: 20,
    padding: 20,
    width: Math.min(screenWidth - 40, 350),
    maxWidth: 350,
    minWidth: 280,
    elevation: 3,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    fontFamily: "BarlowMedium",
    letterSpacing: 0.2,
  },
  message: {
    fontSize: 15,
    fontFamily: "BarlowRegular",
    fontWeight: "400",
    lineHeight: 22,
    marginBottom: 24,
    letterSpacing: 0.1,
  },
  buttonContainer: {
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginBottom: -10,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  cancelButtonText: {
    fontWeight: "500",
    fontSize: 15,
  },
  confirmButtonText: {
    fontWeight: "500",
    fontSize: 15,
  },
});

export default AlertModal;
