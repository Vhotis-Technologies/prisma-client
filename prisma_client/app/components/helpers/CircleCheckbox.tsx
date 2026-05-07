import React from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const BOX = 24;
const RADIUS = 12;

export interface CircleCheckboxProps {
  checked: boolean;
  /** Checkmark color when checked; use theme primary */
  accentColor: string;
  uncheckedBorderColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Rounded “pill” selection control used on service / add-on cards (selected card uses white fill + accent check).
 */
const CircleCheckbox: React.FC<CircleCheckboxProps> = ({
  checked,
  accentColor,
  uncheckedBorderColor = "#E5E5E5",
  style,
}) => (
  <View
    style={[
      {
        width: BOX,
        height: BOX,
        borderRadius: RADIUS,
        borderWidth: 2,
        borderColor: checked ? "#FFFFFF" : uncheckedBorderColor,
        backgroundColor: checked ? "#FFFFFF" : "transparent",
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 12,
      },
      style,
    ]}
  >
    {checked ? (
      <Ionicons name="checkmark" size={16} color={accentColor} />
    ) : null}
  </View>
);

export default CircleCheckbox;
