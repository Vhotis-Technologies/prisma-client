import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useModalService } from "@/app/contexts/ModalServiceProvider";
import CreateTicketModal from "@/app/components/support/CreateTicketModal";
import {
  useFetchTicketsQuery,
  useCreateTicketMutation,
} from "@/app/store/api/ticketApi";
import type { CreateTicketPayload } from "@/app/interfaces/SupportInterfaces";

type TabId = "create" | "existing";

export default function HelpSupportScreen() {
  const [activeTab, setActiveTab] = useState<TabId>("create");
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const cardColor = useThemeColor({}, "cards");

  const { showSheetModal } = useModalService();
  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useFetchTicketsQuery();
  const [createTicket, { isLoading: isCreating }] = useCreateTicketMutation();

  const handleOpenNewTicket = () => {
    showSheetModal(
      <CreateTicketModal onSubmit={handleSubmitTicket} />,
      "New ticket"
    );
  };

  const handleSubmitTicket = async (payload: CreateTicketPayload) => {
    await createTicket(payload).unwrap();
    refetchTickets();
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "create", label: "Create ticket" },
    { id: "existing", label: "Existing tickets" },
  ];

  return (
    <View style={[styles.container, { backgroundColor }]}>
      

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsContainer, { borderBottomColor: borderColor }]}
        contentContainerStyle={styles.tabsContent}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.6}
              style={[
                styles.tab,
                {
                  borderBottomColor: isActive ? primaryColor : "transparent",
                  borderBottomWidth: isActive ? 3 : 0,
                },
              ]}
            >
              <StyledText
                variant="labelLarge"
                style={[
                  styles.tabLabel,
                  { color: isActive ? primaryColor : textColor },
                  isActive && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </StyledText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.tabContent}>
        {activeTab === "create" && (
          <View style={styles.createContent}>
            <StyledButton
              title="New ticket"
              variant="medium"
              onPress={handleOpenNewTicket}
              disabled={isCreating}
              style={styles.newTicketButton}
            />
          </View>
        )}

        {activeTab === "existing" && (
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {ticketsLoading ? (
              <ActivityIndicator size="large" color={primaryColor} style={styles.loader} />
            ) : !tickets.length ? (
              <View style={styles.emptyState}>
                <StyledText variant="bodyLarge" style={{ color: textColor }}>
                  No tickets yet
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[styles.emptySubtext, { color: textColor }]}
                >
                  Tickets you create will appear here.
                </StyledText>
              </View>
            ) : (
              tickets.map((ticket) => (
                <TouchableOpacity
                  key={ticket.id}
                  style={[styles.ticketRow, { backgroundColor: cardColor, borderColor }]}
                  onPress={() =>
                    router.push({
                      pathname: "/main/settings/TicketDetailScreen",
                      params: { ticketId: ticket.id },
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.ticketRowMain}>
                    <StyledText variant="labelLarge" style={{ color: textColor }}>
                      {ticket.subject ?? ticket.summary ?? `Ticket #${ticket.id}`}
                    </StyledText>
                    <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                      {new Date(ticket.created_at).toLocaleDateString()} · {ticket.status}
                    </StyledText>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={textColor} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    maxHeight: 48,
  },
  tabsContent: {
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
  },
  tabLabel: {},
  tabLabelActive: {
    fontWeight: "600",
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  createContent: {
    flex: 1,
    alignItems: "center",
    paddingTop: 24,
  },
  newTicketButton: {
    minWidth: 200,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  loader: {
    marginTop: 32,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 48,
  },
  emptySubtext: {
    marginTop: 8,
    opacity: 0.8,
  },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  ticketRowMain: {
    flex: 1,
  },
});
