import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import {StatCard} from "@/app/interfaces/DashboardInterfaces";


interface StatsSectionProps {
  stats: StatCard[];
}

const StatsCard: React.FC<StatCard> = ({ icon, value, label, color }) => {
  const cardsColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");

  return (
    <View style={[styles.statCard, { backgroundColor: cardsColor }]}>
      <Ionicons name={icon as any} size={24} color={color} />
      <StyledText style={{ color: textColor }} variant="bodyLarge" children={value} />
      <StyledText style={{ color: textColor }} variant="bodySmall" children={label} />
    </View>
  );
};

const StatsSection: React.FC<StatsSectionProps> = ({ stats }) => {
  const textColor = useThemeColor({}, "text");

  return (
    <View style={styles.section}>
      <StyledText style={{ color: textColor, paddingHorizontal: 10 }} variant="labelMedium" children="My Stats"/>
      <View style={styles.statsGrid}>
        {stats.map((stat, index) => (
          <StatsCard key={index} {...stat} />
        ))}
      </View>
    </View>
  );
};

export default StatsSection;

const styles = StyleSheet.create({
  section: {
    marginBottom: 70,
    gap:8
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCard: {
    flex: 1,
    padding: 8,
    borderRadius: 5,
    alignItems: "center",
    marginHorizontal: 4,
  },
}); 