import React from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import AddressSearchInput from "@/app/components/shared/AddressSearchInput";
import StyledButton from "@/app/components/helpers/StyledButton";
import { formatCurrency } from "@/app/utils/methods";
import type { BranchProps } from "@/app/interfaces/FleetInterfaces";

const BRANCH_DETAIL_PATH = "/main/dashboard/BranchManagementScreen" as const;

export interface BranchesListPanelProps {
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  borderColor: string;
  primaryColor: string;
  buttonColor: string;
  branches: BranchProps[];
  showCreateForm: boolean;
  setShowCreateForm: (v: boolean) => void;
  editingBranch: string | null;
  newBranchName: string;
  setNewBranchName: (v: string) => void;
  handleBranchAddressSelect: (result: {
    address: string;
    post_code: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
  }) => void;
  clearBranchForm: () => void;
  handleCreateBranch: () => void;
  handleUpdateBranch: (branchId: string) => void;
  handleDeleteBranch: (branchId: string, branchName: string) => void;
  startEditing: (branch: BranchProps) => void;
  cancelEditing: () => void;
  limitsReached: {
    admins: boolean;
    branches: boolean;
    vehicles: boolean;
  };
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

const BranchesListPanel = ({
  backgroundColor,
  cardColor,
  textColor,
  borderColor,
  primaryColor,
  buttonColor,
  branches,
  showCreateForm,
  setShowCreateForm,
  editingBranch,
  newBranchName,
  setNewBranchName,
  handleBranchAddressSelect,
  clearBranchForm,
  handleCreateBranch,
  handleUpdateBranch,
  handleDeleteBranch,
  startEditing,
  cancelEditing,
  limitsReached,
  isCreating,
  isUpdating,
  isDeleting,
}: BranchesListPanelProps) => (
  <ScrollView
    style={[styles.container, { backgroundColor }]}
    showsVerticalScrollIndicator={false}
  >
    {showCreateForm && (
      <View
        style={[
          styles.createForm,
          { backgroundColor: cardColor, borderColor },
        ]}
      >
        <StyledText
          variant="titleMedium"
          style={[styles.formTitle, { color: textColor }]}
        >
          Create New Branch
        </StyledText>
        <StyledTextInput
          label="Branch name *"
          value={newBranchName}
          onChangeText={setNewBranchName}
          placeholder="Enter branch name"
          placeholderTextColor={"black"}
        />
        <AddressSearchInput
          label="Branch address"
          placeholder="Search for branch address..."
          onSelect={handleBranchAddressSelect}
        />
        <View style={styles.formButtons}>
          <StyledButton
            style={{ flex: 1 }}
            title="Cancel"
            variant="tonal"
            onPress={() => {
              setShowCreateForm(false);
              clearBranchForm();
            }}
          />

          {limitsReached.branches && (
            <View style={styles.limitWarning}>
              <Ionicons name="warning-outline" size={20} color={textColor} />
              <StyledText
                variant="bodySmall"
                style={{ color: textColor, flex: 1 }}
              >
                Branch limit reached. Please upgrade your subscription to add
                more branches.
              </StyledText>
            </View>
          )}
          <StyledButton
            style={{ flex: 1 }}
            title="Create"
            variant="tonal"
            onPress={handleCreateBranch}
            disabled={isCreating || limitsReached.branches}
            isLoading={isCreating}
          />
        </View>
      </View>
    )}

    <View style={styles.branchesList}>
      {branches.map((branch) => (
        <View key={branch.id}>
          {editingBranch === branch.id ? (
            <View
              style={[
                styles.branchCard,
                { backgroundColor: cardColor, borderColor },
              ]}
            >
              <StyledTextInput
                label="Branch name"
                value={newBranchName}
                onChangeText={setNewBranchName}
                placeholder="Branch name"
                placeholderTextColor={textColor + "80"}
              />
              <AddressSearchInput
                label="Branch address"
                placeholder="Search for branch address..."
                onSelect={handleBranchAddressSelect}
                initialSelectedAddress={
                  branch.address
                    ? {
                        address: branch.address || "",
                        post_code: branch.postcode || "",
                        city: branch.city || "",
                        country: branch.country || "",
                        latitude: branch.latitude ?? 0,
                        longitude: branch.longitude ?? 0,
                      }
                    : null
                }
              />
              <View style={styles.branchActions}>
                <StyledButton
                  style={{ flex: 1 }}
                  title="Cancel"
                  variant="tonal"
                  onPress={cancelEditing}
                  disabled={isUpdating}
                  isLoading={isUpdating}
                />

                <StyledButton
                  style={{ flex: 1 }}
                  title="Save"
                  variant="small"
                  onPress={() => handleUpdateBranch(branch.id)}
                  disabled={isUpdating}
                  isLoading={isUpdating}
                />
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.branchCard,
                { backgroundColor: cardColor, borderColor },
              ]}
              onPress={() => {
                router.push({
                  pathname: BRANCH_DETAIL_PATH,
                  params: { branchId: branch.id },
                });
              }}
            >
              <View style={styles.branchHeader}>
                <Ionicons name="business" size={24} color={primaryColor} />
                <View style={styles.branchInfo}>
                  <StyledText
                    variant="titleMedium"
                    style={[styles.branchName, { color: textColor }]}
                  >
                    {branch.name}
                  </StyledText>
                  {branch.city && (
                    <StyledText
                      variant="bodySmall"
                      style={[styles.branchLocation, { color: textColor }]}
                    >
                      {branch.city}
                      {branch.address && `, ${branch.address}`}
                    </StyledText>
                  )}
                </View>
              </View>
              <View style={styles.branchStats}>
                <View style={styles.branchStatItem}>
                  <Ionicons name="car" size={16} color={textColor} />
                  <StyledText
                    variant="bodySmall"
                    style={[styles.branchStatText, { color: textColor }]}
                  >
                    {branch.vehicle_count || 0} vehicles
                  </StyledText>
                </View>
                <View style={styles.branchStatItem}>
                  <Ionicons name="person" size={16} color={textColor} />
                  <StyledText
                    variant="bodySmall"
                    style={[styles.branchStatText, { color: textColor }]}
                  >
                    {branch.admin_count || 0} admins
                  </StyledText>
                </View>
              </View>
              {branch.spend_limit != null && branch.spend_limit > 0 ? (
                <View style={styles.branchStats}>
                  <StyledText
                    variant="bodySmall"
                    style={{ color: textColor, opacity: 0.85 }}
                  >
                    Spent: {formatCurrency(branch.spent ?? 0)} · Left:{" "}
                    {branch.remaining != null
                      ? formatCurrency(branch.remaining)
                      : "—"}
                  </StyledText>
                </View>
              ) : (
                <View style={styles.branchStats}>
                  <StyledText
                    variant="bodySmall"
                    style={{ color: textColor, opacity: 0.7 }}
                  >
                    No limit
                  </StyledText>
                </View>
              )}
              <View style={styles.branchActions}>
                <TouchableOpacity
                  style={[styles.actionButton, { borderColor }]}
                  onPress={() => startEditing(branch)}
                >
                  <Ionicons name="create" size={16} color={textColor} />
                  <StyledText
                    variant="bodySmall"
                    style={{ color: textColor }}
                  >
                    Edit
                  </StyledText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { borderColor }]}
                  onPress={() => handleDeleteBranch(branch.id, branch.name)}
                  disabled={isDeleting}
                >
                  <Ionicons name="trash" size={16} color="#FF3B30" />
                  <StyledText
                    variant="bodySmall"
                    style={{ color: "#FF3B30" }}
                  >
                    Delete
                  </StyledText>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>

    {!showCreateForm && (
      <>
        {limitsReached.branches && (
          <View style={[styles.limitWarning, { margin: 16 }]}>
            <Ionicons name="warning-outline" size={20} color={textColor} />
            <StyledText
              variant="bodySmall"
              style={{ color: textColor, flex: 1 }}
            >
              Branch limit reached. Please upgrade your subscription to add more
              branches.
            </StyledText>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.addButton,
            { backgroundColor: buttonColor },
            limitsReached.branches && styles.addButtonDisabled,
          ]}
          onPress={() => setShowCreateForm(true)}
          disabled={limitsReached.branches}
        >
          <Ionicons name="add" size={24} color="white" />
          <StyledText variant="bodyLarge" style={styles.addButtonText}>
            Add New Branch
          </StyledText>
        </TouchableOpacity>
      </>
    )}
  </ScrollView>
);

export default BranchesListPanel;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  createForm: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  formTitle: {
    marginBottom: 8,
    fontWeight: "600",
  },
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  branchesList: {
    padding: 16,
    gap: 12,
  },
  branchCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  branchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  branchInfo: {
    flex: 1,
  },
  branchName: {
    fontWeight: "600",
  },
  branchLocation: {
    marginTop: 4,
    opacity: 0.7,
  },
  branchStats: {
    flexDirection: "row",
    gap: 16,
  },
  branchStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  branchStatText: {
    fontSize: 12,
  },
  branchActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    margin: 14,
    borderRadius: 20,
    gap: 8,
  },
  addButtonText: {
    color: "white",
    fontWeight: "600",
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  limitWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 193, 7, 0.3)",
  },
});
