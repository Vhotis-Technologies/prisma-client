/**
 * Settings Screen – unified design
 *
 * - Profile summary at top (avatar, name, email, Edit profile) – no subscription
 * - Preferences: notifications, language, theme
 * - Account: Manage subscription (fleet or consumer plans), Help & support
 * - Logout at bottom
 */

import React, { useState, useEffect } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useThemeContext } from "@/app/contexts/ThemeProvider";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import SettingItem from "@/app/components/settings/SettingItem";
import SettingLink from "@/app/components/settings/SettingLink";
import ReferralCodeCard from "@/app/components/profile/ReferralCodeCard";
import StyledText from "@/app/components/helpers/StyledText";
import useProfile from "@/app/app-hooks/useProfile";
import { usePermissions } from "@/app/app-hooks/usePermissions";
import { useAuthContext } from "@/app/contexts/AuthContextProvider";
import { Avatar, Snackbar } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StyledButton from "@/app/components/helpers/StyledButton";
import { canAccessBulkInvoices } from "@/app/utils/bulkInvoiceAccess";

const SettingScreen = () => {
  const { theme, setTheme } = useThemeContext();
  const { handleLogout } = useAuthContext();
  const {
    userProfile,
    updatePushNotificationSetting,
    updateEmailNotificationSetting,
    updateMarketingEmailSetting,
    isLoadingUpdatePushNotificationToken,
    isLoadingUpdateEmailNotificationToken,
    isLoadingUpdateMarketingEmailToken,
  } = useProfile();

  const {
    toggleNotificationPermission,
    toggleLocationPermission,
    permissionStatus,
  } = usePermissions();

  const [emailNotifications, setEmailNotifications] = useState(
    !!userProfile?.email_notification_token,
  );
  const [pushNotifications, setPushNotifications] = useState(
    !!(
      userProfile?.push_notification_token &&
      permissionStatus.notifications.granted
    ),
  );
  const [marketingNotifications, setMarketingNotifications] = useState(
    !!userProfile?.marketing_email_token,
  );
  const [locationServices, setLocationServices] = useState(
    permissionStatus.location.granted,
  );
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  useEffect(() => {
    if (userProfile) {
      setEmailNotifications(!!userProfile.email_notification_token);
      setPushNotifications(
        !!(
          userProfile.push_notification_token &&
          permissionStatus.notifications.granted
        ),
      );
      setMarketingNotifications(!!userProfile.marketing_email_token);
    }
  }, [userProfile, permissionStatus.notifications.granted]);

  useEffect(() => {
    setLocationServices(permissionStatus.location.granted);
  }, [permissionStatus.location.granted]);

  const handleNotificationToggle = async (type: string, value: boolean) => {
    switch (type) {
      case "email":
        setEmailNotifications(value);
        break;
      case "push":
        setPushNotifications(value);
        break;
      case "marketing":
        setMarketingNotifications(value);
        break;
    }

    let success = false;
    switch (type) {
      case "email":
        success = await updateEmailNotificationSetting(value);
        break;
      case "push":
        if (value) {
          const permissionGranted = await toggleNotificationPermission(true);
          if (permissionGranted) {
            success = await updatePushNotificationSetting(true);
            setSnackbarMessage("Push notifications enabled.");
          } else {
            success = false;
            setSnackbarMessage(
              permissionStatus.notifications.canAskAgain
                ? "Permission denied. Try again or enable in device settings."
                : "Enable notifications in device settings.",
            );
          }
        } else {
          success = await updatePushNotificationSetting(false);
          setSnackbarMessage("Push notifications disabled.");
        }
        break;
      case "marketing":
        success = await updateMarketingEmailSetting(value);
        break;
    }

    if (!success) {
      switch (type) {
        case "email":
          setEmailNotifications(!value);
          setSnackbarMessage("Failed to update email notifications.");
          break;
        case "push":
          setPushNotifications(!value);
          setSnackbarMessage("Failed to update push notifications.");
          break;
        case "marketing":
          setMarketingNotifications(!value);
          setSnackbarMessage("Failed to update marketing preference.");
          break;
      }
    } else {
      if (type === "email") {
        setSnackbarMessage(
          value ? "Email notifications on." : "Email notifications off.",
        );
      } else if (type === "marketing") {
        setSnackbarMessage(
          value ? "Marketing emails on." : "Marketing emails off.",
        );
      }
    }
    setSnackbarVisible(true);
  };

  const handleThemeToggle = (type: string, value: boolean) => {
    if (value) setTheme(type as "light" | "dark" | "system");
  };

  const handleGeneralToggle = async (type: string, value: boolean) => {
    if (type === "location") {
      if (value) {
        const success = await toggleLocationPermission(true);
        setSnackbarMessage(
          success ? "Location enabled." : "Failed to enable location.",
        );
      } else {
        await toggleLocationPermission(false);
        setSnackbarMessage("Disable location in device settings.");
      }
      setSnackbarVisible(true);
    }
  };

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const tintColor = useThemeColor({}, "tint");
  const sectionLabelColor = useThemeColor({}, "text");
  const isFleetOwner = userProfile?.is_fleet_owner === true;
  const isPartner = userProfile?.is_dealership === true;
  const isBranchAdmin = userProfile?.is_branch_admin === true;
  const showBulkInvoices = canAccessBulkInvoices(userProfile);
  const showBusinessName = isFleetOwner || isPartner;
  const canEditProfile = !isBranchAdmin;

  const loyaltyTierLabel = userProfile?.loyalty_tier
    ? `${userProfile.loyalty_tier.charAt(0).toUpperCase()}${userProfile.loyalty_tier.slice(1).toLowerCase()}`
    : null;
  const loyaltyBenefits = userProfile?.loyalty_benefits;
  const loyaltySummaryParts: string[] = [];
  if (loyaltyBenefits != null && loyaltyBenefits.discount > 0) {
    loyaltySummaryParts.push(`${loyaltyBenefits.discount}% off eligible bookings`);
  }
  if (loyaltyBenefits?.free_service && loyaltyBenefits.free_service.length > 0) {
    loyaltySummaryParts.push(loyaltyBenefits.free_service.join(", "));
  }
  const loyaltySummary =
    loyaltySummaryParts.length > 0 ? loyaltySummaryParts.join(" · ") : null;
  const showLoyaltyPreview =
    Boolean(loyaltyTierLabel) || Boolean(loyaltySummary);

  // import the insets
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor}]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 50 }]}
      >
        {/* Profile summary – no subscription here */}
        <Pressable
          style={[
            styles.profileBlock,
            { borderColor },
          ]}
          onPress={() =>
            canEditProfile && router.push("/main/settings/ProfileUpdateScreen")
          }
          disabled={!canEditProfile}
        >
          <View style={styles.profileInfo}>
            <StyledText
              variant="titleMedium"
              style={{ color: textColor }}
              numberOfLines={1}
            >
              {userProfile?.name ?? "—"}
            </StyledText>
            {showBusinessName && !!userProfile?.business_name && (
              <StyledText
                variant="labelMedium"
                style={[styles.businessName, { color: primaryColor }]}
                numberOfLines={1}
              >
                {userProfile.business_name}
              </StyledText>
            )}
            <StyledText
              variant="bodySmall"
              style={[styles.email, { color: textColor }]}
              numberOfLines={1}
            >
              {userProfile?.email ?? "—"}
            </StyledText>
            {showLoyaltyPreview ? (
              <View
                style={[styles.loyaltySection, { borderTopColor: borderColor }]}
              >
                <StyledText
                  variant="labelSmall"
                  style={[styles.loyaltySectionLabel, { color: textColor }]}
                >
                  Loyalty
                </StyledText>
                {loyaltyTierLabel ? (
                  <StyledText
                    variant="bodySmall"
                    style={[styles.loyaltyTierLine, { color: primaryColor }]}
                    numberOfLines={1}
                  >
                    {loyaltyTierLabel} tier
                  </StyledText>
                ) : null}
                {loyaltySummary ? (
                  <StyledText
                    variant="bodySmall"
                    style={[styles.loyaltyBenefitsLine, { color: textColor }]}
                    numberOfLines={3}
                  >
                    {loyaltySummary}
                  </StyledText>
                ) : null}
              </View>
            ) : null}
          </View>
          {canEditProfile && (
            <View style={styles.editRow}>
              <StyledText variant="labelMedium" style={{ color: primaryColor }}>
                Edit
              </StyledText>
              <Ionicons name="chevron-forward" size={18} color={primaryColor} />
            </View>
          )}
        </Pressable>

        {/* Referral code – show whenever user has a referral code */}
        {(userProfile?.referral_code || userProfile?.partner_referral_code) && (
          <ReferralCodeCard
            referral={
              userProfile?.referral_code ||
              userProfile?.partner_referral_code ||
              ""
            }
          />
        )}

        {/* Preferences */}
        <StyledText
          variant="labelSmall"
          style={[styles.sectionHeader, { color: sectionLabelColor }]}
        >
          PREFERENCES
        </StyledText>
        <View
          style={[
            styles.sectionCard,
            { borderColor },
          ]}
        >
          <SettingItem
            title="Email notifications"
            description="Updates and alerts via email"
            value={emailNotifications}
            onValueChange={(v) => handleNotificationToggle("email", v)}
            disabled={isLoadingUpdateEmailNotificationToken}
          />
          <SettingItem
            title="Push notifications"
            description="Instant alerts on your device"
            value={pushNotifications}
            onValueChange={(v) => handleNotificationToggle("push", v)}
            disabled={isLoadingUpdatePushNotificationToken}
          />
          <SettingItem
            title="Marketing communications"
            description="Promotions and offers"
            value={marketingNotifications}
            onValueChange={(v) => handleNotificationToggle("marketing", v)}
            disabled={isLoadingUpdateMarketingEmailToken}
          />
          <SettingLink
            title="Language"
            description="English"
            onPress={() => {}}
          />
          <View style={[styles.themeRow, { borderBottomColor: borderColor }]}>
            <View style={styles.themeLabels}>
              <StyledText variant="labelLarge" style={{ color: textColor }}>
                Theme
              </StyledText>
              <StyledText
                variant="bodySmall"
                style={{ color: textColor, opacity: 0.8 }}
              >
                {theme === "dark"
                  ? "Dark"
                  : theme === "light"
                    ? "Light"
                    : "System"}
              </StyledText>
            </View>
            <View style={styles.themeSegments}>
              <TouchableOpacity
                style={[
                  styles.segment,
                  theme === "dark" && { backgroundColor: primaryColor },
                  { borderColor },
                ]}
                onPress={() => handleThemeToggle("dark", true)}
              >
                <StyledText
                  variant="labelSmall"
                  style={{ color: theme === "dark" ? "#fff" : textColor }}
                >
                  Dark
                </StyledText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segment,
                  theme === "light" && { backgroundColor: primaryColor },
                  { borderColor },
                ]}
                onPress={() => handleThemeToggle("light", true)}
              >
                <StyledText
                  variant="labelSmall"
                  style={{ color: theme === "light" ? "#fff" : textColor }}
                >
                  Light
                </StyledText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segment,
                  theme === "system" && { backgroundColor: primaryColor },
                  { borderColor },
                ]}
                onPress={() => handleThemeToggle("system", true)}
              >
                <StyledText
                  variant="labelSmall"
                  style={{ color: theme === "system" ? "#fff" : textColor }}
                >
                  System
                </StyledText>
              </TouchableOpacity>
            </View>
          </View>
          <SettingItem
            title="Location services"
            description="Use your location for the app"
            value={locationServices}
            onValueChange={(v) => handleGeneralToggle("location", v)}
          />
        </View>

        {/* Account */}
        <StyledText
          variant="labelSmall"
          style={[styles.sectionHeader, { color: sectionLabelColor }]}
        >
          ACCOUNT
        </StyledText>
        <View
          style={[
            styles.sectionCard,
            { borderColor },
          ]}
        >
          <SettingLink
            title="Manage addresses"
            description="View, add or edit your addresses"
            onPress={() => router.push("/main/settings/ManageAddressesScreen")}
          />
          {showBulkInvoices && (
            <SettingLink
              title="Invoices"
              description="View paid and unpaid bulk invoices"
              onPress={() =>
                router.push("/main/settings/InvoicesScreen" as const)
              }
            />
          )}
          {isFleetOwner ? (
            <SettingLink
              title="Manage subscription"
              description="View or change your fleet plan"
              onPress={() =>
                router.push("/main/settings/SubscriptionPlanScreen" as any)
              }
            />
          ) : (
            <SettingLink
              title="Manage subscription"
              description="View or change your Prisma subscription"
              onPress={() =>
                router.push("/main/settings/SubscriptionPlanScreen" as any)
              }
            />
          )}
          <SettingLink
            title="Help & support"
            description="Create a ticket or view existing ones"
            onPress={() => router.push("/main/settings/HelpSupportScreen")}
          />
        </View>

        {/* Payments */}
        <StyledText
          variant="labelSmall"
          style={[styles.sectionHeader, { color: sectionLabelColor }]}
        >
          PAYMENTS
        </StyledText>
        <View
          style={[
            styles.sectionCard,
            { borderColor },
          ]}
        >
          <SettingLink
            title="Manage payments"
            description="Manage cards and payment methods"
            onPress={() => router.push("/main/settings/ManagePaymentsScreen")}
          />
          <SettingLink
            title="Buy a voucher"
            description="Send credit to family or friends"
            onPress={() =>
              router.push("/main/settings/GiftVoucherScreen" as any)
            }
          />
        </View>

        {/* Logout */}

        <StyledButton
          title="Log out"
          onPress={handleLogout}
          variant="tonal"
        />
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

export default SettingScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
  },
  profileBlock: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  email: {
    opacity: 0.8,
    marginTop: 2,
  },
  businessName: {
    marginTop: 2,
  },
  loyaltySection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  loyaltySectionLabel: {
    letterSpacing: 0.6,
    opacity: 0.75,
    textTransform: "uppercase",
  },
  loyaltyTierLine: {
    fontWeight: "600",
  },
  loyaltyBenefitsLine: {
    opacity: 0.9,
    lineHeight: 18,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionHeader: {
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  sectionCard: {
    borderRadius: 5,
    borderWidth: 0.5,
    marginBottom: 24,
    overflow: "hidden",
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  themeLabels: {
    flex: 1,
    marginRight: 16,
  },
  themeSegments: {
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 0.5,
  },
});
