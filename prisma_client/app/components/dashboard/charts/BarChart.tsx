import React, { useMemo } from "react";
import { StyleSheet, View, ScrollView, Dimensions } from "react-native";
import StyledText from "../../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarData[];
  height?: number;
  showValues?: boolean;
  horizontal?: boolean;
}

const BarChart: React.FC<BarChartProps> = ({
  data,
  height = 200,
  showValues = true,
  horizontal = false,
}) => {
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 64; // Account for margins and padding

  const maxValue = useMemo(() => {
    if (data.length === 0) return 1;
    return Math.max(...data.map((d) => d.value), 1);
  }, [data]);

  const barWidth = useMemo(() => {
    if (horizontal) {
      return chartWidth / Math.max(data.length, 1) - 8;
    }
    return (chartWidth - 32) / Math.max(data.length, 1) - 8;
  }, [data.length, chartWidth, horizontal]);

  if (data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.7 }}>
          No data available
        </StyledText>
      </View>
    );
  }

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalContainer}
      >
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * height;
          const barColor = item.color || primaryColor;

          return (
            <View key={index} style={styles.horizontalBarWrapper}>
              <View style={styles.horizontalBarContainer}>
                {showValues && (
                  <StyledText
                    variant="bodySmall"
                    style={[styles.valueLabel, { color: textColor }]}
                  >
                    {item.value.toLocaleString()}
                  </StyledText>
                )}
                <View
                  style={[
                    styles.horizontalBar,
                    {
                      width: barHeight,
                      backgroundColor: barColor,
                    },
                  ]}
                />
              </View>
              <StyledText
                variant="bodySmall"
                style={[styles.label, { color: textColor }]}
                numberOfLines={2}
              >
                {item.label}
              </StyledText>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.barsContainer}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * (height - 40);
          const barColor = item.color || primaryColor;

          return (
            <View key={index} style={[styles.barWrapper, { width: barWidth }]}>
              {showValues && (
                <StyledText
                  variant="bodySmall"
                  style={[styles.valueLabel, { color: textColor }]}
                >
                  {item.value.toLocaleString()}
                </StyledText>
              )}
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: barColor,
                  },
                ]}
              />
              <StyledText
                variant="bodySmall"
                style={[styles.label, { color: textColor }]}
                numberOfLines={2}
              >
                {item.label}
              </StyledText>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default BarChart;

const styles = StyleSheet.create({
  container: {
    justifyContent: "flex-end",
    alignItems: "center",
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  barsContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    width: "100%",
    height: "100%",
    paddingHorizontal: 8,
  },
  barWrapper: {
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  bar: {
    width: "100%",
    borderRadius: 4,
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 4,
    opacity: 0.7,
  },
  valueLabel: {
    fontSize: 10,
    marginBottom: 4,
    fontWeight: "600",
  },
  horizontalContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  horizontalBarWrapper: {
    alignItems: "center",
    marginHorizontal: 4,
    minWidth: 60,
  },
  horizontalBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: 20,
  },
  horizontalBar: {
    height: 20,
    borderRadius: 4,
    marginLeft: 4,
  },
});
