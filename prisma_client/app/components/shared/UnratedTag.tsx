import React from "react";
import { StyleSheet, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface UnratedTagProps {
  onPress?: () => void;
  text?: string;
  variant?: "default" | "compact";
}

const UnratedTag: React.FC<UnratedTagProps> = ({
  onPress,
  text = "Not Rated",
  variant = "default",
}) => {
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");

  const tagContent = (
    <StyledText
      variant="labelSmall"
      style={[
        styles.tagText,
        { color: "#FFA500" },
        variant === "compact" && styles.compactText,
      ]}
    >
      {text}
    </StyledText>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.tag,
          styles.pressableTag,
          { borderColor: "#FFA500" },
          variant === "compact" && styles.compactTag,
        ]}
      >
        {tagContent}
        <Ionicons
          name="chevron-forward"
          size={12}
          color="#FFA500"
          style={styles.icon}
        />
      </Pressable>
    );
  }

  return (
    <View style={[styles.tag, { borderColor: "#FFA500" }, variant === "compact" && styles.compactTag]}>
      {tagContent}
    </View>
  );
};

export default UnratedTag;

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: "rgba(255, 165, 0, 0.1)",
    alignSelf: "flex-start",
  },
  pressableTag: {
    backgroundColor: "rgba(255, 165, 0, 0.15)",
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFA500",
  },
  icon: {
    marginLeft: 4,
  },
  compactTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  compactText: {
    fontSize: 11,
  },
});
