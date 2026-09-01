import React, { useState } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import {
  useGetFleetAdminsQuery,
  useGetBranchesQuery,
  useUpdateBranchAdminMutation,
  useRemoveBranchAdminMutation,
  useResendInviteMutation,
} from "@/app/store/api/fleetApi";
import StyledButton from "@/app/components/helpers/StyledButton";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import { useSubscriptionLimits } from "@/app/hooks/useSubscriptionLimits";
import { useAlertContext } from "@/app/contexts/AlertContext";
import type { FleetAdmin } from "@/app/interfaces/FleetInterfaces";

const AdminManagementScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const buttonColor = useThemeColor({}, "button");

  const { setAlertConfig, setIsVisible } = useAlertContext();
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [showBranchModal, setShowBranchModal] = useState(false);

  const { data: fleetAdminsData, refetch: refetchAdmins } = useGetFleetAdminsQuery();
  const { data: branchesData } = useGetBranchesQuery();
  const [updateBranchAdmin, { isLoading: isUpdating }] = useUpdateBranchAdminMutation();
  const [removeBranchAdmin, { isLoading: isRemoving }] = useRemoveBranchAdminMutation();
  const [resendInvite, { isLoading: isResending }] = useResendInviteMutation();
  const { limitsReached } = useSubscriptionLimits();

  const admins = fleetAdminsData?.admins ?? [];
  const branches = branchesData?.branches ?? [];
  const selectedAdmin = admins.find((a) => a.id === selectedAdminId);
  const selectedBranch = branches.find((b) => b.id === editBranchId);

  const startEditing = (admin: FleetAdmin) => {
    setEditingAdminId(admin.id);
    setEditName(admin.name);
    setEditPhone(admin.phone || "");
    setEditBranchId(admin.branch_id);
  };

  const cancelEditing = () => {
    setEditingAdminId(null);
    setEditName("");
    setEditPhone("");
    setEditBranchId("");
  };

  const handleUpdateAdmin = async () => {
    if (!editingAdminId) return;
    try {
      await updateBranchAdmin({
        admin_id: editingAdminId,
        name: editName.trim() || undefined,
        phone: editPhone.trim() || undefined,
        branch_id: editBranchId || undefined,
      }).unwrap();
      cancelEditing();
      refetchAdmins();
      setAlertConfig({
        isVisible: true,
        title: "Success",
        message: "Admin updated successfully",
        type: "success",
        onConfirm: () => setIsVisible(false),
      });
    } catch (error: unknown) {
      const err = error as { data?: { error?: string } };
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: err?.data?.error || "Failed to update admin",
        type: "error",
        onConfirm: () => setIsVisible(false),
      });
    }
  };

  const handleResendInvite = (admin: FleetAdmin) => {
    setAlertConfig({
      isVisible: true,
      title: "Resend invitation",
      message: `Send a new set-password email to ${admin.email}? The previous link will stop working.`,
      type: "warning",
      onClose: () => setIsVisible(false),
      onConfirm: async () => {
        try {
          await resendInvite({ admin_id: admin.id }).unwrap();
          refetchAdmins();
          setIsVisible(false);
          setAlertConfig({
            isVisible: true,
            title: "Invitation resent",
            message: "They'll get a new email to set their password.",
            type: "success",
            onConfirm: () => setIsVisible(false),
          });
        } catch (error: unknown) {
          const err = error as { data?: { error?: string } };
          setIsVisible(false);
          setAlertConfig({
            isVisible: true,
            title: "Error",
            message: err?.data?.error || "Failed to resend invitation",
            type: "error",
            onConfirm: () => setIsVisible(false),
          });
        }
      },
    });
  };

  const handleRemoveAdmin = (admin: FleetAdmin) => {
    setAlertConfig({
      isVisible: true,
      title: "Remove Admin",
      message: `Remove ${admin.name} from the fleet? They will no longer have access as a branch admin.`,
      type: "warning",
      onClose: () => setIsVisible(false),
      onConfirm: async () => {
        try {
          await removeBranchAdmin({ admin_id: admin.id }).unwrap();
          setSelectedAdminId(null);
          setEditingAdminId(null);
          refetchAdmins();
          setIsVisible(false);
          setAlertConfig({
            isVisible: true,
            title: "Success",
            message: "Admin removed successfully",
            type: "success",
            onConfirm: () => setIsVisible(false),
          });
        } catch (error: unknown) {
          const err = error as { data?: { error?: string } };
          setIsVisible(false);
          setAlertConfig({
            isVisible: true,
            title: "Error",
            message: err?.data?.error || "Failed to remove admin",
            type: "error",
            onConfirm: () => setIsVisible(false),
          });
        }
      },
    });
  };

  const formatJoinedAt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  if (selectedAdmin && selectedAdminId) {
    const isEditing = editingAdminId === selectedAdmin.id;
    return (
      <ScrollView
        style={[styles.container, { backgroundColor }]}
        showsVerticalScrollIndicator={false}
      >

        {isEditing ? (
          <View style={[styles.formCard, { backgroundColor: cardColor, borderColor }]}>
            <StyledText variant="titleMedium" style={[styles.sectionTitle, { color: textColor }]}>
              Edit Admin
            </StyledText>
            <StyledTextInput
              label="Name"
              value={editName}
              onChangeText={setEditName}
              placeholder="Admin name"
              placeholderTextColor={textColor + "80"}
            />
            <StyledTextInput
              label="Phone"
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Phone"
              placeholderTextColor={textColor + "80"}
              keyboardType="phone-pad"
            />
            <View>
              <StyledText variant="labelMedium" style={{ color: textColor, marginBottom: 8 }}>
                Branch
              </StyledText>
              <TouchableOpacity
                style={[styles.branchSelector, { backgroundColor: backgroundColor, borderColor }]}
                onPress={() => setShowBranchModal(true)}
              >
                <StyledText variant="bodyMedium" style={{ color: selectedBranch ? textColor : textColor + "80" }}>
                  {selectedBranch ? selectedBranch.name : "Select branch"}
                </StyledText>
                <Ionicons name="chevron-down" size={20} color={textColor} />
              </TouchableOpacity>
            </View>
            <Modal
              visible={showBranchModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowBranchModal(false)}
            >
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBranchModal(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.modalContent, { backgroundColor: cardColor }]}>
                  <View style={[styles.modalHeader, { borderColor }]}>
                    <StyledText variant="titleMedium" style={{ color: textColor }}>Select Branch</StyledText>
                    <TouchableOpacity onPress={() => setShowBranchModal(false)}>
                      <Ionicons name="close" size={24} color={textColor} />
                    </TouchableOpacity>
                  </View>
                  <FlatList
                    data={branches}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.branchItem, { borderBottomColor: borderColor }, editBranchId === item.id && { backgroundColor: primaryColor + "20" }]}
                        onPress={() => { setEditBranchId(item.id); setShowBranchModal(false); }}
                      >
                        <StyledText variant="bodyMedium" style={{ color: textColor }}>{item.name}</StyledText>
                        {editBranchId === item.id && <Ionicons name="checkmark" size={20} color={primaryColor} />}
                      </TouchableOpacity>
                    )}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
            <View style={styles.formButtons}>
              <StyledButton title="Cancel" variant="tonal" onPress={cancelEditing} disabled={isUpdating} style={{ flex: 1 }} />
              <StyledButton title="Save" variant="small" onPress={handleUpdateAdmin} disabled={isUpdating} isLoading={isUpdating} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.detailCard, { backgroundColor: cardColor, borderColor }]}>
              <View style={styles.detailRow}>
                <StyledText variant="bodyMedium" style={{ color: textColor, fontWeight: "600" }}>Email</StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>{selectedAdmin.email}</StyledText>
              </View>
              <View style={styles.detailRow}>
                <StyledText variant="bodyMedium" style={{ color: textColor, fontWeight: "600" }}>Phone</StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>{selectedAdmin.phone || "—"}</StyledText>
              </View>
              <View style={styles.detailRow}>
                <StyledText variant="bodyMedium" style={{ color: textColor, fontWeight: "600" }}>Branch</StyledText>
                <StyledText variant="bodyMedium" style={{ color: textColor }}>{selectedAdmin.branch_name}</StyledText>
              </View>
              {selectedAdmin.joined_at && (
                <View style={styles.detailRow}>
                  <StyledText variant="bodyMedium" style={{ color: textColor, fontWeight: "600" }}>Joined</StyledText>
                  <StyledText variant="bodyMedium" style={{ color: textColor }}>{formatJoinedAt(selectedAdmin.joined_at)}</StyledText>
                </View>
              )}
              {selectedAdmin.invite_pending && (
                <View style={styles.detailRow}>
                  <StyledText variant="bodyMedium" style={{ color: textColor, fontWeight: "600" }}>Status</StyledText>
                  <View style={[styles.pendingBadge, { backgroundColor: primaryColor + "20" }]}>
                    <StyledText variant="labelSmall" style={{ color: primaryColor }}>
                      Invite pending
                    </StyledText>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.detailActions}>
              {selectedAdmin.invite_pending && (
                <TouchableOpacity
                  style={[styles.actionButton, { borderColor: primaryColor, backgroundColor: cardColor }]}
                  onPress={() => handleResendInvite(selectedAdmin)}
                  disabled={isResending}
                >
                  <Ionicons name="mail-outline" size={18} color={primaryColor} />
                  <StyledText variant="bodyMedium" style={{ color: primaryColor }}>
                    {isResending ? "Sending…" : "Resend invite"}
                  </StyledText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionButton, { borderColor, backgroundColor: cardColor }]}
                onPress={() => startEditing(selectedAdmin)}
              >
                <Ionicons name="create" size={18} color={textColor} />
                <StyledText variant="bodyMedium" style={{ color: textColor }}>Edit</StyledText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: "#FF3B30", backgroundColor: cardColor }]}
                onPress={() => handleRemoveAdmin(selectedAdmin)}
                disabled={isRemoving}
              >
                <Ionicons name="trash" size={18} color="#FF3B30" />
                <StyledText variant="bodyMedium" style={{ color: "#FF3B30" }}>Remove</StyledText>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  const isLoading = !fleetAdminsData && !branchesData;
  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <StyledText variant="bodyMedium" style={{ color: textColor, marginTop: 8 }}>Loading admins...</StyledText>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor }]} showsVerticalScrollIndicator={false}>
      {admins.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: cardColor, borderColor }]}>
          <Ionicons name="people-outline" size={48} color={textColor + "80"} />
          <StyledText variant="bodyLarge" style={[styles.emptyTitle, { color: textColor }]}>
            No admins yet
          </StyledText>
          <StyledText variant="bodySmall" style={[styles.emptySubtitle, { color: textColor }]}>
            Add a branch admin to manage a branch.
          </StyledText>
        </View>
      ) : (
        <View style={styles.list}>
          {admins.map((admin) => (
            <TouchableOpacity
              key={admin.id}
              style={[styles.adminCard, { backgroundColor: cardColor, borderColor }]}
              onPress={() => setSelectedAdminId(admin.id)}
            >
              <View style={styles.adminCardHeader}>
                <Ionicons name="person" size={22} color={primaryColor} />
                <View style={styles.adminCardInfo}>
                  <View style={styles.adminNameRow}>
                    <StyledText variant="titleMedium" style={[styles.adminName, { color: textColor }]}>
                      {admin.name}
                    </StyledText>
                    {admin.invite_pending && (
                      <View style={[styles.pendingBadge, { backgroundColor: primaryColor + "20" }]}>
                        <StyledText variant="labelSmall" style={{ color: primaryColor }}>
                          Pending
                        </StyledText>
                      </View>
                    )}
                  </View>
                  <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.8 }}>
                    {admin.email}
                  </StyledText>
                  <StyledText variant="bodySmall" style={{ color: textColor, opacity: 0.7 }}>
                    {admin.branch_name}
                  </StyledText>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={textColor + "80"} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {limitsReached.admins && (
        <View style={[styles.limitWarning, { borderColor: "rgba(255, 193, 7, 0.3)" }]}>
          <Ionicons name="warning-outline" size={20} color={textColor} />
          <StyledText variant="bodySmall" style={{ color: textColor, flex: 1 }}>
            Admin limit reached. Upgrade your subscription to add more admins.
          </StyledText>
        </View>
      )}
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: buttonColor }, limitsReached.admins && styles.addButtonDisabled]}
        onPress={() => router.push("/main/dashboard/CreateBranchAdminScreen")}
        disabled={limitsReached.admins}
      >
        <Ionicons name="add" size={24} color="white" />
        <StyledText variant="bodyLarge" style={styles.addButtonText}>
          Add New Admin
        </StyledText>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default AdminManagementScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, gap: 12 },
  adminCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  adminCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  adminCardInfo: { flex: 1, gap: 2 },
  adminNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  adminName: { fontWeight: "600" },
  pendingBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  emptyCard: {
    margin: 16,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontWeight: "600" },
  emptySubtitle: { opacity: 0.8 },
  detailCard: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 8, borderWidth: 1 },
  formCard: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
  sectionTitle: { marginBottom: 4, fontWeight: "600" },
  branchSelector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 8, borderWidth: 1 },
  formButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "85%", maxHeight: "70%", borderRadius: 12, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  branchItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  limitWarning: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 8, backgroundColor: "rgba(255, 193, 7, 0.1)", borderWidth: 1 },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, margin: 16, borderRadius: 20, gap: 8 },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { color: "white", fontWeight: "600" },
});
