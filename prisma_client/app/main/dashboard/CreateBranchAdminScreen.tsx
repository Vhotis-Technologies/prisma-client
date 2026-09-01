import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  TouchableOpacity,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import {
  useCreateBranchAdminMutation,
  useGetBranchesQuery,
} from "@/app/store/api/fleetApi";
import StyledButton from "@/app/components/helpers/StyledButton";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import { useSubscriptionLimits } from "@/app/hooks/useSubscriptionLimits";
import { useAlertContext } from "@/app/contexts/AlertContext";

const CreateBranchAdminScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const insets = useSafeAreaInsets();

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardHeight(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardHeight(0);
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const { setAlertConfig, setIsVisible } = useAlertContext();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [showBranchModal, setShowBranchModal] = useState(false);

  const { data: branchesData } = useGetBranchesQuery();
  const [createBranchAdmin, { isLoading }] = useCreateBranchAdminMutation();
  const { limitsReached } = useSubscriptionLimits();

  const branches = branchesData?.branches || [];

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  const handleBranchSelect = (branchId: string) => {
    setSelectedBranchId(branchId);
    setShowBranchModal(false);
  };

  const handleSubmit = async () => {
    // Validation
    if (!name.trim()) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Name is required",
        type: "error",
        onConfirm: () => setIsVisible(false),
      });
      return;
    }
    if (!email.trim()) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Email is required",
        type: "error",
        onConfirm: () => setIsVisible(false),
      });
      return;
    }
    if (!phone.trim()) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Phone is required",
        type: "error",
        onConfirm: () => setIsVisible(false),
      });
      return;
    }
    if (!selectedBranchId) {
        setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Please select a branch",
        type: "error",
        onConfirm: () => setIsVisible(false),
      });
      return;
    }

    try {
      await createBranchAdmin({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        branch_id: selectedBranchId,
      }).unwrap();

      setAlertConfig({
        isVisible: true,
        title: "Invitation sent",
        message:
          "They'll get an email to set their own password and complete registration.",
        type: "success",
        onConfirm: () => {
          setIsVisible(false);
          router.back();
        },
      });
    } catch (error: unknown) {
      const err = error as { data?: { error?: string } };
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: err?.data?.error || "Failed to send invitation",
        type: "error",
        onConfirm: () => setIsVisible(false),
      });
    }
  };

  /* Offset: main layout custom header + divider sits above this screen's KAV */
  const keyboardVerticalOffset =
    Platform.OS === "ios" ? insets.top + 72 : 0;

  const scrollBottomPadding = 32 + insets.bottom + keyboardHeight;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.form}>
        {/* Name Input */}
        <View style={styles.inputContainer}>
          <StyledTextInput
            label="Employee Name"
            value={name}
            onChangeText={setName}
            placeholder="Enter admin name"
            placeholderTextColor={textColor + "80"}
          />
        </View>

        {/* Email Input */}
        <View style={styles.inputContainer}>
          <StyledTextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="Enter email address"
            placeholderTextColor={textColor + "80"}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Phone Input */}
        <View style={styles.inputContainer}>
          <StyledTextInput
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter phone number"
            placeholderTextColor={textColor + "80"}
            keyboardType="phone-pad"
          />
        </View>

        {/* Branch Selection */}
        <View style={styles.inputContainer}>
          <StyledText
            variant="bodyMedium"
            style={[styles.label, { color: textColor }]}
          >
            Branch *
          </StyledText>
          <TouchableOpacity
            style={[
              styles.branchSelector,
              { backgroundColor: cardColor, borderColor },
            ]}
            onPress={() => setShowBranchModal(true)}
          >
            <StyledText
              variant="bodyMedium"
              style={[
                styles.branchSelectorText,
                {
                  color: selectedBranch ? textColor : textColor + "80",
                },
              ]}
            >
              {selectedBranch ? selectedBranch.name : "Select a branch"}
            </StyledText>
            <Ionicons name="chevron-down" size={20} color={textColor} />
          </TouchableOpacity>
        </View>

        {/* Branch Selection Modal */}
        <Modal
          visible={showBranchModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowBranchModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowBranchModal(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={[styles.modalContent, { backgroundColor: cardColor }]}
            >
              <View style={styles.modalHeader}>
                <StyledText
                  variant="titleMedium"
                  style={[styles.modalTitle, { color: textColor }]}
                >
                  Select Branch
                </StyledText>
                <TouchableOpacity
                  onPress={() => setShowBranchModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color={textColor} />
                </TouchableOpacity>
              </View>
              {branches.length === 0 ? (
                <View style={styles.emptyState}>
                  <StyledText
                    variant="bodyMedium"
                    style={[styles.emptyStateText, { color: textColor }]}
                  >
                    No branches available. Please create a branch first.
                  </StyledText>
                </View>
              ) : (
                <FlatList
                  data={branches}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.branchItem,
                        selectedBranchId === item.id && {
                          backgroundColor: primaryColor + "20",
                        },
                        { borderBottomColor: borderColor },
                      ]}
                      onPress={() => handleBranchSelect(item.id)}
                    >
                      <StyledText
                        variant="bodyMedium"
                        style={[
                          styles.branchItemText,
                          {
                            color:
                              selectedBranchId === item.id
                                ? primaryColor
                                : textColor,
                            fontWeight:
                              selectedBranchId === item.id ? "600" : "400",
                          },
                        ]}
                      >
                        {item.name}
                      </StyledText>
                      {selectedBranchId === item.id && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={primaryColor}
                        />
                      )}
                    </TouchableOpacity>
                  )}
                  style={styles.branchList}
                />
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <View
          style={[
            styles.inviteHint,
            { backgroundColor: primaryColor + "12", borderColor: primaryColor + "40" },
          ]}
        >
          <Ionicons name="mail-outline" size={20} color={primaryColor} />
          <StyledText
            variant="bodySmall"
            style={{ color: textColor, flex: 1 }}
          >
            They'll get an email to set their own password and complete
            registration. You don't choose a password for them.
          </StyledText>
        </View>

        {/* Submit Button */}
        {limitsReached.admins && (
          <View style={styles.limitWarning}>
            <Ionicons name="warning-outline" size={20} color={textColor} />
            <StyledText
              variant="bodySmall"
              style={{ color: textColor, flex: 1 }}
            >
              Admin limit reached. Please upgrade your subscription to add more
              admins.
            </StyledText>
          </View>
        )}
        <StyledButton
          title="Send invitation"
          onPress={handleSubmit}
          isLoading={isLoading}
          disabled={limitsReached.admins}
        />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default CreateBranchAdminScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
  },
  form: {
    padding: 16,
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontWeight: "600",
  },
  input: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  branchSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  branchSelectorText: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxHeight: "70%",
    borderRadius: 12,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  modalTitle: {
    fontWeight: "600",
  },
  modalCloseButton: {
    padding: 4,
  },
  branchList: {
    maxHeight: 400,
  },
  branchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  branchItemText: {
    flex: 1,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
  },
  emptyStateText: {
    textAlign: "center",
  },
  inviteHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  limitWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 193, 7, 0.3)",
  },
});
