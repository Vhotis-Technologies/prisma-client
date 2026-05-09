import React, { useMemo } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import StyledText from "@/app/components/helpers/StyledText";
import { useGetSubscriptionBillingHistoryQuery } from "@/app/store/api/subscriptionApi";
import { useGetB2cBillingHistoryQuery } from "@/app/store/api/b2cSubscriptionApi";

type LooseBillingRecord = {
  id: string;
  amount?: number | string;
  billing_date?: string;
  status?: string;
  subscription?: {
    plan?: {
      name?: string;
      tier?: { name?: string };
      billing_cycle?: string;
    };
  };
};

const formatEuro = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
  }).format(value);

function planSubtitle(rec: LooseBillingRecord): string {
  const plan = rec.subscription?.plan;
  const tier = plan?.tier?.name ?? plan?.name;
  const cycleRaw = plan?.billing_cycle ?? "";
  const cycle =
    cycleRaw.length > 0
      ? cycleRaw.charAt(0).toUpperCase() + cycleRaw.slice(1).toLowerCase()
      : "";
  if (!tier && !cycle) return "Subscription";
  if (!cycle) return tier ?? "";
  return `${tier ?? "Plan"} · ${cycle}`;
}

function statusLabel(status?: string): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

interface SubscriptionBillingHistorySectionProps {
  isFleetOwner: boolean;
  borderColor: string;
  textColor: string;
  primaryColor: string;
  errorColor: string;
  mutedColor: string;
}

const SubscriptionBillingHistorySection: React.FC<
  SubscriptionBillingHistorySectionProps
> = ({
  isFleetOwner,
  borderColor,
  textColor,
  tintColor,
  errorColor,
  mutedColor,
}) => {
  const fleetQuery = useGetSubscriptionBillingHistoryQuery(undefined, {
    skip: !isFleetOwner,
  });
  const b2cQuery = useGetB2cBillingHistoryQuery(undefined, {
    skip: isFleetOwner,
  });

  const { data, isLoading, isError } = isFleetOwner ? fleetQuery : b2cQuery;

  const rows = useMemo(
    () => (Array.isArray(data) ? (data as LooseBillingRecord[]) : []),
    [data],
  );

  return (
    <View style={[styles.card, { borderColor }]}>
      <StyledText
        variant="titleMedium"
        style={[styles.title, { color: textColor }]}
      >
        Billing history
      </StyledText>
      {isLoading && !rows.length ? (
        <ActivityIndicator style={styles.loader} color={primaryColor} />
      ) : null}
      {isError ? (
        <StyledText variant="bodySmall" style={{ color: errorColor }}>
          Could not load billing history.
        </StyledText>
      ) : null}
      {!isLoading && !isError && rows.length === 0 ? (
        <StyledText variant="bodySmall" style={{ color: mutedColor }}>
          No subscription charges yet.
        </StyledText>
      ) : null}
      {!isError &&
        rows.map((rec) => {
          const amt = Number(rec.amount ?? 0);
          const dt = rec.billing_date
            ? new Date(rec.billing_date).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "—";
          const st = rec.status ?? "";
          const paid = st === "paid";
          const failed = st === "failed";
          const statusTone = paid
            ? primaryColor
            : failed
              ? errorColor
              : mutedColor;
          return (
            <View
              key={String(rec.id)}
              style={[styles.row, { borderTopColor: borderColor }]}
            >
              <View style={styles.rowMain}>
                <StyledText
                  variant="bodyMedium"
                  style={{ color: textColor }}
                  numberOfLines={1}
                >
                  {planSubtitle(rec)}
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={{ color: mutedColor }}
                  numberOfLines={1}
                >
                  {dt}
                </StyledText>
              </View>
              <View style={styles.rowEnd}>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {Number.isFinite(amt) ? formatEuro(amt) : "—"}
                </StyledText>
                <StyledText variant="labelSmall" style={{ color: statusTone }}>
                  {statusLabel(st)}
                </StyledText>
              </View>
            </View>
          );
        })}
    </View>
  );
};

export default SubscriptionBillingHistorySection;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  title: {
    fontWeight: "600",
  },
  loader: {
    marginVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowEnd: {
    alignItems: "flex-end",
    gap: 2,
  },
});
