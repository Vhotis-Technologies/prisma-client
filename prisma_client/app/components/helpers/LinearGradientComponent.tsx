import { StyleSheet, Text, View, ViewStyle } from "react-native";
import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useThemeColor } from "@/hooks/useThemeColor";

interface LinearGradientComponentProps {
  children: React.ReactNode;
  color1: string;
  color2: string;
  color3?: string;
  style?: ViewStyle | ViewStyle[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

const LinearGradientComponent: React.FC<LinearGradientComponentProps> = ({
  children,
  color1,
  color2,
  color3,
  style,
  start,
  end,
}) => {
  const borderColor = useThemeColor({}, "borders");

  return (
    <LinearGradient
      colors={
        color3 && color3.trim() !== ""
          ? [color1, color2, color3]
          : [color1, color2]
      }
      start={start}
      end={end}
      style={[styles.container, { borderColor: borderColor }, style]}
    >
      {children}
    </LinearGradient>
  );
};

export default LinearGradientComponent;

const styles = StyleSheet.create({
  container: {
    borderWidth: 0.5,
  },
});
