import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ValetTypeProps } from "@/app/interfaces/BookingInterfaces";
import StyledText from "@/app/components/helpers/StyledText";

interface ValetTypeCardProps {
  valetType: ValetTypeProps;
  isSelected: boolean;
  onSelect: (valetType: ValetTypeProps) => void;
}

const ValetTypeCard: React.FC<ValetTypeCardProps> = ({
  valetType,
  isSelected,
  onSelect,
}) => {
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const primaryPurpleColor = useThemeColor({}, "primary");

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: cardColor,
          borderColor: isSelected ? primaryPurpleColor : "#E5E5E5",
        },
      ]}
      onPress={() => onSelect(valetType)}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.radioContainer}>
          <View
            style={[
              styles.radioButton,
              {
                borderColor: isSelected ? primaryPurpleColor : "#E5E5E5",
              },
            ]}
          >
            {isSelected && (
              <View
                style={[
                  styles.radioInner,
                  { backgroundColor: primaryPurpleColor },
                ]}
              />
            )}
          </View>
        </View>

        <View style={styles.textContainer}>
          <StyledText
            variant="titleMedium"
            style={[styles.title, { color: textColor }]}
          >
            {valetType.name}
          </StyledText>
          <StyledText
            variant="bodyMedium"
            style={[styles.description, { color: textColor }]}
          >
            {valetType.description}
          </StyledText>
        </View>

        <View style={styles.iconContainer}>
          <Ionicons
            name="water-outline"
            size={24}
            color={isSelected ? primaryPurpleColor : textColor}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default ValetTypeCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioContainer: {
    marginRight: 12,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontWeight: "600",
    marginBottom: 4,
  },
  description: {
    opacity: 0.8,
    lineHeight: 18,
  },
  iconContainer: {
    marginLeft: 12,
  },
});
