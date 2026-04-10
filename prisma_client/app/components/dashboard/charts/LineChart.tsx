import React, { useMemo } from "react";
import { StyleSheet, View, ScrollView, Dimensions } from "react-native";
import StyledText from "../../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface LineDataPoint {
  label: string;
  value: number;
}

interface LineSeries {
  label: string;
  data: LineDataPoint[];
  color?: string;
}

interface LineChartProps {
  data: LineSeries[];
  height?: number;
  showDots?: boolean;
  showLegend?: boolean;
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  height = 200,
  showDots = true,
  showLegend = true,
}) => {
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 64;
  const chartHeight = height - 60; // Account for labels and padding

  const allValues = useMemo(() => {
    const values: number[] = [];
    data.forEach((series) => {
      series.data.forEach((point) => {
        values.push(point.value);
      });
    });
    return values;
  }, [data]);

  const maxValue = useMemo(() => {
    if (allValues.length === 0) return 1;
    return Math.max(...allValues, 1);
  }, [allValues]);

  const minValue = useMemo(() => {
    if (allValues.length === 0) return 0;
    return Math.min(...allValues, 0);
  }, [allValues]);

  const valueRange = maxValue - minValue || 1;

  const getXPosition = (index: number, totalPoints: number) => {
    return (index / (totalPoints - 1 || 1)) * (chartWidth - 40) + 20;
  };

  const getYPosition = (value: number) => {
    const normalizedValue = (value - minValue) / valueRange;
    return chartHeight - normalizedValue * chartHeight + 20;
  };

  const renderLine = (series: LineSeries, seriesIndex: number) => {
    if (series.data.length < 2) return null;

    const color = series.color || primaryColor;
    const points = series.data.map((point, index) => ({
      x: getXPosition(index, series.data.length),
      y: getYPosition(point.value),
      label: point.label,
      value: point.value,
    }));

    const lines = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const length = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      );
      const angle =
        (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

      lines.push(
        <View
          key={`line-${seriesIndex}-${i}`}
          style={[
            styles.line,
            {
              left: start.x,
              top: start.y,
              width: length,
              backgroundColor: color,
              transform: [{ rotate: `${angle}deg` }],
            },
          ]}
        />
      );
    }

    const dots = showDots
      ? points.map((point, index) => (
          <View
            key={`dot-${seriesIndex}-${index}`}
            style={[
              styles.dot,
              {
                left: point.x - 4,
                top: point.y - 4,
                backgroundColor: color,
              },
            ]}
          />
        ))
      : null;

    return (
      <React.Fragment key={seriesIndex}>
        {lines}
        {dots}
      </React.Fragment>
    );
  };

  if (data.length === 0 || data.every((series) => series.data.length === 0)) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.7 }}>
          No data available
        </StyledText>
      </View>
    );
  }

  const firstSeries = data[0];
  const xLabels = firstSeries.data.map((point) => point.label);

  return (
    <View style={[styles.container, { height }]}>
      <View style={[styles.chartArea, { height: chartHeight }]}>
        {data.map((series, index) => renderLine(series, index))}
      </View>
      <View style={styles.xAxis}>
        {xLabels.map((label, index) => (
          <StyledText
            key={index}
            variant="bodySmall"
            style={[styles.xAxisLabel, { color: textColor }]}
            numberOfLines={1}
          >
            {label.length > 6 ? label.substring(0, 6) + "..." : label}
          </StyledText>
        ))}
      </View>
      {showLegend && data.length > 0 && (
        <View style={styles.legend}>
          {data.map((series, index) => (
            <View key={index} style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: series.color || primaryColor },
                ]}
              />
              <StyledText
                variant="bodySmall"
                style={[styles.legendLabel, { color: textColor }]}
              >
                {series.label}
              </StyledText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default LineChart;

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  chartArea: {
    width: "100%",
    position: "relative",
  },
  line: {
    position: "absolute",
    height: 2,
    transformOrigin: "left center",
  },
  dot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "white",
  },
  xAxis: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  xAxisLabel: {
    fontSize: 10,
    opacity: 0.7,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 12,
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    opacity: 0.8,
  },
});
