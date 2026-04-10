import React, { type Dispatch, type SetStateAction } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import type { BranchBulkOrderItem } from "@/app/interfaces/FleetInterfaces";
import { formatCurrency } from "@/app/utils/methods";

interface Props {
  cardColor: string;
  borderColor: string;
  textColor: string;
  primaryColor: string;
  bulkOrders: BranchBulkOrderItem[] | undefined;
  bulkOrdersExpanded: boolean;
  setBulkOrdersExpanded: (v: boolean) => void;
  expandedBulkOrderId: string | null;
  setExpandedBulkOrderId: Dispatch<SetStateAction<string | null>>;
  canCancelOrRescheduleBulkOrder: (order: BranchBulkOrderItem) => boolean;
  handleCancelBulkOrder: (order: BranchBulkOrderItem) => void;
  openRescheduleModal: (order: BranchBulkOrderItem) => void;
  isCancelling: boolean;
}

const BranchBulkOrdersSection = ({
  cardColor,
  borderColor,
  textColor,
  primaryColor,
  bulkOrders,
  bulkOrdersExpanded,
  setBulkOrdersExpanded,
  expandedBulkOrderId,
  setExpandedBulkOrderId,
  canCancelOrRescheduleBulkOrder,
  handleCancelBulkOrder,
  openRescheduleModal,
  isCancelling,
}: Props) => (
  <View
    style={[
      styles.branchDetailCard,
      { backgroundColor: cardColor, borderColor },
    ]}
  >
    <TouchableOpacity
      style={styles.bulkOrdersHeader}
      onPress={() => setBulkOrdersExpanded(!bulkOrdersExpanded)}
      activeOpacity={0.7}
    >
      <StyledText
        variant="titleMedium"
        style={{ color: textColor, fontWeight: "600" }}
      >
        Bulk orders
      </StyledText>
      <Ionicons
        name={bulkOrdersExpanded ? "chevron-up" : "chevron-down"}
        size={22}
        color={textColor}
      />
    </TouchableOpacity>

    {bulkOrdersExpanded && (
      <View style={styles.bulkOrdersListContainer}>
        {!bulkOrders?.length ? (
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor, opacity: 0.8 }}
          >
            No bulk orders for this branch.
          </StyledText>
        ) : (
          <ScrollView
            style={styles.bulkOrdersScrollView}
            contentContainerStyle={styles.bulkOrdersScrollContent}
            nestedScrollEnabled
          >
            {bulkOrders.map((order) => (
              <View
                key={order.id}
                style={[styles.bulkOrderItem, { borderColor }]}
              >
                <TouchableOpacity
                  style={styles.bulkOrderRefRow}
                  onPress={() =>
                    setExpandedBulkOrderId((id) =>
                      id === order.id ? null : order.id,
                    )
                  }
                  activeOpacity={0.7}
                >
                  <StyledText
                    variant="bodyMedium"
                    style={{ color: primaryColor, fontWeight: "600" }}
                  >
                    {order.booking_reference || order.id}
                  </StyledText>
                  <Ionicons
                    name={
                      expandedBulkOrderId === order.id
                        ? "chevron-up"
                        : "chevron-down"
                    }
                    size={18}
                    color={textColor}
                  />
                </TouchableOpacity>
                {expandedBulkOrderId === order.id && (
                  <View style={[styles.bulkOrderDetail, { borderColor }]}>
                    <View style={styles.detailRow}>
                      <StyledText
                        variant="bodySmall"
                        style={{ color: textColor, fontWeight: "600" }}
                      >
                        Vehicles:
                      </StyledText>
                      <StyledText
                        variant="bodySmall"
                        style={{ color: textColor }}
                      >
                        {order.number_of_vehicles}
                      </StyledText>
                    </View>
                    {order.total_amount != null && (
                      <View style={styles.detailRow}>
                        <StyledText
                          variant="bodySmall"
                          style={{ color: textColor, fontWeight: "600" }}
                        >
                          Total:
                        </StyledText>
                        <StyledText
                          variant="bodySmall"
                          style={{ color: textColor }}
                        >
                          {formatCurrency(order.total_amount)}
                        </StyledText>
                      </View>
                    )}
                    {order.created_at && (
                      <View style={styles.detailRow}>
                        <StyledText
                          variant="bodySmall"
                          style={{ color: textColor, fontWeight: "600" }}
                        >
                          Date:
                        </StyledText>
                        <StyledText
                          variant="bodySmall"
                          style={{ color: textColor }}
                        >
                          {new Date(order.created_at).toLocaleDateString()}
                        </StyledText>
                      </View>
                    )}
                    {order.payment_status ? (
                      <View style={styles.detailRow}>
                        <StyledText
                          variant="bodySmall"
                          style={{ color: textColor, fontWeight: "600" }}
                        >
                          Payment:
                        </StyledText>
                        <StyledText
                          variant="bodySmall"
                          style={{ color: textColor }}
                        >
                          {order.payment_status}
                        </StyledText>
                      </View>
                    ) : null}
                    {order.order_data &&
                      typeof order.order_data === "object" &&
                      Object.keys(order.order_data).length > 0 &&
                      (() => {
                        const d = order.order_data as Record<string, unknown>;
                        const service = d.service_type as
                          | {
                              name?: string;
                              duration?: number;
                              fleet_price?: number;
                              price?: number;
                            }
                          | undefined;
                        const address = d.address as
                          | {
                              address?: string;
                              post_code?: string;
                              city?: string;
                              country?: string;
                            }
                          | undefined;
                        const addressLine = address
                          ? [
                              address.address,
                              address.post_code,
                              address.city,
                              address.country,
                            ]
                              .filter(Boolean)
                              .join(", ") || undefined
                          : undefined;
                        const dateVal =
                          typeof d.date === "string" ? d.date : undefined;
                        const startTime =
                          typeof d.start_time === "string"
                            ? d.start_time
                            : undefined;
                        const endTime =
                          typeof d.end_time === "string"
                            ? d.end_time
                            : typeof d.estimated_finish_time === "string"
                              ? d.estimated_finish_time
                              : undefined;
                        const timeRange =
                          [startTime, endTime].filter(Boolean).join(" – ") ||
                          undefined;
                        const windowVal =
                          typeof d.window === "string" ? d.window : undefined;
                        const teamSize =
                          typeof d.suggested_team_size === "number"
                            ? d.suggested_team_size
                            : undefined;
                        const subtotal =
                          typeof d.subtotal_amount === "number"
                            ? d.subtotal_amount
                            : undefined;
                        const discount =
                          typeof d.discount_applied === "number"
                            ? d.discount_applied
                            : undefined;
                        const total =
                          typeof d.total_amount === "number"
                            ? d.total_amount
                            : undefined;
                        const instructions =
                          typeof d.special_instructions === "string" &&
                          d.special_instructions.trim()
                            ? d.special_instructions.trim()
                            : undefined;
                        return (
                          <View
                            style={[styles.bulkOrderData, { borderColor }]}
                          >
                            <StyledText
                              variant="labelMedium"
                              style={{
                                color: textColor,
                                marginBottom: 8,
                              }}
                            >
                              Details
                            </StyledText>
                            {service?.name != null && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Service:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {String(service.name)}
                                </StyledText>
                              </View>
                            )}
                            {service?.duration != null && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Duration:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {service.duration} min
                                </StyledText>
                              </View>
                            )}
                            {addressLine && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Address:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                  numberOfLines={2}
                                >
                                  {addressLine}
                                </StyledText>
                              </View>
                            )}
                            {dateVal && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Date:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {new Date(dateVal).toLocaleDateString()}
                                </StyledText>
                              </View>
                            )}
                            {timeRange && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Time:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {timeRange}
                                </StyledText>
                              </View>
                            )}
                            {windowVal && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Window:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {windowVal}
                                </StyledText>
                              </View>
                            )}
                            {teamSize != null && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Team size:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {teamSize}
                                </StyledText>
                              </View>
                            )}
                            {subtotal != null && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Subtotal:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {formatCurrency(subtotal)}
                                </StyledText>
                              </View>
                            )}
                            {discount != null && discount > 0 && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Discount:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {formatCurrency(discount)}
                                </StyledText>
                              </View>
                            )}
                            {total != null && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Total:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                >
                                  {formatCurrency(total)}
                                </StyledText>
                              </View>
                            )}
                            {instructions != null && (
                              <View style={styles.detailRow}>
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    fontWeight: "600",
                                  }}
                                >
                                  Instructions:
                                </StyledText>
                                <StyledText
                                  variant="bodySmall"
                                  style={{ color: textColor }}
                                  numberOfLines={3}
                                >
                                  {instructions}
                                </StyledText>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                    {order.payment_status !== "cancelled" && (
                      <View
                        style={[styles.bulkOrderActions, { borderColor }]}
                      >
                        {!canCancelOrRescheduleBulkOrder(order) ? (
                          <StyledText
                            variant="bodySmall"
                            style={{
                              color: "red",
                              opacity: 0.9,
                              marginBottom: 8,
                            }}
                          >
                            You cannot cancel or reschedule this order within
                            12 hours of the appointment.
                          </StyledText>
                        ) : (
                          <View style={styles.bulkOrderActionRow}>
                            <TouchableOpacity
                              style={[
                                styles.bulkActionButton,
                                { borderColor },
                              ]}
                              onPress={() => handleCancelBulkOrder(order)}
                              disabled={isCancelling}
                            >
                              {isCancelling ? (
                                <ActivityIndicator
                                  size="small"
                                  color={textColor}
                                />
                              ) : (
                                <>
                                  <Ionicons
                                    name="close-circle-outline"
                                    size={18}
                                    color="#FF3B30"
                                  />
                                  <StyledText
                                    variant="bodySmall"
                                    style={{ color: "#FF3B30" }}
                                  >
                                    Cancel
                                  </StyledText>
                                </>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.bulkActionButton,
                                { borderColor },
                              ]}
                              onPress={() => openRescheduleModal(order)}
                            >
                              <Ionicons
                                name="calendar-outline"
                                size={18}
                                color={primaryColor}
                              />
                              <StyledText
                                variant="bodySmall"
                                style={{ color: primaryColor }}
                              >
                                Reschedule
                              </StyledText>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    )}
  </View>
);

export default BranchBulkOrdersSection;

const styles = StyleSheet.create({
  branchDetailCard: {
    margin: 10,
    padding: 10,
    borderRadius: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 2,
  },
  bulkOrdersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bulkOrdersListContainer: {
    marginTop: 12,
    maxHeight: 300,
  },
  bulkOrdersScrollView: {
    flexGrow: 0,
  },
  bulkOrdersScrollContent: {
    gap: 8,
    paddingBottom: 8,
  },
  bulkOrderItem: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  bulkOrderRefRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  bulkOrderDetail: {
    padding: 5,
    borderTopWidth: 1,
    gap: 6,
  },
  bulkOrderData: {
    marginTop: 8,
    paddingTop: 5,
    borderTopWidth: 1,
    gap: 10,
  },
  bulkOrderActions: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  bulkOrderActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  bulkActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
});
