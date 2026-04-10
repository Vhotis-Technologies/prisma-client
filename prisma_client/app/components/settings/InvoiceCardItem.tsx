import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import StyledText from "@/app/components/helpers/StyledText";
import { Ionicons } from "@expo/vector-icons";
import type { InvoiceListItem } from "@/app/interfaces/InvoiceInterfaces";
import { formatCurrency } from "@/app/utils/methods";

export type InvoiceCardItemProps = {
  invoice: InvoiceListItem;
  statusColor: string;
  statusLabel: string;
  onPress: () => void;
  showCreator?: boolean;
  backgroundColor?: string;
  borderColor?: string;
};

const InvoiceCardItem = ({
  invoice,
  statusColor,
  statusLabel,
  onPress,
  showCreator,
  backgroundColor,
  borderColor,
}: InvoiceCardItemProps) => {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${invoice.booking_reference}, ${statusLabel}`}
      style={({ pressed }) => [
        styles.card,
        {
          opacity: pressed ? 0.88 : 1,
          borderColor: borderColor ?? "rgba(0,0,0,0.08)",
        },
      ]}
    >
      <View style={styles.rowTop}>
        <View style={styles.refBlock}>
          <StyledText variant="labelSmall" style={styles.metaMuted}>
            Reference
          </StyledText>
          <StyledText variant="labelLarge" style={styles.refText} numberOfLines={1}>
            {invoice.booking_reference}
          </StyledText>
        </View>
        <View style={styles.chevRow}>
          <StyledText variant="labelMedium" style={{ color: statusColor, fontFamily: "BarlowMedium" }}>
            {statusLabel}
          </StyledText>
          <Ionicons name="chevron-forward" size={20} color={statusColor} />
        </View>
      </View>
      <StyledText variant="bodySmall" style={styles.amount}>
        {formatCurrency(invoice.total_amount ?? 0)} · {invoice.number_of_vehicles} vehicles
      </StyledText>
      <StyledText variant="labelSmall" style={styles.metaMuted}>
        {invoice.created_at
          ? new Date(invoice.created_at).toLocaleDateString("en-IE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : ""}
      </StyledText>
      {showCreator && invoice.created_by?.name ? (
        <StyledText variant="labelSmall" style={styles.creator} numberOfLines={1}>
          {invoice.created_by.name}
        </StyledText>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  refBlock: {
    flex: 1,
    minWidth: 0,
  },
  refText: {
    fontFamily: "BarlowMedium",
  },
  chevRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  amount: {
    marginTop: 8,
    opacity: 0.9,
  },
  metaMuted: {
    marginTop: 4,
    opacity: 0.65,
  },
  creator: {
    marginTop: 4,
    opacity: 0.75,
  },
});

export default InvoiceCardItem;
