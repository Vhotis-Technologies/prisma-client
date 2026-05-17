import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";
import { RecentServicesProps } from "@/app/interfaces/DashboardInterfaces";
import { useAppSelector, RootState } from "@/app/store/main_store";
import UnratedTag from "../shared/UnratedTag";
import { formatCurrency } from "@/app/utils/methods";

interface RecentServicesSectionProps {
  bookings: RecentServicesProps | null;
  onUnratedPress?: () => void;
}

const ServiceCard: React.FC<{
  booking: RecentServicesProps | null;
  onUnratedPress?: () => void;
}> = ({ booking, onUnratedPress }) => {
  const user = useAppSelector((state: RootState) => state.auth.user);
  let currencySymbol = "";
  if (user?.address?.country === "United Kingdom") {
    currencySymbol = "£";
  } else if (user?.address?.country === "Ireland") {
    currencySymbol = "€";
  }

  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");

  if (!booking) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "in progress":
        return "#FFA500";
      case "completed":
        return "#4CAF50";
      case "cancelled":
        return "#F44336";
      default:
        return "#2196F3";
    }
  };

  const cardContent = (
    <View
      style={[
        styles.serviceCard,
        { backgroundColor: cardColor, borderColor: borderColor },
      ]}
    >
      <View style={styles.serviceHeader}>
        <View style={styles.headerLeft}>
          <StyledText
            style={[styles.serviceDate, { color: textColor }]}
            variant="bodyMedium"
            children={booking.date}
          />
          {!booking.is_reviewed && (
            <View style={styles.unratedTagContainer}>
              <UnratedTag text="Not Rated" />
            </View>
          )}
        </View>
        <View
          style={[
            styles.serviceStatus,
            { backgroundColor: getStatusColor(booking.status || "") },
          ]}
        >
          <StyledText
            style={styles.serviceStatusText}
            variant="bodySmall"
            children={booking.status}
          />
        </View>
      </View>
      <View style={styles.serviceDetails}>
        <StyledText
          style={[styles.serviceVehicle, { color: textColor }]}
          variant="bodyMedium"
          children={`${booking.vehicle_name}`}
        />
        <StyledText
          style={[styles.serviceType, { color: textColor }]}
          variant="bodyMedium"
          children={`${booking.service_type} • ${currencySymbol}${booking.cost}`}
        />
        <StyledText
          style={[styles.serviceType, { color: "grey" }]}
          variant="bodyMedium"
          children={`${booking.valet_type}`}
        />
      </View>
      <View style={styles.serviceDetailer}>
        <Image
          source={require("@/assets/images/user_image.jpg")}
          style={styles.serviceDetailerImage}
        />
        <View style={styles.detailerInfo}>
          <StyledText
            style={[styles.serviceDetailerName, { color: textColor }]}
            variant="bodyMedium"
            children={
              booking.detailers && booking.detailers.length > 0
                ? booking.detailers.map((d) => d.name).join(" & ")
                : booking.detailer?.name || "No detailer assigned"
            }
          />
          {booking.is_reviewed && booking.rating > 0 && (
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <StyledText
                style={[styles.ratingText, { color: textColor }]}
                variant="bodySmall"
                children={booking.rating.toFixed(1)}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );

  // If unrated and onUnratedPress is provided, make the card pressable
  if (!booking.is_reviewed && onUnratedPress) {
    return (
      <Pressable
        onPress={() => {
          onUnratedPress();
        }}
        style={styles.pressableCard}
        android_ripple={{ color: "rgba(255, 165, 0, 0.1)" }}
      >
        {cardContent}
      </Pressable>
    );
  }

  return cardContent;
};

const RecentServicesSection: React.FC<RecentServicesSectionProps> = ({
  bookings,
  onUnratedPress,
}) => {
  const textColor = useThemeColor({}, "text");
  const backgroundColor = useThemeColor({}, "background");

  const handleBookAppointment = () => {
    router.push("/main/bookings/BookingScreen");
  };

  const renderEmptyState = () => (
    <View
      style={[styles.emptyStateContainer, { backgroundColor: backgroundColor }]}
    >
      <Ionicons
        name="car-outline"
        size={45}
        color={textColor}
        style={styles.emptyStateIcon}
      />
      <StyledText
        style={[styles.emptyStateTitle, { color: textColor }]}
        variant="titleMedium"
      >
        No Recent Services
      </StyledText>
      <StyledText
        style={[styles.emptyStateMessage, { color: textColor }]}
        variant="bodySmall"
      >
        You currently have no recent services. Book an appointment to get
        started with our professional detailing services.
      </StyledText>
      <StyledButton
        title="Book Appointment"
        variant="tonal"
        onPress={handleBookAppointment}
        style={styles.bookButton}
      />
    </View>
  );

  return (
    <View style={styles.section}>
      {bookings ? (
        <ServiceCard booking={bookings} onUnratedPress={onUnratedPress} />
      ) : (
        renderEmptyState()
      )}
    </View>
  );
};

export default RecentServicesSection;

const styles = StyleSheet.create({
  section: {
    padding: 5,
    paddingHorizontal: 5,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  serviceCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pressableCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  serviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  unratedTagContainer: {
    marginTop: 6,
  },
  serviceDate: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  serviceStatus: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  serviceStatusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  serviceDetails: {
    marginBottom: 12,
  },
  serviceVehicle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  serviceType: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.8,
  },
  serviceDetailer: {
    flexDirection: "row",
    alignItems: "center",
  },
  serviceDetailerImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  detailerInfo: {
    flex: 1,
  },
  serviceDetailerName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: "500",
  },
  emptyStateContainer: {
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 5,
  },
  emptyStateIcon: {
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateMessage: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  bookButton: {
    minWidth: 160,
  },
});
