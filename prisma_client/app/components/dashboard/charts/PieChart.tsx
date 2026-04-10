import React, { useMemo } from "react";
import { StyleSheet, View, Dimensions } from "react-native";
import StyledText from "../../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface PieData {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieData[];
  size?: number;
  showLegend?: boolean;
}

const PieChart: React.FC<PieChartProps> = ({
  data,
  size = 200,
  showLegend = true,
}) => {
  const textColor = useThemeColor({}, "text");
  const screenWidth = Dimensions.get("window").width;
  const maxSize = Math.min(size, screenWidth - 80);

  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + item.value, 0);
  }, [data]);

  const segments = useMemo(() => {
    if (total === 0) return [];
    
    let currentAngle = -90; // Start from top
    return data.map((item) => {
      const percentage = (item.value / total) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;

      return {
        ...item,
        percentage,
        startAngle,
        angle,
      };
    });
  }, [data, total]);

  const renderSegment = (segment: typeof segments[0], index: number) => {
    if (segment.percentage === 0) return null;

    const radius = maxSize / 2;
    const largeArcFlag = segment.angle > 180 ? 1 : 0;

    // Calculate start and end points
    const startAngleRad = (segment.startAngle * Math.PI) / 180;
    const endAngleRad = ((segment.startAngle + segment.angle) * Math.PI) / 180;

    const x1 = radius + radius * Math.cos(startAngleRad);
    const y1 = radius + radius * Math.sin(startAngleRad);
    const x2 = radius + radius * Math.cos(endAngleRad);
    const y2 = radius + radius * Math.sin(endAngleRad);

    // For React Native, we'll use a simpler approach with View and rotation
    // This is a simplified version - for a true pie chart, SVG would be better
    // but we're avoiding external libraries
    return (
      <View
        key={index}
        style={[
          styles.segmentContainer,
          {
            width: maxSize,
            height: maxSize,
          },
        ]}
      >
        <View
          style={[
            styles.segment,
            {
              width: maxSize / 2,
              height: maxSize,
              backgroundColor: segment.color,
              transform: [{ rotate: `${segment.startAngle}deg` }],
            },
          ]}
        />
        <View
          style={[
            styles.segmentMask,
            {
              width: maxSize / 2,
              height: maxSize,
              transform: [{ rotate: `${segment.startAngle + segment.angle}deg` }],
            },
          ]}
        />
      </View>
    );
  };

  // Render pie chart using a simpler bar-based visualization
  // For React Native without SVG, we'll use a horizontal bar representation
  const renderPieChart = () => {
    return (
      <View style={styles.barChartContainer}>
        {segments.map((segment, index) => (
          <View key={index} style={styles.barRow}>
            <View style={styles.barLabelContainer}>
              <View
                style={[
                  styles.colorIndicator,
                  { backgroundColor: segment.color },
                ]}
              />
              <StyledText
                variant="bodySmall"
                style={[styles.barLabel, { color: textColor }]}
              >
                {segment.label}
              </StyledText>
            </View>
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.bar,
                  {
                    width: `${segment.percentage}%`,
                    backgroundColor: segment.color,
                  },
                ]}
              />
              <StyledText
                variant="bodySmall"
                style={[styles.barValue, { color: textColor }]}
              >
                {segment.percentage.toFixed(1)}%
              </StyledText>
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (data.length === 0 || total === 0) {
    return (
      <View style={[styles.emptyContainer, { height: maxSize }]}>
        <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.7 }}>
          No data available
        </StyledText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>{renderPieChart()}</View>
    </View>
  );
};

export default PieChart;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  chartWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  barChartContainer: {
    width: "100%",
    gap: 12,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  barLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: 100,
    gap: 6,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  barLabel: {
    fontSize: 12,
    flex: 1,
  },
  barContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bar: {
    height: 20,
    borderRadius: 4,
  },
  barValue: {
    fontSize: 12,
    minWidth: 50,
    textAlign: "right",
  },
  legend: {
    marginTop: 16,
    width: "100%",
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    fontSize: 12,
    opacity: 0.8,
  },
});
