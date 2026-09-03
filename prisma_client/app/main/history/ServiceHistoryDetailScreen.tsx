import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useFetchBookingImagesQuery } from "@/app/store/api/serviceHistoryApi";
import ServiceImageGalleryTab from "@/app/components/profile/ServiceImageGalleryTab";
import InspectionDataModal from "@/app/components/profile/InspectionDataModal";
import { useAlertContext } from "@/app/contexts/AlertContext";
import { useModalService } from "@/app/contexts/ModalServiceProvider";
import StyledButton from "@/app/components/helpers/StyledButton";

type TabType = "before-interior" | "before-exterior" | "after-interior" | "after-exterior";

const ServiceHistoryDetailScreen = () => {
  const params = useLocalSearchParams();
  const bookingId = params.bookingId as string;
  const [activeTab, setActiveTab] = useState<TabType>("before-interior");
  const { setAlertConfig } = useAlertContext();
  const { showCenterModal, showFullscreenModal } = useModalService();

  const handleViewInspection = () => {
    if (bookingId) {
      showFullscreenModal(
        <InspectionDataModal bookingId={bookingId} />,
        "Inspection"
      );
    }
  };

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icons");
  const primaryColor = useThemeColor({}, "primary");

  const {
    data: imagesData,
    isLoading,
    isError,
  } = useFetchBookingImagesQuery(
    { booking_id: bookingId },
    { skip: !bookingId }
  );

  const bookingReference = imagesData?.booking_reference;

  // Show AlertModal when subscription access is denied
  useEffect(() => {
    if (imagesData?.access_denied) {
      setAlertConfig({
        isVisible: true,
        title: "Subscription Required",
        message:
          imagesData?.message ||
          "Detailed vehicle information is only available with an active fleet subscription.",
        type: "warning",
        onClose: () => {
          setAlertConfig({ isVisible: false, title: "", message: "", type: "error" });
        },
      });
    }
  }, [imagesData?.access_denied, imagesData?.message, setAlertConfig]);

  const tabs: Array<{ id: TabType; label: string }> = [
    { id: "before-interior", label: "Before - Interior" },
    { id: "after-interior", label: "After - Interior" },
    { id: "before-exterior", label: "Before - Exterior" },
    { id: "after-exterior", label: "After - Exterior" },
  ];

  const getTabImages = (tabId: TabType) => {
    if (!imagesData) return [];
    switch (tabId) {
      case "before-interior":
        return imagesData.before_images_interior || [];
      case "before-exterior":
        return imagesData.before_images_exterior || [];
      case "after-interior":
        return imagesData.after_images_interior || [];
      case "after-exterior":
        return imagesData.after_images_exterior || [];
      default:
        return [];
      }
    };

    const activeTabImages = getTabImages(activeTab);

    if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleViewInspection}
            style={[styles.viewInspectionButton, { backgroundColor: primaryColor }]}
          >
            <StyledText variant="labelLarge" style={styles.viewInspectionButtonText}>
              View Inspection
            </StyledText>
          </TouchableOpacity>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <StyledText
            variant="bodyMedium"
            style={[styles.loadingText, { color: textColor }]}
          >
            Loading images...
          </StyledText>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleViewInspection}
            style={[styles.viewInspectionButton, { backgroundColor: primaryColor }]}
          >
            <StyledText variant="labelLarge" style={styles.viewInspectionButtonText}>
              View Inspection
            </StyledText>
          </TouchableOpacity>
          <View style={styles.backButton} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <StyledText
            variant="titleMedium"
            style={[styles.errorTitle, { color: textColor }]}
          >
            Failed to Load Images
          </StyledText>
          <StyledText
            variant="bodyMedium"
            style={[styles.errorText, { color: textColor }]}
          >
            We couldn’t load these photos. Please try again.
          </StyledText>
        </View>
      </View>
    );
  }

  if (imagesData?.access_denied) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <StyledButton
            title="View Inspection"
            onPress={handleViewInspection}
            style={styles.viewInspectionButton}
            variant="tonal"
          />
          <View style={styles.backButton} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={iconColor} />
          <StyledText
            variant="titleMedium"
            style={[styles.errorTitle, { color: textColor }]}
          >
            Access Restricted
          </StyledText>
          <StyledText
            variant="bodyMedium"
            style={[styles.errorText, { color: textColor }]}
          >
            {imagesData?.message ||
              "Detailed vehicle information is only available with an active fleet subscription."}
          </StyledText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <StyledButton
          title="View Inspection"
          onPress={handleViewInspection}
          style={styles.viewInspectionButton}
          variant="small"
        />
        <View style={styles.backButton} />
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsContainer, { borderBottomColor: borderColor }]}
        contentContainerStyle={styles.tabsContent}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const tabImages = getTabImages(tab.id);
          const hasImages = tabImages.length > 0;

          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.6}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? primaryColor : "transparent",
                  borderColor: isActive ? primaryColor : borderColor,
                  borderWidth: 1.5,
                },
                isActive && styles.tabActive,
              ]}
            >
              <StyledText
                variant="labelSmall"
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? "#FFFFFF" : textColor,
                  },
                  isActive && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </StyledText>
              {hasImages && (
                <View
                  style={[
                    styles.tabBadge,
                    {
                      backgroundColor: isActive
                        ? "rgba(255,255,255,0.35)"
                        : primaryColor,
                    },
                  ]}
                >
                  <StyledText variant="bodySmall" style={styles.tabBadgeText}>
                    {tabImages.length}
                  </StyledText>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        <ServiceImageGalleryTab
          images={activeTabImages}
          bookingReference={bookingReference}
        />
      </View>
    </View>
  );
};

export default ServiceHistoryDetailScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  viewInspectionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 200,
    alignSelf: "center",
  },
  viewInspectionButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  tabsContainer: {
    borderBottomWidth: 1,
    maxHeight: 50,
    paddingVertical: 8,
  },
  tabsContent: {
    paddingHorizontal: 5,
    alignItems: "center",
    flexDirection: "row",
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
    minWidth: 130,
  },
  tabActive: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  tabLabel: {
    fontWeight: "500",
    fontSize: 12,
  },
  tabLabelActive: {
    fontWeight: "600",
  },
  tabBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  tabContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 16,
  },
  errorTitle: {
    fontWeight: "600",
    marginTop: 8,
  },
  errorText: {
    textAlign: "center",
    opacity: 0.7,
  },
});
