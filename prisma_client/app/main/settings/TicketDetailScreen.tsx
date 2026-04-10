import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useFetchTicketDetailQuery } from "@/app/store/api/ticketApi";
import { TICKET_ISSUE_TYPES } from "@/app/interfaces/SupportInterfaces";

export default function TicketDetailScreen() {
  const params = useLocalSearchParams<{ ticketId: string }>();
  const ticketId = params.ticketId;
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const cardColor = useThemeColor({}, "cards");
  const primaryColor = useThemeColor({}, "primary");

  const {
    data: ticket,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useFetchTicketDetailQuery(ticketId!, { skip: !ticketId });

  const issueLabel =
    ticket?.issue_type
      ? TICKET_ISSUE_TYPES.find((t) => t.value === ticket.issue_type)?.label ??
        ticket.issue_type
      : "—";

  if (!ticketId) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <StyledText style={{ color: textColor }}>Missing ticket ID.</StyledText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            colors={[primaryColor]}
          />
        }
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={primaryColor} style={styles.loader} />
        ) : isError || !ticket ? (
          <StyledText style={{ color: textColor }}>
            Failed to load ticket. Pull to refresh.
          </StyledText>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
              <StyledText variant="labelMedium" style={[styles.label, { color: textColor }]}>
                Issue type
              </StyledText>
              <StyledText variant="bodyLarge" style={{ color: textColor }}>
                {issueLabel}
              </StyledText>
            </View>
            {ticket.booking_reference ? (
              <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
                <StyledText variant="labelMedium" style={[styles.label, { color: textColor }]}>
                  Booking reference
                </StyledText>
                <StyledText variant="bodyLarge" style={{ color: textColor }}>
                  {ticket.booking_reference}
                </StyledText>
              </View>
            ) : null}
            <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
              <StyledText variant="labelMedium" style={[styles.label, { color: textColor }]}>
                Status
              </StyledText>
              <StyledText variant="bodyLarge" style={{ color: textColor }}>
                {ticket.status}
              </StyledText>
            </View>
            <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
              <StyledText variant="labelMedium" style={[styles.label, { color: textColor }]}>
                Created
              </StyledText>
              <StyledText variant="bodyLarge" style={{ color: textColor }}>
                {new Date(ticket.created_at).toLocaleString()}
              </StyledText>
            </View>
            <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
              <StyledText variant="labelMedium" style={[styles.label, { color: textColor }]}>
                Description
              </StyledText>
              <StyledText variant="bodyLarge" style={{ color: textColor }}>
                {ticket.description || "—"}
              </StyledText>
            </View>

            {ticket.updates?.length > 0 && (
              <View style={styles.updatesSection}>
                <StyledText variant="titleSmall" style={[styles.sectionTitle, { color: textColor }]}>
                  Updates
                </StyledText>
                {ticket.updates.map((update, index) => (
                  <View
                    key={index}
                    style={[styles.updateCard, { backgroundColor: cardColor, borderColor }]}
                  >
                    <StyledText variant="labelSmall" style={{ color: textColor, opacity: 0.8 }}>
                      {new Date(update.created_at).toLocaleString()}
                      {update.kind === "status_change" && update.status_to
                        ? ` · Status: ${update.status_to}`
                        : update.kind === "reply"
                        ? " · Reply"
                        : ""}
                    </StyledText>
                    {update.message ? (
                      <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 4 }}>
                        {update.message}
                      </StyledText>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loader: {
    marginTop: 32,
  },
  card: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  label: {
    marginBottom: 4,
    opacity: 0.9,
  },
  updatesSection: {
    marginTop: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: "600",
  },
  updateCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
});
