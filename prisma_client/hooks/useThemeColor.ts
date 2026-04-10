/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useColorScheme } from "react-native";
import { Colors } from "@/constants/Colors";
import { useThemeContext } from "@/app/contexts/ThemeProvider";

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  // Use the theme context if available, otherwise fall back to system color scheme
  try {
    const { currentTheme } = useThemeContext();
    const theme = currentTheme;
    const colorFromProps = props[theme];

    if (colorFromProps) {
      return colorFromProps;
    } else {
      // Ensure theme is valid and colorName exists in the theme
      if (theme && Colors[theme] && Colors[theme][colorName]) {
        return Colors[theme][colorName];
      } else {
        // Fallback to light theme if current theme is invalid
        return Colors.light[colorName] || "#000000";
      }
    }
  } catch (error) {
    // Fallback to system color scheme if context is not available
    const theme = useColorScheme() ?? "light";
    const colorFromProps = props[theme];

    if (colorFromProps) {
      return colorFromProps;
    } else {
      // Ensure theme is valid and colorName exists in the theme
      if (theme && Colors[theme] && Colors[theme][colorName]) {
        return Colors[theme][colorName];
      } else {
        // Fallback to light theme if current theme is invalid
        return Colors.light[colorName] || "#000000";
      }
    }
  }
}
