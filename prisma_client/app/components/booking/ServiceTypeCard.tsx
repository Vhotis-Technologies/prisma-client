import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ServiceTypeProps } from "@/app/interfaces/BookingInterfaces";
import StyledText from "@/app/components/helpers/StyledText";
import { formatDuration, formatCurrency } from "@/app/utils/methods";
import { useAppSelector, RootState } from "@/app/store/main_store";

interface ServiceTypeCardProps {
  service: ServiceTypeProps;
  isSelected: boolean;
  onSelect: (service: ServiceTypeProps) => void;
}

const ServiceTypeCard: React.FC<ServiceTypeCardProps> = ({
  service,
  isSelected,
  onSelect,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const primaryPurpleColor = useThemeColor({}, "primary");
  const buttonColor = useThemeColor({}, "button");

  const user = useAppSelector((state: RootState) => state.auth.user);
  const isFleetUser = user?.is_fleet_owner || user?.is_branch_admin;
  
  // Determine which price to display
  const displayPrice = service.user_price !== undefined 
    ? service.user_price 
    : (isFleetUser && service.fleet_price ? service.fleet_price : service.price);
  
  const showFleetDiscount = isFleetUser && service.fleet_price && service.fleet_price < service.price;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isSelected ? primaryPurpleColor : cardColor,
          borderColor: isSelected ? primaryPurpleColor : "#E5E5E5",
        },
      ]}
      onPress={() => onSelect(service)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <StyledText
            variant="titleMedium"
            style={[styles.title, { color: isSelected ? "white" : textColor }]}
          >
            {service.name}
          </StyledText>
          <View style={styles.priceContainer}>
            <StyledText
              variant="titleLarge"
              style={[
                styles.price,
                { color: isSelected ? "white" : buttonColor },
              ]}
            >
              {formatCurrency(displayPrice)}
            </StyledText>
            {showFleetDiscount && (
              <View style={[styles.discountBadge, { backgroundColor: isSelected ? "rgba(255,255,255,0.3)" : "#4CAF50" }]}>
                <StyledText variant="bodySmall" style={styles.discountText}>
                  Fleet Discount
                </StyledText>
              </View>
            )}
            {showFleetDiscount && service.price && (
              <StyledText
                variant="bodySmall"
                style={[
                  styles.originalPrice,
                  { color: isSelected ? "rgba(255,255,255,0.7)" : textColor },
                ]}
              >
                {formatCurrency(service.price)}
              </StyledText>
            )}
          </View>
        </View>

        <View
          style={[
            styles.checkbox,
            {
              backgroundColor: isSelected ? "white" : "transparent",
              borderColor: isSelected ? "white" : "#E5E5E5",
            },
          ]}
        >
          {isSelected && (
            <Ionicons name="checkmark" size={16} color={primaryPurpleColor} />
          )}
        </View>
      </View>

      <View style={styles.durationContainer}>
        <Ionicons
          name="time-outline"
          size={16}
          color={isSelected ? "white" : textColor}
        />
        <StyledText
          variant="bodyMedium"
          style={[styles.duration, { color: isSelected ? "white" : textColor }]}
        >
          {formatDuration(service.duration)}
        </StyledText>
      </View>

      <View style={styles.descriptionContainer}>
        {service.description.map((item, index) => (
          <View key={index} style={styles.descriptionItem}>
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={isSelected ? "white" : "#4CAF50"}
            />
            <StyledText
              variant="bodySmall"
              style={[
                styles.descriptionText,
                { color: isSelected ? "white" : textColor },
              ]}
            >
              {item}
            </StyledText>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
};

export default ServiceTypeCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontWeight: "600",
    marginBottom: 4,
  },
  priceContainer: {
    gap: 4,
  },
  price: {
    fontWeight: "bold",
  },
  discountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  discountText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
  originalPrice: {
    textDecorationLine: "line-through",
    opacity: 0.6,
    fontSize: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  duration: {
    marginLeft: 6,
    opacity: 0.8,
  },
  descriptionContainer: {
    gap: 6,
  },
  descriptionItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  descriptionText: {
    marginLeft: 6,
    opacity: 0.9,
  },
});
