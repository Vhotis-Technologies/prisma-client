import React, { useMemo } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Alert,
} from "react-native";
import StyledText from "@/app/components/helpers/StyledText";
import { useGetSubscriptionBillingHistoryQuery } from "@/app/store/api/subscriptionApi";
import { useGetB2cBillingHistoryQuery } from "@/app/store/api/b2cSubscriptionApi";

type LooseBillingRecord = {
  id: string;
  amount?: number | string;
  billing_date?: string;
  status?: string;
  subscription?: {
    id?: string;
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
  /** B2C only: resume Stripe checkout for a pending billing row. */
  onResumePendingPayment?: (opts: {
    subscriptionId?: string;
    billingId: string;
  }) => void;
  /** B2C only: cancel / abandon a pending checkout. */
  onCancelPendingBilling?: (
    opts?: string | { subscriptionId?: string; billingId?: string },
  ) => void;
  busy?: boolean;
}

const SubscriptionBillingHistorySection: React.FC<
  SubscriptionBillingHistorySectionProps
> = ({
  isFleetOwner,
  borderColor,
  textColor,
  primaryColor,
  errorColor,
  mutedColor,
  onResumePendingPayment,
  onCancelPendingBilling,
  busy = false,
}) => {
  const fleetQuery = useGetSubscriptionBillingHistoryQuery(undefined, {
    skip: !isFleetOwner,
  });
  const b2cQuery = useGetB2cBillingHistoryQuery(undefined, {
    skip: isFleetOwner,
  });

  const { data, isLoading, isError, refetch } = isFleetOwner
    ? fleetQuery
    : b2cQuery;

  const rows = useMemo(
    () => (Array.isArray(data) ? (data as LooseBillingRecord[]) : []),
    [data],
  );

  const openPendingActions = (rec: LooseBillingRecord) => {
    if (isFleetOwner || busy) return;
    Alert.alert(
      "Pending payment",
      `Checkout for ${planSubtitle(rec)} was not finished. Complete payment now, or cancel to discard it.`,
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Cancel checkout",
          style: "destructive",
          onPress: () => {
            onCancelPendingBilling?.({
              subscriptionId: rec.subscription?.id,
              billingId: String(rec.id),
            });
            setTimeout(() => {
              void refetch();
            }, 500);
          },
        },
        {
          text: "Complete payment",
          onPress: () => {
            onResumePendingPayment?.({
              subscriptionId: rec.subscription?.id,
              billingId: String(rec.id),
            });
          },
        },
      ],
    );
  };

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
      {!isError && rows.length > 0 ? (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {rows.map((rec) => {
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
            const pending = st === "pending" && !isFleetOwner;
            const statusTone = paid
              ? primaryColor
              : failed
                ? errorColor
                : mutedColor;
            const RowWrapper = pending ? Pressable : View;
            const rowProps = pending
              ? {
                  onPress: () => openPendingActions(rec),
                  disabled: busy,
                  accessibilityRole: "button" as const,
                  accessibilityLabel: "Manage pending subscription payment",
                }
              : {};
            return (
              <RowWrapper
                key={String(rec.id)}
                style={[styles.row, { borderTopColor: borderColor }]}
                {...rowProps}
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
                  {pending ? (
                    <StyledText
                      variant="labelSmall"
                      style={{ color: primaryColor, marginTop: 2 }}
                    >
                      Tap to finish payment or cancel
                    </StyledText>
                  ) : null}
                </View>
                <View style={styles.rowEnd}>
                  <StyledText variant="bodyMedium" style={{ color: textColor }}>
                    {Number.isFinite(amt) ? formatEuro(amt) : "—"}
                  </StyledText>
                  <StyledText
                    variant="labelSmall"
                    style={{
                      color: pending ? primaryColor : statusTone,
                      textDecorationLine: pending ? "underline" : "none",
                    }}
                  >
                    {statusLabel(st)}
                  </StyledText>
                </View>
              </RowWrapper>
            );
          })}
        </ScrollView>
      ) : null}
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
  listScroll: {
    maxHeight: 240,
  },
  listContent: {
    paddingBottom: 4,
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
