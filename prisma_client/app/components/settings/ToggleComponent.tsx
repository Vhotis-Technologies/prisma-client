import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
} from "react-native";
import React, { useRef, useEffect } from "react";
import { useThemeColor } from "@/hooks/useThemeColor";

interface ToggleComponentProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  size?: "large" | "small";
  disabled?: boolean;
}

const ToggleComponent = ({
  label,
  value,
  onValueChange,
  size = "large",
  disabled = false,
}: ToggleComponentProps) => {
  const slideAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: value ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const handleToggle = () => {
    if (!disabled) {
      onValueChange(!value);
    }
  };

  const isLarge = size === "large";

  const knobTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isLarge ? 4 : 3, isLarge ? 44 : 33],
  });

  const containerStyle = [
    styles.container,
    isLarge ? styles.containerLarge : styles.containerSmall,
    value ? styles.containerOn : styles.containerOff,
    value
      ? {
          backgroundColor: backgroundColor,
          borderColor: borderColor,
        }
      : {
          backgroundColor: backgroundColor,
          borderColor: borderColor,
        },
    disabled && styles.containerDisabled,
  ];

  // Determine knob color based on theme and toggle state
  const getLuminance = (color: string) => {
    // Remove # if present
    const hex = color.replace("#", "");
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  // For light themes, always use dark knob for better contrast
  // For dark themes, use light knob
  const backgroundColorLuminance = getLuminance(backgroundColor);
  const knobColor = backgroundColorLuminance > 0.5 ? "#2C2C2C" : "#FFFFFF";

  const knobStyle = [
    styles.knob,
    isLarge ? styles.knobLarge : styles.knobSmall,
    {
      backgroundColor: knobColor,
      borderColor: backgroundColorLuminance > 0.5 ? "#000000" : "#FFFFFF",
      borderWidth: 1,
      shadowColor: value ? "#4CAF50" : borderColor,
    },
    disabled && styles.knobDisabled,
    {
      transform: [{ translateX: knobTranslateX }],
    },
  ];

  // Better text contrast logic
  const activeTextColor = textColor; // Use theme text color for active state
  const inactiveTextColor =
    backgroundColorLuminance > 0.5
      ? "rgba(0, 0, 0, 0)" // Dark text with transparency for light backgrounds
      : "rgba(255, 255, 255, 0.7)"; // Light text with transparency for dark backgrounds

  const onTextStyle = [
    styles.text,
    isLarge ? styles.textLarge : styles.textSmall,
    {
      color: value ? activeTextColor : inactiveTextColor,
    },
    disabled && styles.textDisabled,
  ];

  const offTextStyle = [
    styles.text,
    isLarge ? styles.textLarge : styles.textSmall,
    {
      color: !value ? activeTextColor : inactiveTextColor,
    },
    disabled && styles.textDisabled,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={handleToggle}
      activeOpacity={1}
      disabled={disabled}
    >
      {/* ON Text - positioned on the left */}
      <View style={styles.textContainer}>
        <Text style={onTextStyle}>ON</Text>
      </View>

      {/* OFF Text - positioned on the right */}
      <View style={styles.textContainer}>
        <Text style={offTextStyle}>OFF</Text>
      </View>

      {/* Animated Knob */}
      <Animated.View style={knobStyle} />
    </TouchableOpacity>
  );
};

export default ToggleComponent;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 30,
    borderWidth: 2,
    position: "relative",
    overflow: "hidden",
  },
  containerLarge: {
    width: 80,
    height: 40,
  },
  containerSmall: {
    width: 60,
    height: 30,
  },
  containerOn: {
    // borderColor will be set dynamically
  },
  containerOff: {
    // borderColor will be set dynamically
  },
  containerDisabled: {
    backgroundColor: "#666666",
    borderColor: "#555555",
    opacity: 0.6,
  },
  textContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  text: {
    fontWeight: "700",
    textAlign: "center",
  },
  textLarge: {
    fontSize: 12,
  },
  textSmall: {
    fontSize: 10,
  },
  // textOn and textOff colors are now set dynamically
  textDisabled: {
    color: "#999999",
  },
  knob: {
    position: "absolute",
    borderRadius: 50,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  knobLarge: {
    width: 32,
    height: 32,
    top: 2,
  },
  knobSmall: {
    width: 24,
    height: 24,
    top: 1,
  },
  // knobOn and knobOff styles are now set dynamically
  knobDisabled: {
    backgroundColor: "#CCCCCC",
    shadowOpacity: 0.2,
  },
});
