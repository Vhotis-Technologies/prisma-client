import React from "react";
import {
  Modal,
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";
import { VehicleBasicInfo } from "@/app/interfaces/VehicleHistoryInterfaces";

const { width: screenWidth } = Dimensions.get("window");

interface VehicleExistsModalProps {
  visible: boolean;
  onClose: () => void;
  onProceedToPayment: () => void;
  vehicleInfo: VehicleBasicInfo;
  paymentAmount: number;
  vin: string;
  isAuthenticated?: boolean;
}

const VehicleExistsModal: React.FC<VehicleExistsModalProps> = ({
  visible,
  onClose,
  onProceedToPayment,
  vehicleInfo,
  paymentAmount,
  vin,
  isAuthenticated = false,
}) => {
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const backgroundColor = useThemeColor({}, "background");
  const primaryColor = useThemeColor({}, "primary");
  const successColor = useThemeColor({}, "success");

  const formatPrice = (amount: number) => {
    return `€${amount.toFixed(2)}`;
  };

  const handleProceedClick = () => {
    if (!isAuthenticated) {
      // For unregistered users: Navigate to payment information screen
      onClose();
      router.push({
        pathname: "/vehiclehistory/VehicleLookupPaymentScreen",
        params: {
          vehicleInfo: JSON.stringify(vehicleInfo),
          vin: vin,
          paymentAmount: paymentAmount.toString(),
        },
      });
    } else {
      // For registered users: Call existing payment handler
      onProceedToPayment();
    }
  };

  return (
    <Modal
      visible={visible}
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
          {/* Success Icon */}
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: successColor + "20" }]}>
              <Ionicons name="checkmark-circle" size={48} color={successColor} />
            </View>
          </View>

          {/* Title */}
          <StyledText
            variant="titleLarge"
            style={[styles.title, { color: textColor }]}
          >
            Vehicle Found!
          </StyledText>

          {/* Vehicle Information */}
          <View style={[styles.vehicleInfoCard, { backgroundColor: backgroundColor }]}>
            <View style={styles.vehicleInfoRow}>
              <StyledText variant="labelMedium" style={{ color: textColor }}>
                Make:
              </StyledText>
              <StyledText variant="labelLarge" style={{ color: textColor }}>
                {vehicleInfo.make}
              </StyledText>
            </View>
            <View style={styles.vehicleInfoRow}>
              <StyledText variant="labelMedium" style={{ color: textColor }}>
                Model:
              </StyledText>
              <StyledText variant="labelLarge" style={{ color: textColor }}>
                {vehicleInfo.model}
              </StyledText>
            </View>
            <View style={styles.vehicleInfoRow}>
              <StyledText variant="labelMedium" style={{ color: textColor }}>
                Year:
              </StyledText>
              <StyledText variant="labelLarge" style={{ color: textColor }}>
                {vehicleInfo.year}
              </StyledText>
            </View>
            <View style={styles.vehicleInfoRow}>
              <StyledText variant="labelMedium" style={{ color: textColor }}>
                Color:
              </StyledText>
              <StyledText variant="labelLarge" style={{ color: textColor }}>
                {vehicleInfo.color}
              </StyledText>
            </View>
          </View>

          {/* Message */}
          <StyledText
            variant="bodyMedium"
            style={[styles.message, { color: textColor }]}
          >
            Proceed to payment to view the complete vehicle history including
            ownership records, location history, service records, and more.
          </StyledText>

          {/* Payment Amount */}
          <View style={[styles.paymentAmountContainer, { borderColor: borderColor }]}>
            <StyledText variant="labelMedium" style={{ color: textColor }}>
              Payment Amount:
            </StyledText>
            <StyledText
              variant="titleLarge"
              style={[styles.paymentAmount, { color: primaryColor }]}
            >
              {formatPrice(paymentAmount)}
            </StyledText>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.cancelButton, { borderColor: borderColor }]}
              activeOpacity={0.7}
            >
              <StyledText
                variant="labelLarge"
                style={[styles.cancelButtonText, { color: textColor }]}
              >
                Cancel
              </StyledText>
            </TouchableOpacity>
            <StyledButton
              title="Proceed to Payment"
              onPress={handleProceedClick}
              variant="medium"
              style={[styles.proceedButton, { backgroundColor: primaryColor }]}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    width: Math.min(screenWidth - 40, 400),
    maxWidth: 400,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: 20,
    fontFamily: "BarlowMedium",
  },
  vehicleInfoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  vehicleInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  message: {
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  paymentAmountContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  paymentAmount: {
    fontFamily: "BarlowMedium",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontFamily: "BarlowMedium",
  },
  proceedButton: {
    flex: 2,
  },
});

export default VehicleExistsModal;
