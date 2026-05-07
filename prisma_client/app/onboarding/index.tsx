/**
 * Onboarding entry: choose account persona before the registration form.
 */
import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  UIManager,
  LayoutAnimation,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../components/helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAppDispatch } from "../store/main_store";
import { setSignUpAccountType } from "../store/slices/authSlice";
import type { SignUpAccountType } from "../interfaces/AuthInterface";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const OPTIONS: {
  type: SignUpAccountType;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    type: "b2c",
    title: "Personal",
    subtitle: "Book washes for your own vehicles. No business details required.",
    icon: "person-outline",
  },
  {
    type: "fleet_operator",
    title: "Fleet operator",
    subtitle: "Manage fleets, branches, and vehicle servicing at scale.",
    icon: "car-sport-outline",
  },
  {
    type: "dealership",
    title: "Dealership",
    subtitle: "Dealership accounts with business profile, fleet tools, and partnership with Prisma Car Care.",
    icon: "storefront-outline",
  },
];

export default function OnboardingAccountTypeScreen() {
  const dispatch = useAppDispatch();
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const buttonColor = useThemeColor({}, "button");
  const iconColor = useThemeColor({}, "icons");
  const backgroundColor = useThemeColor({}, "background");

  const onSelect = (type: SignUpAccountType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    dispatch(setSignUpAccountType(type));
    router.push("/onboarding/OnboardingScreen");
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.content, { backgroundColor }]}>
        <StyledText
          style={[styles.title, { color: textColor }]}
          variant="headlineMedium"
        >
          Create account
        </StyledText>
        <StyledText
          style={[styles.subtitle, { color: textColor }]}
          variant="bodyMedium"
        >
          Choose how you will use Prisma. You can update support details later if
          anything changes.
        </StyledText>

        <View style={styles.cardList}>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.type}
              activeOpacity={0.85}
              onPress={() => onSelect(opt.type)}
              style={[
                styles.card,
                {
                  backgroundColor: cardColor,
                  borderColor,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Sign up as ${opt.title}`}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: `${buttonColor}22` },
                ]}
              >
                <Ionicons name={opt.icon} size={26} color={iconColor} />
              </View>
              <View style={styles.cardText}>
                <StyledText
                  style={[styles.cardTitle, { color: textColor }]}
                  variant="titleMedium"
                >
                  {opt.title}
                </StyledText>
                <StyledText
                  style={[styles.cardSubtitle, { color: textColor }]}
                  variant="bodySmall"
                >
                  {opt.subtitle}
                </StyledText>
              </View>
              <Ionicons name="chevron-forward" size={22} color={iconColor} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <StyledText style={[styles.footerText, { color: textColor }]}>
            Already have an account?{" "}
            <StyledText
              style={[styles.footerLink, { color: buttonColor }]}
              onPress={() => router.push("/onboarding/SigninScreen")}
            >
              Login
            </StyledText>
          </StyledText>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    opacity: 0.85,
    marginBottom: 28,
    lineHeight: 22,
  },
  cardList: {
    gap: 14,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardText: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },
  cardSubtitle: {
    opacity: 0.8,
    lineHeight: 18,
  },
  footer: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 16,
  },
  footerText: {
    fontSize: 13,
    textAlign: "center",
  },
  footerLink: {
    fontWeight: "600",
    fontSize: 13,
  },
});
