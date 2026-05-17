import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";

type ForthcomingBookingsRowProps = {
  /** When set, lists only the current user's bookings (fleet owner personal bookings). */
  scope?: "my_bookings";
};

const ForthcomingBookingsRow: React.FC<ForthcomingBookingsRowProps> = ({
  scope,
}) => {
  const primaryColor = useThemeColor({}, "primary");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icons");

  const handlePress = () => {
    if (scope === "my_bookings") {
      router.push({
        pathname: "/main/dashboard/ForthcomingBookingsListScreen",
        params: { scope: "my_bookings" },
      });
    } else {
      router.push("/main/dashboard/ForthcomingBookingsListScreen");
    }
  };

  return (
    <Pressable
      style={styles.row}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="See all forthcoming bookings"
    >
      <View style={styles.left}>
        <Ionicons name="calendar-outline" size={20} color={iconColor} />
        <StyledText
          variant="titleSmall"
          style={[styles.title, { color: textColor }]}
        >
          Forthcoming bookings
        </StyledText>
      </View>
      <View style={styles.right}>
        <StyledText
          variant="bodySmall"
          style={[styles.link, { color: primaryColor }]}
        >
          See all
        </StyledText>
        <Ionicons name="chevron-forward" size={16} color={primaryColor} />
      </View>
    </Pressable>
  );
};

export default ForthcomingBookingsRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 4,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  title: {
    fontWeight: "600",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  link: {
    fontWeight: "600",
  },
});
