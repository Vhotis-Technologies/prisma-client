import React from "react";
import {
  TextInput,
  View,
  StyleSheet,
  TextInputProps,
  Platform,
} from "react-native";
import StyledText from "./StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface StyledTextInputProps extends TextInputProps {
  label?: string;
  info?: string;
}

const StyledTextInput: React.FC<StyledTextInputProps> = ({
  label,
  info,
  style,
  ...props
}) => {
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const fieldBackground = useThemeColor({}, "cards");
  const placeholderColor = useThemeColor(
    { light: "#757575", dark: "#9E9E9E" },
    "text"
  );

  return (
    <View style={styles.container}>
      {label && (
        <StyledText
          variant={Platform.OS === "web" ? "labelLarge" : "labelMedium"}
          style={[styles.label, { color: textColor }]}
        >
          {label}
        </StyledText>
      )}
      <TextInput
        style={[
          styles.input,
          style,
          {
            borderColor: borderColor,
            borderWidth: 1,
            backgroundColor: fieldBackground,
            color: textColor,
          },
        ]}
        placeholderTextColor={placeholderColor}
        {...props}
      />
      {info && (
        <StyledText
          variant={Platform.OS === "web" ? "bodyMedium" : "bodySmall"}
          style={[styles.info, { color: textColor }]}
        >
          {info}
        </StyledText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
  },
  label: {
    padding: 5,
    paddingHorizontal: 5,
  },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    fontFamily: "BarlowRegular",
    fontSize: 14,
    minHeight: 40,
  },
  info: {
    paddingTop: 1,
    paddingBottom: 10,
    paddingStart: 10,
    fontSize: 11,
    color: "#666",
  },
});

export default StyledTextInput;
