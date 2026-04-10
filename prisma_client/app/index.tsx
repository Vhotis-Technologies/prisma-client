/**
 * App entry / welcome screen: redirect to main or onboarding based on auth. Shows welcome UI when not authenticated.
 */
import React, { useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Image,
  Dimensions,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import StyledButton from "./components/helpers/StyledButton";
import StyledText from "./components/helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import Constants from "expo-constants";

const { width, height } = Dimensions.get("window");

export default function WelcomeScreen() {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");


  const benefits = [
    {
      icon: "car-outline",
      title: "Professional Car Wash",
      description:
        "Get your car professionally cleaned by trained detailers using premium products and equipment",
    },
    {
      icon: "time-outline",
      title: "Convenient Booking",
      description:
        "Book your car wash service in minutes with our easy-to-use scheduling system",
    },
    {
      icon: "location-outline",
      title: "Mobile Service",
      description:
        "Our detailers come to your location - no need to drive anywhere or wait in line",
    },
    {
      icon: "shield-checkmark-outline",
      title: "Quality Guaranteed",
      description:
        "Every service is backed by our satisfaction guarantee - your car will look amazing",
    },
  ];

  const services = [
    {
      icon: "water-outline",
      title: "Exterior Wash",
      description:
        "Complete exterior cleaning with premium soap and microfiber towels",
    },
    {
      icon: "brush-outline",
      title: "Interior Detail",
      description:
        "Thorough interior cleaning including vacuuming and surface treatment",
    },
    {
      icon: "sparkles-outline",
      title: "Premium Detail",
      description:
        "Full-service detail including waxing, polishing, and deep cleaning",
    },
  ];

  const fleetFeatures = [
    {
      icon: "images-outline",
      title: "Track Service Images",
      description:
        "View before/after photos for every service. Fleets can access and download images for each vehicle and booking.",
    },
    {
      icon: "business-outline",
      title: "Fleet Dashboard & Branches",
      description:
        "Manage multiple branches, track spend, booking activity, and vehicle health scores in one place.",
    },
    {
      icon: "document-text-outline",
      title: "Vehicle History & Reports",
      description:
        "Detailed vehicle history, inspections, and reports. Unlock full history and before/after images with a fleet subscription.",
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={[backgroundColor, borderColor]}
            style={styles.heroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.heroContent}>
              <View style={styles.logoContainer}>
                <StyledText variant="displaySmall" style={{ fontWeight: "bold" }}>Prisma Car Care</StyledText>
                <StyledText variant="bodyMedium" style={{ fontSize: 12 }}>
                  Professional Car Care at Your Doorstep
                </StyledText>
              </View>

              <StyledText variant="titleLarge">
                Your Car Deserves the Best
              </StyledText>

              <StyledText variant="bodyMedium">
                Book professional car wash services and let our expert detailers
                make your vehicle shine like new.
              </StyledText>

              <View style={styles.heroButtons}>
                <StyledButton
                  variant="small"
                  onPress={() => router.push("/onboarding/OnboardingScreen")}
                  style={styles.secondaryButton}
                  title="Join Us"
                />
                <StyledButton
                  variant="small"
                  onPress={() => router.push("/onboarding/SigninScreen")}
                  style={styles.primaryButton}
                  title="Sign In"
                />
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Benefits Section */}
        <View style={styles.featuresSection}>
          <StyledText style={[styles.sectionTitle, { color: textColor }]}>
            Why Choose Prisma Car Care?
          </StyledText>

          <StyledText style={[styles.sectionSubtitle, { color: textColor }]}>
            Experience the difference with our professional mobile car wash
            service
          </StyledText>

          <View style={styles.featuresGrid}>
            {benefits.map((benefit, index) => (
              <View
                key={index} 
                style={[
                  styles.featureCard,
                  {
                    backgroundColor: cardColor,
                    borderColor: borderColor,
                  },
                ]}
              >
                <View style={styles.featureIcon}>
                  <Ionicons
                    name={benefit.icon as any}
                    size={32}
                    color="#1e3c72"
                  />
                </View>

                <StyledText style={[styles.featureTitle, { color: textColor }]}>
                  {benefit.title}
                </StyledText>

                <StyledText
                  style={[styles.featureDescription, { color: textColor }]}
                >
                  {benefit.description}
                </StyledText>
              </View>
            ))}
          </View>
        </View>

        {/* Services Section */}
        <View style={styles.servicesSection}>
          <StyledText style={[styles.sectionTitle, { color: textColor }]}>
            Our Services
          </StyledText>

          <StyledText style={[styles.sectionSubtitle, { color: textColor }]}>
            Choose the perfect service for your car's needs
          </StyledText>

          <View style={styles.servicesGrid}>
            {services.map((service, index) => (
              <View
                key={index}
                style={[
                  styles.serviceCard,
                  {
                    backgroundColor: cardColor,
                    borderColor: borderColor,
                  },
                ]}
              >
                <View style={styles.serviceIcon}>
                  <Ionicons
                    name={service.icon as any}
                    size={28}
                    color="#1e3c72"
                  />
                </View>

                <StyledText style={[styles.serviceTitle, { color: textColor }]}>
                  {service.title}
                </StyledText>

                <StyledText
                  style={[styles.serviceDescription, { color: textColor }]}
                >
                  {service.description}
                </StyledText>
              </View>
            ))}
          </View>
        </View>

        {/* For Fleets & Businesses Section */}
        <View style={styles.fleetSection}>
          <StyledText style={[styles.sectionTitle, { color: textColor }]}>
            For Fleets & Businesses
          </StyledText>

          <StyledText style={[styles.sectionSubtitle, { color: textColor }]}>
            Track every vehicle, service, and image across your branches
          </StyledText>

          <View style={styles.fleetGrid}>
            {fleetFeatures.map((feature, index) => (
              <View
                key={index}
                style={[
                  styles.fleetCard,
                  {
                    backgroundColor: cardColor,
                    borderColor: borderColor,
                  },
                ]}
              >
                <View style={styles.fleetIcon}>
                  <Ionicons
                    name={feature.icon as any}
                    size={28}
                    color="#1e3c72"
                  />
                </View>

                <View style={styles.fleetTextContainer}>
                  <StyledText style={[styles.fleetTitle, { color: textColor }]}>
                    {feature.title}
                  </StyledText>

                  <StyledText
                    style={[styles.fleetDescription, { color: textColor }]}
                  >
                    {feature.description}
                  </StyledText>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* How It Works Section */}
        <View style={styles.howItWorksSection}>
          <StyledText style={[styles.sectionTitle, { color: textColor }]}>
            How It Works
          </StyledText>

          <View style={styles.stepsContainer}>
            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: "#1e3c72" }]}>
                <StyledText variant="titleMedium">1</StyledText>
              </View>
              <View style={styles.stepContent}>
                <StyledText style={[styles.stepTitle, { color: textColor }]}>
                  Book Your Service
                </StyledText>
                <StyledText
                  style={[styles.stepDescription, { color: textColor }]}
                >
                  Choose your service and schedule a convenient time for your
                  car wash
                </StyledText>
              </View>
            </View>

            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: "#1e3c72" }]}>
                <StyledText variant="titleMedium">2</StyledText>
              </View>
              <View style={styles.stepContent}>
                <StyledText style={[styles.stepTitle, { color: textColor }]}>
                  Expert Detailer Arrives
                </StyledText>
                <StyledText
                  style={[styles.stepDescription, { color: textColor }]}
                >
                  Our professional detailer comes to your location with all
                  necessary equipment
                </StyledText>
              </View>
            </View>

            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: "#1e3c72" }]}>
                <StyledText variant="titleMedium">3</StyledText>
              </View>
              <View style={styles.stepContent}>
                <StyledText style={[styles.stepTitle, { color: textColor }]}>
                  Enjoy Your Clean Car
                </StyledText>
                <StyledText
                  style={[styles.stepDescription, { color: textColor }]}
                >
                  Your car is professionally cleaned and ready to impress
                </StyledText>
              </View>
            </View>
          </View>
        </View>

        {/* CTA Section - Vehicle History (VIN Lookup) */}
        <View
          style={[
            styles.ctaSection,
            { backgroundColor: cardColor, borderColor: borderColor },
          ]}
        >
          <StyledText variant="titleMedium">
            Look Up Vehicle History by VIN
          </StyledText>

          <StyledText variant="bodySmall">
            Enter a 17-character VIN to see ownership history, service records,
            incidents, recalls, and more. Available for any car.
          </StyledText>

          <StyledButton
            variant="medium"
            onPress={() => router.push("/vehiclehistory/VehicleDataInputScreen")}
            title="Look Up Vehicle History"
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <StyledText style={[styles.footerText, { color: textColor }]}>
            Already have an account?{" "}
            <StyledText
              style={[styles.linkText, { color: "#1e3c72" }]}
              onPress={() => router.push("/onboarding/SigninScreen")}
            >
              Sign In
            </StyledText>
          </StyledText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroSection: {
    height: height * 0.7,
    alignItems: "center",
    justifyContent: "center",
    alignContent: "center",

  },
  heroGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  heroContent: {
    alignItems: "center",
    maxWidth: 400,
    gap: 10,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
    gap: 5,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32,
  },
  appName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 32,
    opacity: 0.9,
    lineHeight: 26,
  },
  heroButtons: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 20,
    alignItems: "center",
  },
  primaryButton: {
    minWidth: 140,
  },
  secondaryButton: {
    minWidth: 140,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  featuresSection: {
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  servicesSection: {
    paddingHorizontal: 5,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 48,
    opacity: 0.7,
    lineHeight: 24,
  },
  featuresGrid: {
    gap: 24,
  },
  featureCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    textAlign: "center",
  },
  featureIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  featureDescription: {
    fontSize: 14,
    textAlign: "center",
    opacity: 0.7,
    lineHeight: 20,
  },
  servicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  serviceCard: {
    flexGrow: 1,
    width: (width - 80) / 3,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    textAlign: "center",
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    textAlign: "center",
  },
  serviceDescription: {
    fontSize: 12,
    textAlign: "center",
    opacity: 0.7,
    lineHeight: 16,
  },
  fleetSection: {
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  fleetGrid: {
    gap: 20,
  },
  fleetCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  fleetIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  fleetTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  fleetTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  fleetDescription: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
  },
  howItWorksSection: {
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  stepsContainer: {
    gap: 32,
    marginTop: 32,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  stepNumber: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  stepNumberText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 20,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
  },
  ctaSection: {
    margin: 10,
    padding: 32,
    borderRadius: 10,
    alignItems: "center",
    gap: 15,
  },
  footer: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    opacity: 0.6,
  },
  linkText: {
    fontWeight: "bold",
    textDecorationLine: "underline",
  },
});