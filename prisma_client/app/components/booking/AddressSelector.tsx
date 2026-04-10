import React from "react";
import { StyleSheet, View, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { MyAddressProps } from "@/app/interfaces/ProfileInterfaces";
import StyledText from "@/app/components/helpers/StyledText";

interface AddressSelectorProps {
  addresses: MyAddressProps[];
  selectedAddress: MyAddressProps | null;
  onSelectAddress: (address: MyAddressProps) => void;
  onAddAddress: () => void;
  showAddButton?: boolean;
}

const AddressSelector: React.FC<AddressSelectorProps> = ({
  addresses,
  selectedAddress,
  onSelectAddress,
  onAddAddress,
  showAddButton = true,
}) => {
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const primaryPurpleColor = useThemeColor({}, "primary");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <StyledText
          variant="titleMedium"
          style={[styles.title, { color: textColor }]}
        >
          Service Location
        </StyledText>
        {showAddButton && (
          <TouchableOpacity onPress={onAddAddress} style={styles.addButton}>
            <Ionicons name="add-circle" size={24} color={primaryPurpleColor} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {addresses.map((address, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.addressCard,
              {
                backgroundColor: cardColor,
                borderColor:
                  selectedAddress === address ? primaryPurpleColor : "#E5E5E5",
              },
            ]}
            onPress={() => onSelectAddress(address)}
            activeOpacity={0.7}
          >
            <View style={styles.addressHeader}>
              <Ionicons
                name="location"
                size={20}
                color={
                  selectedAddress === address ? primaryPurpleColor : textColor
                }
              />
              {selectedAddress === address && (
                <View
                  style={[
                    styles.selectedIndicator,
                    { backgroundColor: primaryPurpleColor },
                  ]}
                >
                  <Ionicons name="checkmark" size={12} color="white" />
                </View>
              )}
            </View>

            <View style={styles.addressInfo}>
              <StyledText
                variant="bodyMedium"
                style={[styles.addressText, { color: textColor }]}
              >
                {address.address}
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.addressText, { color: textColor }]}
              >
                {address.city}, {address.post_code}
              </StyledText>
              <StyledText
                variant="bodySmall"
                style={[styles.countryText, { color: textColor }]}
              >
                {address.country}
              </StyledText>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {addresses.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: cardColor }]}>
          <Ionicons name="location-outline" size={48} color={textColor} />
          <StyledText
            variant="titleMedium"
            style={[styles.emptyTitle, { color: textColor }]}
          >
            No Addresses Found
          </StyledText>
          <StyledText
            variant="bodyMedium"
            style={[styles.emptyText, { color: textColor }]}
          >
            Add an address for service location
          </StyledText>
          {showAddButton && (
            <TouchableOpacity
              style={[
                styles.addAddressButton,
                { backgroundColor: primaryPurpleColor },
              ]}
              onPress={onAddAddress}
            >
              <Ionicons name="add" size={20} color="white" />
              <StyledText
                variant="bodyMedium"
                style={styles.addAddressButtonText}
              >
                Add Address
              </StyledText>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

export default AddressSelector;

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontWeight: "600",
  },
  addButton: {
    padding: 4,
  },
  scrollContainer: {
    paddingHorizontal: 4,
  },
  addressCard: {
    width: 180,
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    borderWidth: 2,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  addressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  selectedIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addressInfo: {
    gap: 2,
  },
  addressText: {
    fontWeight: "500",
  },
  countryText: {
    opacity: 0.7,
    marginTop: 2,
  },
  emptyState: {
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    marginTop: 12,
  },
  emptyTitle: {
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 20,
  },
  addAddressButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addAddressButtonText: {
    color: "white",
    fontWeight: "600",
    marginLeft: 8,
  },
});
