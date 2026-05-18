import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import useProfile from "@/app/app-hooks/useProfile";
import { useGetFleetInvoicesQuery } from "@/app/store/api/fleetApi";
import { useGetPartnerInvoicesQuery } from "@/app/store/api/partnerApi";
import { useGetMyBulkInvoicesQuery } from "@/app/store/api/eventApi";
import type { InvoiceListItem } from "@/app/interfaces/InvoiceInterfaces";
import InvoiceCardItem from "@/app/components/settings/InvoiceCardItem";
import {
  canAccessBulkInvoices,
  getBulkInvoiceApiSource,
} from "@/app/utils/bulkInvoiceAccess";

const STATUS_ORDER = [
  "invoice_later",
  "succeeded",
  "paid",
  "failed",
  "cancelled",
];

const formatStatusLabel = (status: string) => {
  switch (status) {
    case "invoice_later":
      return "Unpaid";
    case "succeeded":
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
};

const InvoicesScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const warningColor = useThemeColor({}, "warning");
  const errorColor = useThemeColor({}, "error");

  const { userProfile } = useProfile();
  const canSeeInvoices = canAccessBulkInvoices(userProfile);
  const apiSource = getBulkInvoiceApiSource(userProfile);

  const skipFleet = apiSource !== "fleet";
  const skipPartner = apiSource !== "partner";
  const skipMy = apiSource !== "my";

  const fleetQuery = useGetFleetInvoicesQuery(undefined, { skip: skipFleet });
  const partnerQuery = useGetPartnerInvoicesQuery(undefined, {
    skip: skipPartner,
  });
  const myQuery = useGetMyBulkInvoicesQuery(undefined, { skip: skipMy });

  const activeQuery =
    apiSource === "fleet"
      ? fleetQuery
      : apiSource === "partner"
        ? partnerQuery
        : myQuery;

  const invoices = activeQuery.data?.invoices ?? [];
  const isLoading = activeQuery.isLoading;
  const isError = activeQuery.isError;
  const refetch = activeQuery.refetch;
  const isFetching = activeQuery.isFetching;
  const isFleetOwner = userProfile?.is_fleet_owner === true;

  const groupedInvoices = useMemo(() => {
    const groups = new Map<string, InvoiceListItem[]>();
    for (const invoice of invoices) {
      const key = invoice.payment_status || "unknown";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(invoice);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const aIndex = STATUS_ORDER.indexOf(a[0]);
      const bIndex = STATUS_ORDER.indexOf(b[0]);
      const left = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const right = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return left - right;
    });
  }, [invoices]);

  const getStatusColor = (status: string) => {
    if (status === "invoice_later") {
      return warningColor;
    }
    if (status === "failed" || status === "cancelled") {
      return errorColor;
    }
    return primaryColor;
  };

  const openInvoice = useCallback((invoice: InvoiceListItem) => {
    router.push({
      pathname: "/main/settings/InvoiceDetailScreen",
      params: { bulkOrderId: invoice.id },
    });
  }, []);

  const subtitle = useMemo(() => {
    if (isFleetOwner) {
      return "Fleet bulk orders you are billed for. Tap an invoice to pay or view status.";
    }
    if (apiSource === "partner") {
      return "Your bulk invoices. Tap an invoice to pay or view status.";
    }
    return "Bulk orders you booked. Tap an invoice to pay or view status.";
  }, [apiSource, isFleetOwner]);

  if (!canSeeInvoices) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <StyledText variant="titleLarge" style={[styles.title, { color: textColor }]}>
          Invoices
        </StyledText>
        <StyledText variant="bodyMedium" style={{ color: textColor, opacity: 0.85 }}>
          Invoices are available when you book bulk services with pay later.
        </StyledText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StyledText variant="titleLarge" style={[styles.title, { color: textColor }]}>
        Invoices
      </StyledText>
      <StyledText variant="bodySmall" style={[styles.subtitle, { color: textColor }]}>
        {subtitle}
      </StyledText>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={primaryColor} />
          <StyledText variant="bodySmall" style={{ color: textColor }}>
            Loading invoices...
          </StyledText>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <StyledText variant="bodyMedium" style={{ color: errorColor }}>
            Could not load invoices right now.
          </StyledText>
        </View>
      ) : invoices.length === 0 ? (
        <View style={styles.centered}>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            No invoices found.
          </StyledText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              colors={[primaryColor]}
            />
          }
        >
          {groupedInvoices.map(([status, statusInvoices]) => (
            <View key={status} style={styles.group}>
              <StyledText variant="labelLarge" style={{ color: getStatusColor(status) }}>
                {formatStatusLabel(status)}
              </StyledText>
              {statusInvoices.map((invoice) => (
                <InvoiceCardItem
                  key={invoice.id}
                  invoice={invoice}
                  statusColor={getStatusColor(invoice.payment_status)}
                  statusLabel={formatStatusLabel(invoice.payment_status)}
                  onPress={() => openInvoice(invoice)}
                  showCreator={isFleetOwner}
                  backgroundColor={cardColor}
                  borderColor={borderColor}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

export default InvoicesScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
    opacity: 0.8,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  scrollContent: {
    paddingBottom: 24,
    gap: 18,
  },
  group: {
    gap: 4,
  },
});
