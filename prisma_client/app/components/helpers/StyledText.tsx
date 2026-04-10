import { useThemeColor } from "@/hooks/useThemeColor";
import React from "react";
import { StyleProp, TextStyle, TextProps } from "react-native";
import { Text } from "react-native-paper";
import { VariantProp } from "react-native-paper/lib/typescript/components/Typography/types";

interface StyledTextProps extends Omit<TextProps, "style"> {
  variant?:
    | "displayLarge"
    | "displayMedium"
    | "displaySmall"
    | "headlineLarge"
    | "headlineMedium"
    | "headlineSmall"
    | "titleLarge"
    | "titleMedium"
    | "titleSmall"
    | "labelLarge"
    | "labelMedium"
    | "labelSmall"
    | "bodyLarge"
    | "bodyMedium"
    | "bodySmall";
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string; // Add explicit color prop
}

const StyledText: React.FC<StyledTextProps> = ({
  variant = "bodyMedium",
  children,
  style,
  color,
  ...props
}) => {
  const textColor = useThemeColor({}, "text");

  // Helper function to extract color from style
  const getColorFromStyle = (
    style: StyleProp<TextStyle>
  ): string | undefined => {
    if (Array.isArray(style)) {
      for (const styleItem of style) {
        if (
          styleItem &&
          typeof styleItem === "object" &&
          "color" in styleItem
        ) {
          return styleItem.color as string;
        }
      }
    } else if (style && typeof style === "object" && "color" in style) {
      return style.color as string;
    }
    return undefined;
  };

  // Determine which color to use: explicit color prop > style color > theme color
  const styleColor = getColorFromStyle(style);
  const finalColor = color || styleColor || textColor;

  return (
    <Text
      style={[style, { color: finalColor, fontFamily: "BarlowLight"}]}
      {...props}
      variant={variant as VariantProp<never>}
    >
      {children}
    </Text>
  );
};

export default StyledText;
