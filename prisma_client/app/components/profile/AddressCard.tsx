import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { MyAddressProps } from "@/app/interfaces/ProfileInterfaces";
import StyledText from "../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";

export interface AddressCardProps {
  address: MyAddressProps;
  onDelete?: (id: string) => void;
}

const AddressCard = ({ address, onDelete }: AddressCardProps) => {
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");

  const addressId = address.id ?? "";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: cardColor, borderColor },
      ]}
    >
      <View style={styles.iconRow}>
        <View style={[styles.iconWrap, { backgroundColor: primaryColor + "18" }]}>
          <Ionicons name="location-outline" size={22} color={primaryColor} />
        </View>
        <View style={styles.body}>
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor }}
            numberOfLines={2}
          >
            {address.address}
          </StyledText>
          <StyledText
            variant="bodySmall"
            style={[styles.meta, { color: textColor }]}
            numberOfLines={1}
          >
            {[address.post_code, address.city].filter(Boolean).join(", ")}
            {address.city || address.post_code ? " · " : ""}
            {address.country}
          </StyledText>
        </View>
      </View>
      {onDelete && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onDelete(addressId)}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && styles.actionBtnPressed,
            ]}
          >
            <Ionicons name="trash-outline" size={18} color={iconColor} />
            <StyledText variant="labelSmall" style={{ color: iconColor }}>
              Delete
            </StyledText>
          </Pressable>
        </View>
      )}
    </View>
  );
};

export default AddressCard;

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  meta: {
    marginTop: 4,
    opacity: 0.85,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    gap: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtnPressed: {
    opacity: 0.7,
  },
});
