import React from "react";
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface ChartContainerProps {
  title: string;
  children: React.ReactNode;
  onRefresh?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const ChartContainer: React.FC<ChartContainerProps> = ({
  title,
  children,
  onRefresh,
  isLoading = false,
  error = null,
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const iconColor = useThemeColor({}, "icons");

  return (
    <View style={[styles.container, { backgroundColor: cardColor, borderColor }]}>
      <View style={styles.header}>
        <StyledText variant="labelMedium" style={[styles.title, { color: textColor }]}>
          {title}
        </StyledText>
        {onRefresh && (
          <TouchableOpacity
            onPress={onRefresh}
            style={[styles.refreshButton, { backgroundColor }]}
          >
            <Ionicons name="refresh" size={18} color={iconColor} />
          </TouchableOpacity>
        )}
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={iconColor} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <StyledText variant="bodySmall" style={[styles.errorText, { color: textColor }]}>
            {error}
          </StyledText>
        </View>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </View>
  );
};

export default ChartContainer;

const styles = StyleSheet.create({
  container: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    minHeight: 200,
  },
  loadingContainer: {
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    textAlign: "center",
    opacity: 0.7,
  },
});
