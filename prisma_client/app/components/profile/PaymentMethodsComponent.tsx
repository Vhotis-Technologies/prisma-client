import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";
import SavedCardItem from "./SavedCardItem";
import {
  useGetPaymentMethodsQuery,
  useDeletePaymentMethodMutation,
  PaymentMethod,
} from "@/app/store/api/eventApi";
import { useAlertContext } from "@/app/contexts/AlertContext";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

interface PaymentMethodsComponentProps {
  // No props needed since it's just a component now
}

const PaymentMethodsComponent: React.FC<PaymentMethodsComponentProps> = () => {
  const { setIsVisible, setAlertConfig } = useAlertContext();
  const { showSnackbarWithConfig } = useSnackbar();

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const iconColor = useThemeColor({}, "icons");
  const cardBackground = useThemeColor({}, "cards");
  // State for tracking which card is being deleted
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);

  // API hooks
  const {
    data: paymentMethods = [],
    isLoading,
    error,
    refetch,
  } = useGetPaymentMethodsQuery();

  // Ensure paymentMethods is always an array
  const safePaymentMethods = paymentMethods || [];
  const [deletePaymentMethod, { isLoading: isDeleting }] =
    useDeletePaymentMethodMutation();

  const handleDeleteCard = async (cardId: string) => {
    setAlertConfig({
      title: "Delete Payment Method",
      message: "Are you sure you want to delete this payment method?",
      type: "warning",
      isVisible: true,
      onConfirm: async () => {
        try {
          setDeletingCardId(cardId);
          await deletePaymentMethod({ payment_method_id: cardId }).unwrap();
          refetch();
          showSnackbarWithConfig({
            message: "Payment method deleted successfully",
            type: "success",
            duration: 3000,
          });
        } catch (error) {
          console.error("Error deleting payment method:", error);
          showSnackbarWithConfig({
            message: "Failed to delete payment method. Please try again.",
            type: "error",
            duration: 3000,
          });
        }
      },
      onClose: () => {
        setIsVisible(false);
      },
    });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            Loading payment methods...
          </StyledText>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF4444" />
          <StyledText
            variant="bodyMedium"
            style={[styles.errorText, { color: textColor }]}
          >
            Failed to load payment methods
          </StyledText>
          <StyledButton
            title="Retry"
            onPress={() => refetch()}
            variant="small"
            style={styles.retryButton}
          />
        </View>
      );
    }

    if (!safePaymentMethods || safePaymentMethods.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="card-outline" size={48} color={iconColor} />
          <StyledText
            variant="bodyMedium"
            style={[styles.emptyText, { color: textColor }]}
          >
            No saved payment methods
          </StyledText>
          <StyledText
            variant="bodySmall"
            style={[styles.emptySubtext, { color: textColor, opacity: 0.7 }]}
          >
            Your saved cards will appear here after you make a payment
          </StyledText>
        </View>
      );
    }

    // Additional safety check
    if (!Array.isArray(safePaymentMethods)) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF4444" />
          <StyledText
            variant="bodyMedium"
            style={[styles.errorText, { color: textColor }]}
          >
            Invalid payment methods data
          </StyledText>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled={true}
        bounces={false}
        decelerationRate="fast"
      >
        {safePaymentMethods.map((card: PaymentMethod) => (
          <SavedCardItem
            key={card.id}
            card={card}
            onDelete={handleDeleteCard}
            isDeleting={deletingCardId === card.id}
          />
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: cardBackground }]}>
      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    marginLeft: 8,
    fontWeight: "600",
  },
  headerSubtitle: {
    fontSize: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 5,
    paddingTop: 5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  errorText: {
    marginTop: 12,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
  },
  emptyText: {
    marginTop: 12,
    textAlign: "center",
    fontWeight: "500",
  },
  emptySubtext: {
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});

export default PaymentMethodsComponent;
