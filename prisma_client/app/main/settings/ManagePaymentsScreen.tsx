import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import PaymentMethodsComponent from "@/app/components/profile/PaymentMethodsComponent";
import ModalServices from "@/app/utils/ModalServices";
import { Ionicons } from "@expo/vector-icons";

const ManagePaymentsScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const textColor = useThemeColor({}, "text");

  const [cardsModalVisible, setCardsModalVisible] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={[styles.section, { backgroundColor: cardColor, borderColor }]}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => setCardsModalVisible(true)}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="card-outline" size={22} color={primaryColor} />
            <StyledText variant="bodyLarge" style={{ color: textColor }}>
              Manage cards
            </StyledText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={textColor} />
        </TouchableOpacity>
        <StyledText variant="bodySmall" style={[styles.description, { color: textColor }]}>
          View, add or remove saved payment methods
        </StyledText>
      </View>

      <ModalServices
        visible={cardsModalVisible}
        onClose={() => setCardsModalVisible(false)}
        modalType="sheet"
        animationType="slide"
        showCloseButton
        component={<PaymentMethodsComponent />}
        title="Payment Methods"
      />
    </View>
  );
};

export default ManagePaymentsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  description: {
    marginTop: 6,
    marginLeft: 34,
    opacity: 0.8,
  },
});
