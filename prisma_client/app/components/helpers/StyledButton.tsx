import {
  StyleProp,
  ActivityIndicator,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import React from "react";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "./StyledText";

interface StyledButtonProps {
  title: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
  variant?: "small" | "medium" | "large" | "icon" | "tonal";
  disabled?: boolean;
  isLoading?: boolean;
}

const StyledButton: React.FC<StyledButtonProps> = ({
  title,
  onPress,
  icon,
  style,
  variant = "medium",
  disabled = false,
  isLoading = false,
}) => {
  const buttonColor = useThemeColor({}, "primary");
  const secondaryButtonColor = useThemeColor({}, "secondaryButton");
  const buttonTextColor = useThemeColor({}, "buttonText");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  /**
   * Get button styling based on variant
   * @param variant - The button variant (small, medium, large, icon, tonal)
   * @returns Object containing button styles and text variant
   */
  const getButtonStyles = (variant: string) => {
    const baseStyles = {
      alignItems: "center" as const,
      justifyContent: "center" as const,
      opacity: disabled ? 0.6 : 1,
    };

    switch (variant) {
      case "small":
        return {
          button: {
            ...baseStyles,
            flexDirection: "row" as const,
            backgroundColor: buttonColor,
            paddingHorizontal: 10,
            paddingVertical: 10,
            borderRadius: 20,
            minHeight: 20,
            gap: 8,
          },
          textVariant: "labelMedium" as const,
        };

      case "medium":
        return {
          button: {
            ...baseStyles,
            flexDirection: "row" as const,
            backgroundColor: buttonColor,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 20,
            minHeight: 30,
            gap: 10,
          },
          textVariant: "labelLarge" as const,
        };

      case "large":
        return {
          button: {
            ...baseStyles,
            flexDirection: "row" as const,
            backgroundColor: buttonColor,
            paddingHorizontal: 24,
            paddingVertical: 16,
            borderRadius: 40,
            minHeight: 35,
            gap: 12,
          },
          textVariant: "titleMedium" as const,
        };

      case "icon":
        return {
          button: {
            ...baseStyles,
            flexDirection: "row" as const,
            backgroundColor: buttonColor,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 40,
            minHeight: 40,
            gap: 10,
          },
          textVariant: "labelLarge" as const,
        };

      case "tonal":
        return {
          button: {
            ...baseStyles,
            flexDirection: "row" as const,
            backgroundColor: "transparent",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 30,
            minHeight: 44,
            borderWidth: 2,
            borderColor: borderColor,
            gap: 10,
          },
          textVariant: "labelLarge" as const,
        };

      default:
        return {
          button: {
            ...baseStyles,
            flexDirection: "row" as const,
            backgroundColor: buttonColor,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 30,
            minHeight: 44,
            gap: 10,
          },
          textVariant: "labelLarge" as const,
        };
    }
  };

  const { button, textVariant } = getButtonStyles(variant);

  return (
    <TouchableOpacity
      style={[button, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {icon && icon}
      {isLoading && <ActivityIndicator size="small" color={buttonTextColor} />}
      <StyledText variant={textVariant} style={{ color: textColor }}>
        {title}
      </StyledText>
    </TouchableOpacity>
  );
};

export default StyledButton;
