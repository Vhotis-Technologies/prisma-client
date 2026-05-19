import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledTextInput from "../helpers/StyledTextInput";
import StyledButton from "../helpers/StyledButton";
import { Ionicons } from "@expo/vector-icons";
import { useModalService } from "@/app/contexts/ModalServiceProvider";
import {
  CreateTicketPayload,
  TICKET_ISSUE_TYPES,
} from "@/app/interfaces/SupportInterfaces";

interface CreateTicketModalProps {
  onSubmit?: (payload: CreateTicketPayload) => void | Promise<void>;
}

const CreateTicketModal: React.FC<CreateTicketModalProps> = ({
  onSubmit,
}) => {
  const { closeModal } = useModalService();
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  const cardsColor = useThemeColor({}, "cards");
  const primaryColor = useThemeColor({}, "primary");
  const errorColor = useThemeColor({}, "error");

  const [issueTypeExpanded, setIssueTypeExpanded] = useState(false);
  const [selectedIssueType, setSelectedIssueType] = useState<string>("");
  const [bookingReference, setBookingReference] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleCancel = () => {
    closeModal();
  };

  const handleSelectIssueType = (value: string) => {
    setSelectedIssueType(value);
    setIssueTypeExpanded(false);
  };

  const handleSubmit = async () => {
    setErrorMessage("");
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setErrorMessage("Please describe your issue.");
      return;
    }
    if (!selectedIssueType) {
      setErrorMessage("Please select an issue type.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: CreateTicketPayload = {
        issueType: selectedIssueType,
        bookingReference: bookingReference.trim() || undefined,
        description: trimmedDesc,
      };
      await onSubmit?.(payload);
      closeModal();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create ticket."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedLabel =
    TICKET_ISSUE_TYPES.find((t) => t.value === selectedIssueType)?.label ||
    "Select issue type";

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Issue type dropdown */}
          <View
            style={[
              styles.dropdownCard,
              { backgroundColor: cardsColor, borderColor },
            ]}
          >
            <TouchableOpacity
              style={styles.dropdownHeader}
              onPress={() => setIssueTypeExpanded(!issueTypeExpanded)}
              activeOpacity={0.7}
            >
              <StyledText variant="labelLarge" style={{ color: textColor }}>
                {selectedLabel}
              </StyledText>
              <Ionicons
                name={issueTypeExpanded ? "chevron-up" : "chevron-down"}
                size={22}
                color={textColor}
              />
            </TouchableOpacity>
            {issueTypeExpanded && (
              <View style={[styles.dropdownList, { borderTopColor: borderColor }]}>
                {TICKET_ISSUE_TYPES.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.dropdownOption,
                      {
                        borderBottomColor: borderColor,
                        backgroundColor:
                          selectedIssueType === opt.value
                            ? primaryColor
                            : "transparent",
                      },
                    ]}
                    onPress={() => handleSelectIssueType(opt.value)}
                    activeOpacity={0.7}
                  >
                    <StyledText
                      variant="bodyMedium"
                      style={{
                        color:
                          selectedIssueType === opt.value ? "#fff" : textColor,
                      }}
                    >
                      {opt.label}
                    </StyledText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <StyledTextInput
            label="Booking reference (optional)"
            placeholder="e.g. REF-123 or BULK-456"
            value={bookingReference}
            onChangeText={setBookingReference}
            style={styles.input}
          />

          <StyledTextInput
            label="Describe your issue"
            placeholder="Please provide as much detail as possible."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={[styles.input, styles.textArea]}
          />

          {errorMessage ? (
            <StyledText
              variant="bodySmall"
              style={[styles.errorText, { color: errorColor }]}
            >
              {errorMessage}
            </StyledText>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: borderColor }]}>
          <StyledButton
            title="Cancel"
            variant="tonal"
            onPress={handleCancel}
            style={[styles.cancelButton, { borderColor }]}
          />
          <StyledButton
            title={isSubmitting ? "Submitting…" : "Submit"}
            variant="medium"
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={styles.submitButton}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

export default CreateTicketModal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
  },
  content: {
    flex: 1,
    paddingVertical: 8,
  },
  dropdownCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownList: {
    borderTopWidth: 1,
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  input: {
    marginBottom: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  errorText: {
    marginBottom: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  cancelButton: {
    borderWidth: 1,
    flex: 1,
  },
  submitButton: {
    flex: 1,
  },
});
