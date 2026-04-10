import React from "react";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useFleet } from "@/app/app-hooks/useFleet";
import BranchesListPanel from "@/app/components/dashboard/branch/BranchesListPanel";

/**
 * Lists fleet branches with create / edit / delete. Opening a branch navigates to
 * BranchManagementScreen with branchId.
 */
const BranchesListScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const buttonColor = useThemeColor({}, "button");

  const {
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
  } = useFleet({ selectedBranchId: null });

  return (
    <BranchesListPanel
      backgroundColor={backgroundColor}
      cardColor={cardColor}
      textColor={textColor}
      borderColor={borderColor}
      primaryColor={primaryColor}
      buttonColor={buttonColor}
      branches={branches}
      showCreateForm={showCreateForm}
      setShowCreateForm={setShowCreateForm}
      editingBranch={editingBranch}
      newBranchName={newBranchName}
      setNewBranchName={setNewBranchName}
      handleBranchAddressSelect={handleBranchAddressSelect}
      clearBranchForm={clearBranchForm}
      handleCreateBranch={handleCreateBranch}
      handleUpdateBranch={handleUpdateBranch}
      handleDeleteBranch={handleDeleteBranch}
      startEditing={startEditing}
      cancelEditing={cancelEditing}
      limitsReached={limitsReached}
      isCreating={isCreating}
      isUpdating={isUpdating}
      isDeleting={isDeleting}
    />
  );
};

export default BranchesListScreen;
