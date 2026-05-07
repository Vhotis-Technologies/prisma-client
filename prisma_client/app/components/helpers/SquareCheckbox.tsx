import React from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type SquareCheckboxSize = "compact" | "medium" | "default";

const SIZE_MAP: Record<
  SquareCheckboxSize,
  { wh: number; borderWidth: number; radius: number; icon: number }
> = {
  compact: { wh: 18, borderWidth: 1.5, radius: 4, icon: 16 },
  medium: { wh: 20, borderWidth: 2, radius: 4, icon: 16 },
  default: { wh: 22, borderWidth: 2, radius: 4, icon: 16 },
};

export interface SquareCheckboxProps {
  checked: boolean;
  borderColor: string;
  /** Used when `checked` and `mode` is `filled` */
  checkedBackgroundColor?: string;
  checkColor?: string;
  /**
   * `filled`: solid background when checked (booking, onboarding consent, terms modal).
   * `outline`: transparent background when checked; only the checkmark shows (e.g. Remember me).
   */
  mode?: "filled" | "outline";
  size?: SquareCheckboxSize;
  style?: StyleProp<ViewStyle>;
}

const SquareCheckbox: React.FC<SquareCheckboxProps> = ({
  checked,
  borderColor,
  checkedBackgroundColor = "#000",
  checkColor = "#FFFFFF",
  mode = "filled",
  size = "default",
  style,
}) => {
  const dim = SIZE_MAP[size];
  const backgroundColor = !checked
    ? "transparent"
    : mode === "outline"
      ? "transparent"
      : checkedBackgroundColor;

  return (
    <View
      style={[
        {
          width: dim.wh,
          height: dim.wh,
          borderRadius: dim.radius,
          borderWidth: dim.borderWidth,
          borderColor,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {checked ? (
        <Ionicons name="checkmark" size={dim.icon} color={checkColor} />
      ) : null}
    </View>
  );
};

export default SquareCheckbox;
