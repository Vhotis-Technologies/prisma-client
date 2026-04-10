/**
 * SettingLink Component
 *
 * Renders a setting row that navigates on press (link-style).
 * Same row layout as SettingItem but with chevron and onPress instead of a toggle.
 */

import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";

interface SettingLinkProps {
  title: string;
  description: string;
  onPress: () => void;
}

const SettingLink = ({ title, description, onPress }: SettingLinkProps) => {
  const iconColor = useThemeColor({}, "icons");

  return (
    <TouchableOpacity
      style={[
        styles.settingItem,
        { borderBottomColor: useThemeColor({}, "borders") },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingTextContainer}>
        <StyledText variant="labelLarge">{title}</StyledText>
        <StyledText variant="bodySmall" style={styles.settingDescription}>
          {description}
        </StyledText>
      </View>
      <Ionicons name="chevron-forward" size={22} color={iconColor} />
    </TouchableOpacity>
  );
};

export default SettingLink;

const styles = StyleSheet.create({
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  settingDescription: {
    fontSize: 10,
    lineHeight: 18,
  },
});
