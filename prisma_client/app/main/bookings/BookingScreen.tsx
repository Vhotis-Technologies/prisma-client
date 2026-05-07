/**
 * Booking screen: multi-step flow for single-vehicle and bulk bookings.
 *
 * Steps (single): Vehicle → Service → Valet → Details (address, date, time, add-ons, special instructions) → Summary → Confirm.
 * Bulk: Service + vehicle count → Valet → Address + date + instructions → Check capacity → Choose window → Pay.
 * Uses useBooking (single) and useBulkBooking (bulk); payment via usePayment + eventApi (create_payment_sheet, confirm_payment_intent).
 * See docs/BOOKING_FLOW.md for the full flow.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { router } from "expo-router";
import { Stack } from "expo-router";

// Import booking components
import VehicleSelector from "@/app/components/booking/VehicleSelector";
import ServiceTypeCard from "@/app/components/booking/ServiceTypeCard";
import ValetTypeCard from "@/app/components/booking/ValetTypeCard";
import AddressSelector from "@/app/components/booking/AddressSelector";
import TimeSlotPicker from "@/app/components/booking/TimeSlotPicker";
import BookingSummary from "@/app/components/booking/BookingSummary";
import AddonSelection from "@/app/components/booking/AddonSelection";

// Import helpers
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import SquareCheckbox from "@/app/components/helpers/SquareCheckbox";
import CircleCheckbox from "@/app/components/helpers/CircleCheckbox";

// Import hooks
import useBooking from "@/app/app-hooks/useBooking";
import {
  useBulkBooking,
  type BulkCapacityOption,
} from "@/app/app-hooks/useBulkBooking";
import usePayment from "@/app/app-hooks/usePayment";
import { useAppSelector } from "@/app/store/main_store";
import type AuthState from "@/app/interfaces/AuthInterface";
import {
  useFetchPaymentSheetDetailsMutation,
  useConfirmPaymentIntentMutation,
  useCreateBulkOrderInvoiceLaterMutation,
  type ComplimentarySparkleSource,
} from "@/app/store/api/eventApi";

// Import modal
import AddAddressModal from "@/app/components/profile/AddAddressModal";
import { MyAddressProps } from "@/app/interfaces/ProfileInterfaces";
import StyledTextInput from "@/app/components/helpers/StyledTextInput";
import { useAddresses } from "@/app/app-hooks/useAddresses";
import useVehicles from "@/app/app-hooks/useVehicles";
import ModalServices from "@/app/utils/ModalServices";
import PromotionsCardComponent from "@/app/components/booking/PromotionsCard";
import { PromotionsProps } from "@/app/interfaces/GarageInterface";
import useProfile from "@/app/app-hooks/useProfile";
import BookingConfirmationModal from "@/app/components/booking/BookingConfirmationModal";
import BulkOrderConfirmationModal from "@/app/components/booking/BulkOrderConfirmationModal";
import { useAlertContext } from "@/app/contexts/AlertContext";
import dayjs from "dayjs";
import type { AddOnsProps } from "@/app/interfaces/BookingInterfaces";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatServiceStartDateForConsent(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const dismissAlert = (
  setAlertConfig: (c: {
    isVisible: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning";
  }) => void,
) =>
  setAlertConfig({ isVisible: false, title: "", message: "", type: "error" });

// Define step interface
interface BookingStep {
  id: number;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const BookingScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const primaryPurpleColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");
  const borderColor = useThemeColor({}, "borders");
  const buttonColor = useThemeColor({}, "button");

  const user = useAppSelector(
    (state) => (state as { auth: AuthState }).auth.user,
  );
  const isBulkEligible = Boolean(
    user?.is_fleet_owner ||
    user?.is_branch_admin ||
    user?.is_dealership ||
    user?.partner_referral_code,
  );
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkStep, setBulkStep] = useState(1);
  const [bulkPaymentOption, setBulkPaymentOption] = useState<
    "pay_now" | "pay_later"
  >("pay_now");
  const [isBulkInvoiceSubmitting, setIsBulkInvoiceSubmitting] = useState(false);
  const [isBulkAddonModalVisible, setIsBulkAddonModalVisible] = useState(false);
  const [bulkConfirmationPayload, setBulkConfirmationPayload] = useState<{
    bookingReference: string;
    invoiceSent: boolean;
    numberOfVehicles: number;
    date: string;
    startTime?: string;
    endTime?: string;
    serviceName: string;
    serviceDurationMinutes?: number;
    address?: {
      address?: string;
      city?: string;
      post_code?: string;
      country?: string;
    };
    totalAmount: number;
  } | null>(null);

  const { setAlertConfig } = useAlertContext();
  const bulk = useBulkBooking();
  const { openPaymentSheet, waitForPaymentConfirmation } = usePayment();
  const [fetchPaymentSheetDetails] = useFetchPaymentSheetDetailsMutation();
  const [confirmPaymentIntent] = useConfirmPaymentIntentMutation();
  const [createBulkOrderInvoiceLater] =
    useCreateBulkOrderInvoiceLaterMutation();

  /* Get the save new address hook and handle save address function to close the modal and save the address */
  const { saveNewAddress } = useProfile();
  const handleSaveAddress = useCallback(async () => {
    setIsAddressModalVisible(false);
    await saveNewAddress();
  }, [saveNewAddress]);

  const {
    // State
    selectedVehicle,
    selectedServiceType,
    selectedValetType,
    selectedAddress,
    selectedDate,
    specialInstructions,
    currentStep,
    isLoading,
    isSUV,
    isProcessingPayment,
    paymentConfirmationStatus,
    promotions,
    serverQuote,
    bookingQuoteLoading,
    complimentarySparkleSource,
    setComplimentarySparkleSource,
    applyPartnerBookingDiscount,
    setApplyPartnerBookingDiscount,

    // Addon management state
    selectedAddons,
    isAddonModalVisible,

    // Time slot management state
    availableTimeSlots,
    isLoadingSlots,
    currentMonth,
    selectedDay,

    // Data
    addOns,
    serviceTypes,
    valetTypes,
    isLoadingAddOns,
    isLoadingServiceTypes,
    isLoadingValetTypes,

    // Handlers
    handleVehicleSelection,
    handleSUVChange,
    handleServiceTypeSelection,
    handleValetTypeSelection,
    handleAddressSelection,
    handleDateChange,
    handleSpecialInstructionsChange,
    handleNextStep,
    handlePreviousStep,
    handleGoToStep,

    // Addon management handlers
    handleAddonSelection,
    handleAddonSelectionWithRefresh,
    handleCloseAddonModal,
    handleConfirmAddons,

    // Time slot management handlers
    handleTimeSlotSelect,
    handleSlotHoldExpired,
    selectedSlotAt,
    handleDaySelection,
    handleMonthNavigation,
    hasSelectedTimeSlot,

    // Validation
    isStepValid,
    canProceedToNextStep,
    canProceedToSummary,

    // Booking
    resetBooking,

    // Utilities
    getTotalPrice,
    getBasePrice,
    getSUVPrice,
    getExpressServicePrice,
    isExpressService,
    handleExpressServiceChange,
    getAddonPrice,
    getAddonDuration,
    getEstimatedDuration,
    formatPrice,
    formatDuration,
    handleBookingConfirmation,
    isLoadingBooking,

    // Loyalty-related methods
    getOriginalPrice,
    getFinalPrice,
    getLoyaltyDiscount,
    getPromotionDiscount,
    getPriceSummaryBreakdown,
    calculateFinalPrice,
    winnerVoucherApplied,
    winnerVoucherCode,
    setWinnerVoucherCode,
    applyWinnerVoucherCode,
    clearWinnerVoucher,
    getPayableTotal,

    // Confirmation modal state and handlers
    isConfirmationModalVisible,
    confirmationBookingData,
    confirmationBookingReference,
    handleCloseConfirmationModal,
    handleViewDashboard,
  } = useBooking();

  const { addresses } = useAddresses();
  const { vehicles } = useVehicles();

  const [showSpecialInstructions, setShowSpecialInstructions] = useState(false);
  const [isAddressModalVisible, setIsAddressModalVisible] = useState(false);
  const [coolingOffConsent, setCoolingOffConsent] = useState(false);
  const [bulkCoolingOffConsent, setBulkCoolingOffConsent] = useState(false);

  useEffect(() => {
    setCoolingOffConsent(false);
  }, [currentStep]);

  useEffect(() => {
    setBulkCoolingOffConsent(false);
  }, [bulkStep]);

  const insets = useSafeAreaInsets();

  /* This method is designed to handle how the bulkorder addon selection is handled */
  const handleBulkAddonSelect = useCallback(
    (addon: AddOnsProps) => {
      bulk.setSelectedAddons((prev) => {
        const isSelected = prev.some((a) => a.id === addon.id);
        if (isSelected) return prev.filter((a) => a.id !== addon.id);
        return [...prev, addon];
      });
    },
    [bulk],
  );

  const handleBulkAddonClose = useCallback(() => {
    setIsBulkAddonModalVisible(false);
    setBulkStep(3);
  }, []);

  const handleBulkAddonConfirm = useCallback(() => {
    setIsBulkAddonModalVisible(false);
    setBulkStep(3);
  }, []);

  const handleBulkConfirmationClose = useCallback(() => {
    setBulkConfirmationPayload(null);
    bulk.resetBulkBooking();
    setIsBulkMode(false);
    setBulkStep(1);
    setBulkPaymentOption("pay_now");
  }, [bulk]);

  const handleBulkConfirmationViewDashboard = useCallback(() => {
    setBulkConfirmationPayload(null);
    bulk.resetBulkBooking();
    setIsBulkMode(false);
    setBulkStep(1);
    setBulkPaymentOption("pay_now");
    router.push("/main/dashboard/DashboardScreen");
  }, [bulk]);

  // Handle add address based on user role
  const handleAddAddress = useCallback(() => {
    if (user?.is_fleet_owner) {
      // Fleet owners: Navigate to branch management screen
      router.push("/main/dashboard/BranchesListScreen");
    } else if (user?.is_branch_admin) {
      // Fleet admins: Cannot add addresses (only have their managed branch)
      // Button will be hidden via showAddButton prop
      return;
    } else {
      // Regular users: Open address modal
      setIsAddressModalVisible(true);
    }
  }, [user]);

  // Determine if add button should be shown
  const showAddButton = !user?.is_branch_admin;

  const steps: BookingStep[] = [
    { id: 1, title: "Vehicle", icon: "car" },
    { id: 2, title: "Service", icon: "construct" },
    { id: 3, title: "Valet", icon: "water" },
    { id: 4, title: "Details", icon: "calendar" },
    { id: 5, title: "Summary", icon: "checkmark-circle" },
  ];

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {steps.map((step, index) => (
        <View key={step.id} style={styles.stepContainer}>
          <Pressable
            style={[
              styles.stepButton,
              {
                backgroundColor:
                  currentStep >= step.id ? primaryPurpleColor : cardColor,
                borderColor: textColor,
              },
            ]}
            onPress={() => handleGoToStep(step.id)}
            disabled={!isStepValid(step.id) && step.id > currentStep}
          >
            <Ionicons name={step.icon} size={20} color={iconColor} />
          </Pressable>
          <StyledText
            variant="bodySmall"
            style={[
              styles.stepTitle,
              {
                color: currentStep >= step.id ? primaryPurpleColor : textColor,
                fontWeight: currentStep === step.id ? "600" : "400",
              },
            ]}
          >
            {step.title}
          </StyledText>
          {index < steps.length - 1 && (
            <View
              style={[
                styles.stepLine,
                {
                  backgroundColor:
                    currentStep > step.id ? primaryPurpleColor : "#E5E5E5",
                },
              ]}
            />
          )}
        </View>
      ))}
    </View>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <VehicleSelector
            vehicles={vehicles}
            selectedVehicle={selectedVehicle}
            onSelectVehicle={handleVehicleSelection}
            onAddVehicle={() => router.push("/main/garage/GarageScreen")}
            isSUV={isSUV}
            onSUVChange={handleSUVChange}
            isExpressService={isExpressService}
            onExpressServiceChange={handleExpressServiceChange}
          />
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <StyledText
              variant="titleMedium"
              style={[styles.stepHeader, { color: textColor }]}
            >
              Choose Service Type
            </StyledText>
            {serviceTypes?.map((service) => (
              <ServiceTypeCard
                key={service.id}
                service={service}
                isSelected={selectedServiceType?.id === service.id}
                onSelect={handleServiceTypeSelection}
              />
            ))}
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <StyledText
              variant="titleMedium"
              style={[styles.stepHeader, { color: textColor }]}
            >
              Choose Valet Type
            </StyledText>
            {valetTypes?.map((valetType) => (
              <ValetTypeCard
                key={valetType.id}
                valetType={valetType}
                isSelected={selectedValetType?.id === valetType.id}
                onSelect={handleValetTypeSelection}
              />
            ))}
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <AddressSelector
              addresses={addresses}
              selectedAddress={selectedAddress}
              onSelectAddress={handleAddressSelection}
              onAddAddress={handleAddAddress}
              showAddButton={showAddButton}
            />

            {selectedServiceType ? (
              <TimeSlotPicker
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                minimumDate={new Date()}
                serviceDuration={getEstimatedDuration()}
                serviceTypeName={selectedServiceType.name}
                availableTimeSlots={availableTimeSlots}
                isLoadingSlots={isLoadingSlots}
                currentMonth={currentMonth}
                selectedDay={selectedDay}
                onDaySelection={handleDaySelection}
                onMonthNavigation={handleMonthNavigation}
                onTimeSlotSelect={handleTimeSlotSelect}
                hasSelectedTimeSlot={hasSelectedTimeSlot()}
                selectedSlotAt={selectedSlotAt}
                onSlotHoldExpired={handleSlotHoldExpired}
              />
            ) : (
              <View style={[styles.infoCard, { backgroundColor: cardColor }]}>
                <StyledText
                  variant="bodyMedium"
                  style={[styles.infoText, { color: textColor }]}
                >
                  Please select a service type first to see available time slots
                </StyledText>
              </View>
            )}

            <View style={styles.specialInstructionsContainer}>
              <TouchableOpacity
                style={styles.specialInstructionsHeader}
                onPress={() =>
                  setShowSpecialInstructions(!showSpecialInstructions)
                }
              >
                <StyledText
                  variant="titleMedium"
                  style={[styles.stepHeader, { color: textColor }]}
                >
                  Special Instructions (Optional)
                </StyledText>
                <Ionicons
                  name={showSpecialInstructions ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={textColor}
                />
              </TouchableOpacity>

              {showSpecialInstructions && (
                <StyledTextInput
                  style={[
                    styles.specialInstructionsInput,
                    {
                      backgroundColor: cardColor,
                      borderColor: "#E5E5E5",
                    },
                  ]}
                  placeholder="Add any special instructions for the detailer..."
                  placeholderTextColor={textColor + "80"}
                  value={specialInstructions}
                  onChangeText={handleSpecialInstructionsChange}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              )}
            </View>
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContent}>
            {selectedVehicle &&
              selectedServiceType &&
              selectedValetType &&
              selectedAddress && (
                <>
                  <View
                    style={[
                      styles.voucherRow,
                      {
                        backgroundColor: cardColor,
                        borderColor,
                      },
                    ]}
                  >
                    <StyledText
                      variant="titleSmall"
                      style={{ color: textColor, marginBottom: 8 }}
                    >
                      Winner / promo code
                    </StyledText>
                    <View style={styles.voucherInputRow}>
                      <TextInput
                        style={[
                          styles.voucherInput,
                          {
                            color: textColor,
                            borderColor,
                            backgroundColor: backgroundColor,
                          },
                        ]}
                        placeholder="Enter code"
                        placeholderTextColor={`${textColor}80`}
                        value={winnerVoucherCode}
                        onChangeText={setWinnerVoucherCode}
                        autoCapitalize="characters"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={[
                          styles.voucherApplyBtn,
                          { backgroundColor: primaryPurpleColor },
                        ]}
                        onPress={() => void applyWinnerVoucherCode()}
                      >
                        <StyledText
                          variant="labelMedium"
                          style={{ color: "#fff" }}
                        >
                          Apply
                        </StyledText>
                      </TouchableOpacity>
                    </View>
                    {winnerVoucherApplied ? (
                      <View style={styles.voucherAppliedMeta}>
                        <StyledText
                          variant="bodySmall"
                          style={{ color: textColor }}
                        >
                          −{formatPrice(winnerVoucherApplied.discountApplied)} ·
                          Pay {formatPrice(getPayableTotal())}
                        </StyledText>
                        <TouchableOpacity onPress={clearWinnerVoucher}>
                          <StyledText
                            variant="labelSmall"
                            style={{ color: primaryPurpleColor }}
                          >
                            Remove
                          </StyledText>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                  {!winnerVoucherApplied ? (
                    <>
                      {bookingQuoteLoading && (
                        <View style={{ alignItems: "center", marginVertical: 12 }}>
                          <ActivityIndicator color={primaryPurpleColor} />
                          <StyledText
                            variant="bodySmall"
                            style={{ color: textColor }}
                          >
                            Verifying price with server…
                          </StyledText>
                        </View>
                      )}
                      {serverQuote?.quick_sparkle?.is_quick_sparkle &&
                        [
                          serverQuote.quick_sparkle.eligible_loyalty,
                          serverQuote.quick_sparkle.eligible_partner,
                          serverQuote.quick_sparkle.eligible_subscription,
                        ].filter(Boolean).length >= 1 && (
                          <View
                            style={[
                              styles.voucherRow,
                              {
                                backgroundColor: cardColor,
                                borderColor,
                                marginBottom: 12,
                              },
                            ]}
                          >
                            <StyledText
                              variant="titleSmall"
                              style={{ color: textColor, marginBottom: 8 }}
                            >
                              Complimentary Quick Sparkle
                            </StyledText>
                            <StyledText
                              variant="bodySmall"
                              style={{ color: textColor, marginBottom: 8 }}
                            >
                              {[
                                serverQuote.quick_sparkle.eligible_loyalty,
                                serverQuote.quick_sparkle.eligible_partner,
                                serverQuote.quick_sparkle.eligible_subscription,
                              ].filter(Boolean).length >= 2
                                ? "You have more than one option. Choose how to apply it for this booking."
                                : "This booking can use your complimentary Quick Sparkle. Confirm the source below."}
                            </StyledText>
                            {(
                              [
                                {
                                  key: "loyalty" as ComplimentarySparkleSource,
                                  label: `Loyalty · ${serverQuote.quick_sparkle.remaining_loyalty ?? 0} left this cycle`,
                                  show: serverQuote.quick_sparkle.eligible_loyalty,
                                },
                                {
                                  key: "partner" as ComplimentarySparkleSource,
                                  label:
                                    "Partner referral complimentary wash",
                                  show: serverQuote.quick_sparkle.eligible_partner,
                                },
                                {
                                  key:
                                    "subscription" as ComplimentarySparkleSource,
                                  label: `Subscription · ${serverQuote.quick_sparkle.remaining_subscription ?? 0} of ${serverQuote.quick_sparkle.max_subscription ?? 0} remaining`,
                                  show:
                                    serverQuote.quick_sparkle
                                      .eligible_subscription,
                                },
                              ] as const
                            )
                              .filter((option) => option.show)
                              .map((option) => {
                                const selected =
                                  complimentarySparkleSource === option.key;
                                return (
                                  <TouchableOpacity
                                    key={option.key}
                                    activeOpacity={0.8}
                                    style={{
                                      padding: 12,
                                      borderRadius: 8,
                                      borderWidth: 1,
                                      borderColor: selected
                                        ? primaryPurpleColor
                                        : borderColor,
                                      marginBottom: 8,
                                    }}
                                    onPress={() =>
                                      setComplimentarySparkleSource(option.key)
                                    }
                                  >
                                    <StyledText
                                      variant="bodyMedium"
                                      style={{
                                        color: textColor,
                                        fontWeight: selected ? "600" : "400",
                                      }}
                                    >
                                      {option.label}
                                    </StyledText>
                                  </TouchableOpacity>
                                );
                              })}
                          </View>
                        )}
                      {!bookingQuoteLoading &&
                        serverQuote?.partner_booking_offer?.eligible && (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() =>
                              setApplyPartnerBookingDiscount((v) => !v)
                            }
                            style={[
                              styles.voucherRow,
                              {
                                backgroundColor: cardColor,
                                borderColor,
                                flexDirection: "row",
                                alignItems: "flex-start",
                                gap: 12,
                              },
                            ]}
                          >
                            <SquareCheckbox
                              checked={applyPartnerBookingDiscount}
                              borderColor={borderColor}
                              checkedBackgroundColor={primaryPurpleColor}
                              checkColor="#fff"
                              size="default"
                              style={{ marginTop: 2 }}
                            />
                            <View style={{ flex: 1 }}>
                              <StyledText
                                variant="titleSmall"
                                style={{ color: textColor, marginBottom: 4 }}
                              >
                                Partner welcome discount
                              </StyledText>
                              <StyledText
                                variant="bodySmall"
                                style={{ color: textColor, opacity: 0.92 }}
                              >
                                Apply{" "}
                                <StyledText style={{ fontWeight: "700" }}>
                                  {serverQuote.partner_booking_offer.percent}%
                                </StyledText>{" "}
                                off this booking when selected (separate from
                                complimentary washes).
                              </StyledText>
                              {serverQuote.partner_booking_offer.expires_at ? (
                                <StyledText
                                  variant="bodySmall"
                                  style={{
                                    color: textColor,
                                    marginTop: 6,
                                    opacity: 0.75,
                                  }}
                                >
                                  Valid until{" "}
                                  {new Date(
                                    serverQuote.partner_booking_offer.expires_at
                                  ).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                  .
                                </StyledText>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        )}
                    </>
                  ) : null}
                  <BookingSummary
                    vehicle={selectedVehicle}
                    serviceType={selectedServiceType}
                    valetType={selectedValetType}
                    address={selectedAddress}
                    selectedDate={selectedDate}
                    specialInstructions={specialInstructions}
                    isSUV={isSUV}
                    isExpressService={isExpressService}
                    basePrice={getBasePrice()}
                    suvPrice={getSUVPrice()}
                    expressServicePrice={getExpressServicePrice()}
                    totalPrice={getTotalPrice()}
                    selectedAddons={selectedAddons}
                    addonPrice={getAddonPrice()}
                    addonDuration={getAddonDuration()}
                    formatPrice={formatPrice}
                    user={user || undefined}
                    originalPrice={
                      winnerVoucherApplied || getPriceSummaryBreakdown()
                        ? undefined
                        : getOriginalPrice()
                    }
                    finalPrice={
                      winnerVoucherApplied || getPriceSummaryBreakdown()
                        ? undefined
                        : getFinalPrice()
                    }
                    loyaltyDiscount={
                      getPriceSummaryBreakdown()
                        ? 0
                        : getLoyaltyDiscount()
                    }
                    promotionDiscountAmount={
                      getPriceSummaryBreakdown()
                        ? undefined
                        : getPromotionDiscount()
                    }
                    priceSummaryBreakdown={
                      winnerVoucherApplied
                        ? null
                        : getPriceSummaryBreakdown()
                    }
                    total={getPayableTotal()}
                    coolingOffConsent={coolingOffConsent}
                    onCoolingOffConsentChange={setCoolingOffConsent}
                  />
                </>
              )}
          </View>
        );

      default:
        return null;
    }
  };

  const renderNavigationButtons = () => (
    <View style={styles.navigationContainer}>
      {currentStep > 1 && (
        <TouchableOpacity
          style={[styles.navButton, styles.backButton, { borderColor }]}
          onPress={handlePreviousStep}
        >
          <Ionicons name="arrow-back" size={20} color={textColor} />
          <StyledText
            variant="bodyMedium"
            style={[styles.backButtonText, { color: textColor }]}
          >
            Back
          </StyledText>
        </TouchableOpacity>
      )}

      {currentStep < 5 ? (
        <StyledButton
          title="Next"
          variant="medium"
          onPress={handleNextStep}
          disabled={!canProceedToNextStep(currentStep)}
          style={styles.nextButton}
        />
      ) : (
        <StyledButton
          title={
            isProcessingPayment && paymentConfirmationStatus === "pending"
              ? "Processing Payment..."
              : isProcessingPayment &&
                  paymentConfirmationStatus === "confirming"
                ? "Confirming Payment..."
                : isLoading
                  ? "Creating Booking..."
                  : "Confirm Booking"
          }
          variant="medium"
          onPress={handleBookingConfirmation}
          disabled={
            !canProceedToSummary() ||
            !canProceedToNextStep(5) ||
            !coolingOffConsent ||
            isLoading ||
            isProcessingPayment
          }
          style={styles.confirmButton}
        />
      )}
    </View>
  );

  const setBulkConfirmedModal = useCallback(
    (bookingReference: string, invoiceSent: boolean) => {
      setBulkConfirmationPayload({
        bookingReference,
        invoiceSent,
        numberOfVehicles: bulk.numberOfVehicles,
        date: bulk.selectedDate?.toISOString().slice(0, 10) ?? "",
        startTime:
          bulk.selectedOption?.best_start_time ??
          bulk.capacityOptions?.[0]?.best_start_time,
        endTime:
          bulk.selectedOption?.estimated_finish_time ??
          bulk.capacityOptions?.[0]?.estimated_finish_time,
        serviceName: bulk.selectedServiceType?.name ?? "Service",
        serviceDurationMinutes: bulk.selectedServiceType?.duration,
        address: bulk.selectedAddress
          ? {
              address: bulk.selectedAddress.address,
              city: bulk.selectedAddress.city,
              post_code: bulk.selectedAddress.post_code,
              country: bulk.selectedAddress.country,
            }
          : undefined,
        totalAmount: bulk.total,
      });
    },
    [bulk],
  );

  const handleBulkPayNow = useCallback(async () => {
    const bookingReference = `BULK${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const bookingData = bulk.buildBulkBookingData(bookingReference);
    try {
      const result = await openPaymentSheet(
        bulk.total,
        "Prisma Valet",
        bookingReference,
        bookingData,
        undefined,
      );
      if (!result.success || !result.paymentIntentId) return;
      await waitForPaymentConfirmation(result.paymentIntentId);
      setBulkConfirmedModal(bookingReference, false);
    } catch (e) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: (e as Error)?.message || "Payment failed.",
        type: "error",
        onConfirm: () => dismissAlert(setAlertConfig),
      });
    }
  }, [
    bulk,
    openPaymentSheet,
    waitForPaymentConfirmation,
    setAlertConfig,
    setBulkConfirmedModal,
  ]);

  const handleBulkPayLater = useCallback(async () => {
    const bookingReference = `BULK${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const bookingData = bulk.buildBulkBookingData(bookingReference);
    setIsBulkInvoiceSubmitting(true);
    try {
      const res = await createBulkOrderInvoiceLater({
        booking_data: bookingData,
        booking_reference: bookingReference,
      }).unwrap();
      setBulkConfirmedModal(res.booking_reference, true);
    } catch (e: unknown) {
      let message = "Could not send invoice. Please try again.";
      if (
        e &&
        typeof e === "object" &&
        "data" in e &&
        (e as { data?: { error?: string } }).data?.error
      ) {
        message = (e as { data: { error: string } }).data.error;
      } else if (e instanceof Error && e.message) {
        message = e.message;
      }
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message,
        type: "error",
        onConfirm: () => dismissAlert(setAlertConfig),
      });
    } finally {
      setIsBulkInvoiceSubmitting(false);
    }
  }, [
    bulk,
    createBulkOrderInvoiceLater,
    setAlertConfig,
    setBulkConfirmedModal,
  ]);

  const handleBulkPaymentConfirm = useCallback(() => {
    if (bulkPaymentOption === "pay_later") {
      void handleBulkPayLater();
      return;
    }
    void handleBulkPayNow();
  }, [bulkPaymentOption, handleBulkPayLater, handleBulkPayNow]);

  /* Bulk booking flow: step 4 content and pay. */
  const renderBulkContent = () => {
    if (bulkStep === 1) {
      return (
        <View style={styles.stepContent}>
          <StyledText
            variant="titleMedium"
            style={[styles.stepHeader, { color: textColor }]}
          >
            Service type & number of vehicles
          </StyledText>
          {(serviceTypes || []).map((service) => (
            <ServiceTypeCard
              key={service.id}
              service={{
                ...service,
                user_price: bulk.getFleetPrice(service),
              }}
              isSelected={bulk.selectedServiceType?.id === service.id}
              onSelect={() => bulk.setSelectedServiceType(service)}
            />
          ))}
          <StyledText
            variant="titleMedium"
            style={[styles.stepHeader, { color: textColor, marginTop: 16 }]}
          >
            Number of vehicles
          </StyledText>

          <StyledTextInput
            label="Number of vehicles"
            placeholder="Enter the number of vehicles"
            value={String(bulk.numberOfVehicles)}
            onChangeText={(t) =>
              bulk.setNumberOfVehicles(Math.max(0, parseInt(t, 10) || 0))
            }
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[
              styles.bulkSuvOption,
              {
                backgroundColor: bulk.isSUV ? primaryPurpleColor : cardColor,
                borderColor: bulk.isSUV ? primaryPurpleColor : borderColor,
              },
            ]}
            onPress={() => bulk.setIsSUV(!bulk.isSUV)}
            activeOpacity={0.7}
          >
            <View style={styles.bulkSuvOptionRow}>
              <View style={styles.suvTextContainer}>
                <StyledText
                  variant="bodyMedium"
                  style={[
                    styles.suvText,
                    { color: bulk.isSUV ? "#FFFFFF" : textColor },
                  ]}
                >
                  SUV / MPV vehicles
                </StyledText>
                <StyledText
                  variant="bodySmall"
                  style={[
                    styles.suvDescription,
                    {
                      color: bulk.isSUV ? "rgba(255,255,255,0.9)" : textColor,
                      opacity: bulk.isSUV ? 1 : 0.7,
                    },
                  ]}
                >
                  Additional 15% surcharge for SUV / MPV cleaning
                </StyledText>
              </View>
              <CircleCheckbox
                checked={bulk.isSUV}
                accentColor={primaryPurpleColor}
              />
            </View>
          </TouchableOpacity>
        </View>
      );
    }
    if (bulkStep === 2) {
      return (
        <View style={styles.stepContent}>
          <StyledText
            variant="titleMedium"
            style={[styles.stepHeader, { color: textColor }]}
          >
            Choose Valet Type
          </StyledText>
          {valetTypes?.map((valetType) => (
            <ValetTypeCard
              key={valetType.id}
              valetType={valetType}
              isSelected={bulk.selectedValetType?.id === valetType.id}
              onSelect={(vt) => bulk.setSelectedValetType(vt)}
            />
          ))}
        </View>
      );
    }
    if (bulkStep === 3) {
      return (
        <View style={styles.stepContent}>
          <AddressSelector
            addresses={addresses}
            selectedAddress={bulk.selectedAddress}
            onSelectAddress={bulk.setSelectedAddress}
            onAddAddress={handleAddAddress}
            showAddButton={showAddButton}
          />
          <StyledText
            variant="titleMedium"
            style={[styles.stepHeader, { color: textColor, marginTop: 16 }]}
          >
            Select date
          </StyledText>
          <TimeSlotPicker
            selectedDate={bulk.selectedDate || new Date()}
            onDateChange={bulk.setSelectedDate}
            minimumDate={new Date()}
            serviceDuration={bulk.selectedServiceType?.duration || 60}
            serviceTypeName={bulk.selectedServiceType?.name || ""}
            availableTimeSlots={[]}
            isLoadingSlots={false}
            currentMonth={bulk.calendarMonth}
            selectedDay={dayjs(bulk.selectedDate || new Date())}
            onDaySelection={(dateString) =>
              bulk.setSelectedDate(new Date(dateString))
            }
            onMonthNavigation={bulk.handleCalendarMonthNavigation}
            onTimeSlotSelect={() => {}}
            hasSelectedTimeSlot={false}
            selectedSlotAt={null}
            onSlotHoldExpired={() => {}}
          />
          <StyledText
            variant="titleMedium"
            style={[styles.stepHeader, { color: textColor, marginTop: 16 }]}
          >
            Special instructions (optional)
          </StyledText>
          <StyledTextInput
            placeholder="Any notes for the detailer..."
            value={bulk.specialInstructions}
            onChangeText={bulk.setSpecialInstructions}
            multiline={true}
            numberOfLines={3}
          />
        </View>
      );
    }
    if (bulkStep === 4) {
      return (
        <View style={styles.stepContent}>
          {bulk.capacityError && (
            <StyledText style={{ color: "orange", marginBottom: 8 }}>
              {bulk.capacityError}
            </StyledText>
          )}
          {!bulk.capacityOptions?.length && !bulk.isLoadingCapacity && (
            <StyledButton
              title="Check capacity"
              variant="medium"
              onPress={bulk.checkBulkCapacity}
              style={styles.nextButton}
            />
          )}
          {bulk.isLoadingCapacity && (
            <ActivityIndicator size="small" color={primaryPurpleColor} />
          )}
          {bulk.capacityOptions?.length ? (
            <>
              <StyledText
                variant="titleMedium"
                style={[styles.stepHeader, { color: textColor }]}
              >
                Choose window
              </StyledText>
              {bulk.capacityOptions.map((opt: BulkCapacityOption) => (
                <TouchableOpacity
                  key={opt.window}
                  onPress={() => bulk.setSelectedOption(opt)}
                  style={[
                    styles.infoCard,
                    {
                      backgroundColor: cardColor,
                      borderWidth:
                        bulk.selectedOption?.window === opt.window ? 2 : 0,
                      borderColor: primaryPurpleColor,
                    },
                  ]}
                >
                  <StyledText variant="bodyMedium" style={{ color: textColor }}>
                    {opt.window}: {opt.best_start_time} –{" "}
                    {opt.estimated_finish_time} (team: {opt.suggested_team_size}
                    )
                  </StyledText>
                </TouchableOpacity>
              ))}
              <View
                style={[
                  styles.infoCard,
                  { backgroundColor: cardColor, marginTop: 16 },
                ]}
              >
                <StyledText variant="bodyMedium" style={{ color: textColor }}>
                  {bulk.numberOfVehicles} vehicles ×{" "}
                  {bulk.getFleetPrice(bulk.selectedServiceType!)}
                  {bulk.discountPercent
                    ? ` − ${bulk.discountPercent}% = `
                    : " = "}
                  €{(bulk.subtotal / bulk.numberOfVehicles).toFixed(2)}/vehicle
                </StyledText>
                {bulk.selectedAddons.length > 0 && (
                  <StyledText
                    variant="bodySmall"
                    style={{ color: textColor, marginTop: 4 }}
                  >
                    Add-ons: +€
                    {(bulk.addonPriceTotal * bulk.numberOfVehicles).toFixed(
                      2,
                    )}{" "}
                    (+{bulk.addonDurationTotal} min/vehicle)
                  </StyledText>
                )}
                {bulk.isSUV && bulk.suvSurcharge > 0 && (
                  <StyledText
                    variant="bodySmall"
                    style={{ color: textColor, marginTop: 4 }}
                  >
                    SUV / MPV surcharge (15%): +€{bulk.suvSurcharge.toFixed(2)}
                  </StyledText>
                )}
                <StyledText
                  variant="bodyMedium"
                  style={{ color: textColor, marginTop: 4, fontWeight: "600" }}
                >
                  Total: €{bulk.total.toFixed(2)}
                </StyledText>
              </View>
              <StyledText
                variant="titleMedium"
                style={[styles.stepHeader, { color: textColor, marginTop: 20 }]}
              >
                Payment
              </StyledText>
              <View
                style={[
                  styles.bulkToggleRow,
                  { borderColor, marginHorizontal: 0, marginTop: 8 },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.bulkToggleBtn,
                    bulkPaymentOption === "pay_now" && {
                      backgroundColor: primaryPurpleColor,
                    },
                  ]}
                  onPress={() => setBulkPaymentOption("pay_now")}
                  disabled={isBulkInvoiceSubmitting}
                >
                  <StyledText
                    variant="bodyMedium"
                    style={{
                      color:
                        bulkPaymentOption === "pay_now" ? "#fff" : textColor,
                    }}
                  >
                    Pay now
                  </StyledText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.bulkToggleBtn,
                    bulkPaymentOption === "pay_later" && {
                      backgroundColor: primaryPurpleColor,
                    },
                  ]}
                  onPress={() => setBulkPaymentOption("pay_later")}
                  disabled={isBulkInvoiceSubmitting}
                >
                  <StyledText
                    variant="bodyMedium"
                    style={{
                      color:
                        bulkPaymentOption === "pay_later" ? "#fff" : textColor,
                      textAlign: "center",
                    }}
                  >
                    Pay later (invoice)
                  </StyledText>
                </TouchableOpacity>
              </View>
              <StyledText
                variant="bodySmall"
                style={[
                  styles.infoText,
                  { color: textColor, marginTop: 8, marginBottom: 4 },
                ]}
              >
                {bulkPaymentOption === "pay_now"
                  ? "Pay with card now. Your booking is confirmed after payment succeeds."
                  : "We will email a Stripe invoice (due in 30 days). Your booking is confirmed now; pay when it suits your accounts team."}
              </StyledText>
              <View
                style={[
                  styles.bulkConsentSection,
                ]}
              >
                <TouchableOpacity
                  style={styles.bulkConsentRow}
                  onPress={() => setBulkCoolingOffConsent((prev) => !prev)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: bulkCoolingOffConsent }}
                >
                  <SquareCheckbox
                    checked={bulkCoolingOffConsent}
                    borderColor={borderColor}
                    checkedBackgroundColor={buttonColor}
                    checkColor="#fff"
                    size="default"
                    style={styles.bulkConsentCheckboxOffset}
                  />
                  <View style={styles.bulkConsentTextWrap}>
                    <StyledText variant="bodySmall" style={{ color: textColor }}>
                      I agree to the service starting on{" "}
                      <StyledText variant="bodySmall" style={{ fontWeight: "bold" }}>
                        {formatServiceStartDateForConsent(
                          bulk.selectedDate ?? new Date(),
                        )}
                      </StyledText>{" "}
                      and acknowledge that my right to a full cooling-off
                      period is waived once a specific time slot is{" "}
                      <StyledText style={{ textDecorationLine: "underline" }}>
                        reserved.
                      </StyledText>
                    </StyledText>
                    <StyledText
                      variant="bodySmall"
                      style={{ color: textColor, marginTop: 8, opacity: 0.9 }}
                    >
                      Please check our refund policy.
                    </StyledText>
                  </View>
                </TouchableOpacity>
              </View>
              <View style={{ marginTop: 12 }}>
                <StyledButton
                  title={
                    bulkPaymentOption === "pay_later"
                      ? isBulkInvoiceSubmitting
                        ? "Sending invoice…"
                        : "Confirm booking & send invoice"
                      : "Pay now"
                  }
                  variant="medium"
                  onPress={handleBulkPaymentConfirm}
                  disabled={
                    isBulkInvoiceSubmitting || !bulkCoolingOffConsent
                  }
                  style={styles.nextButton}
                />
              </View>
            </>
          ) : null}
        </View>
      );
    }
    return null;
  };

  if (isLoadingBooking) {
    return <ActivityIndicator size="large" color={primaryPurpleColor} />;
  }
  return (
    <View
      style={[
        styles.container,
        { backgroundColor, paddingBottom: insets.bottom + 30 },
      ]}
    >
      {promotions && !user?.is_fleet_owner && !user?.is_branch_admin && (
        <View>
          <PromotionsCardComponent {...promotions} />
        </View>
      )}
      {isBulkEligible && (
        <View
          style={[
            styles.bulkToggleRow,
            { backgroundColor: cardColor, borderColor },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.bulkToggleBtn,
              !isBulkMode && { backgroundColor: primaryPurpleColor },
            ]}
            onPress={() => {
              setIsBulkMode(false);
              setBulkStep(1);
              setBulkPaymentOption("pay_now");
              bulk.resetBulkBooking();
              setIsBulkAddonModalVisible(false);
            }}
          >
            <StyledText
              variant="bodyMedium"
              style={{ color: isBulkMode ? textColor : "#fff" }}
            >
              Single vehicle
            </StyledText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.bulkToggleBtn,
              isBulkMode && { backgroundColor: primaryPurpleColor },
            ]}
            onPress={() => {
              setIsBulkMode(true);
              setBulkStep(1);
              setBulkPaymentOption("pay_now");
              bulk.resetBulkBooking();
              setIsBulkAddonModalVisible(false);
            }}
          >
            <StyledText
              variant="bodyMedium"
              style={{ color: isBulkMode ? "#fff" : textColor }}
            >
              Make bulk booking
            </StyledText>
          </TouchableOpacity>
        </View>
      )}
      {!isBulkMode && renderStepIndicator()}
      {isBulkMode && (
        <View style={styles.stepIndicator}>
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            Step {bulkStep} of 4{" "}
            {bulkStep === 1
              ? "– Service & count"
              : bulkStep === 2
                ? "– Valet type"
                : bulkStep === 3
                  ? "– Date & address"
                  : "– Confirm"}
          </StyledText>
        </View>
      )}
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {isBulkMode ? renderBulkContent() : renderStepContent()}
      </ScrollView>

      {isBulkMode ? (
        <View style={styles.navigationContainer}>
          {bulkStep > 1 && (
            <TouchableOpacity
              style={[styles.navButton, styles.backButton, { borderColor }]}
              onPress={() => setBulkStep((s) => s - 1)}
            >
              <Ionicons name="arrow-back" size={20} color={textColor} />
              <StyledText
                variant="bodyMedium"
                style={[styles.backButtonText, { color: textColor }]}
              >
                Back
              </StyledText>
            </TouchableOpacity>
          )}
          {bulkStep < 4 && (
            <StyledButton
              title="Next"
              variant="medium"
              onPress={() => {
                if (bulkStep === 2) {
                  setIsBulkAddonModalVisible(true);
                } else {
                  setBulkStep((s) => s + 1);
                }
              }}
              disabled={
                (bulkStep === 1 &&
                  (!bulk.selectedServiceType || bulk.numberOfVehicles < 1)) ||
                (bulkStep === 2 && !bulk.selectedValetType) ||
                (bulkStep === 3 &&
                  (!bulk.selectedDate || !bulk.selectedAddress))
              }
              style={styles.nextButton}
            />
          )}
        </View>
      ) : (
        renderNavigationButtons()
      )}

      {/* Addon Selection Modal */}
      <ModalServices
        visible={isAddonModalVisible}
        onClose={handleCloseAddonModal}
        component={
          <AddonSelection
            onClose={handleCloseAddonModal}
            onConfirm={handleConfirmAddons}
            addons={addOns || []}
            selectedAddons={selectedAddons}
            onAddonSelect={handleAddonSelectionWithRefresh}
            totalAddonPrice={getAddonPrice()}
            totalAddonDuration={getAddonDuration()}
            formatPrice={formatPrice}
          />
        }
        title="Add-ons"
        modalType="fullscreen"
        animationType="slide"
        showCloseButton={true}
      />

      {/* Bulk booking addon selection modal – shown after valet step */}
      <ModalServices
        visible={isBulkAddonModalVisible}
        onClose={handleBulkAddonClose}
        component={
          <AddonSelection
            onClose={handleBulkAddonClose}
            onConfirm={handleBulkAddonConfirm}
            addons={addOns || []}
            selectedAddons={bulk.selectedAddons}
            onAddonSelect={handleBulkAddonSelect}
            totalAddonPrice={bulk.addonPriceTotal * bulk.numberOfVehicles}
            totalAddonDuration={bulk.addonDurationTotal}
            formatPrice={formatPrice}
          />
        }
        title="Add-ons"
        modalType="fullscreen"
        animationType="slide"
        showCloseButton={true}
      />

      {/* Address Modal – content inside ModalServices fullscreen */}
      <ModalServices
        visible={isAddressModalVisible}
        onClose={() => setIsAddressModalVisible(false)}
        modalType="fullscreen"
        animationType="slide"
        showCloseButton={true}
        title="Add New Address"
        component={
          <AddAddressModal
            onClose={() => setIsAddressModalVisible(false)}
            onSave={handleSaveAddress}
          />
        }
      />

      {/* Payment Processing Modal */}
      {isProcessingPayment && (
        <ModalServices
          visible={isProcessingPayment}
          onClose={() => {}} // Prevent closing during processing
          modalType="fullscreen"
          animationType="fade"
          showCloseButton={false}
          component={
            <View
              style={[
                styles.paymentProcessingContainer,
                { backgroundColor: backgroundColor },
              ]}
            >
              <ActivityIndicator size="large" color={primaryPurpleColor} />
              <StyledText
                variant="titleLarge"
                style={[styles.processingTitle, { color: textColor }]}
              >
                {paymentConfirmationStatus === "pending"
                  ? "Processing Payment..."
                  : paymentConfirmationStatus === "confirming"
                    ? "Confirming Payment..."
                    : "Processing..."}
              </StyledText>
              <StyledText
                variant="bodyMedium"
                style={[styles.processingSubtitle, { color: textColor }]}
              >
                {paymentConfirmationStatus === "pending"
                  ? "Please wait while we process your payment"
                  : paymentConfirmationStatus === "confirming"
                    ? "Waiting for payment confirmation..."
                    : "Please wait..."}
              </StyledText>
            </View>
          }
        />
      )}

      {/* Booking Confirmation Modal - dedicated modal for proper scrolling */}
      {confirmationBookingData &&
        selectedVehicle &&
        selectedServiceType &&
        selectedValetType &&
        selectedAddress && (
          <Modal
            visible={isConfirmationModalVisible}
            animationType="slide"
            onRequestClose={handleCloseConfirmationModal}
            statusBarTranslucent
          >
            <View
              style={[styles.confirmationModalContainer, { backgroundColor }]}
            >
              <View
                style={[
                  styles.confirmationModalHeader,
                  { borderBottomColor: borderColor },
                ]}
              >
                <View style={styles.confirmationModalHeaderSpacer} />
                <StyledText
                  variant="titleMedium"
                  style={[styles.confirmationModalTitle, { color: textColor }]}
                >
                  Booking confirmed
                </StyledText>
                <Pressable
                  onPress={handleCloseConfirmationModal}
                  hitSlop={12}
                  style={[
                    styles.confirmationModalCloseBtn,
                    { backgroundColor: cardColor },
                  ]}
                >
                  <Ionicons name="close" size={24} color={textColor} />
                </Pressable>
              </View>
              <ScrollView style={styles.confirmationModalContent}>
                <BookingConfirmationModal
                  bookingReference={confirmationBookingReference || "N/A"}
                  vehicle={selectedVehicle}
                  serviceType={selectedServiceType}
                  valetType={selectedValetType}
                  address={selectedAddress}
                  selectedDate={selectedDate}
                  specialInstructions={specialInstructions}
                  selectedAddons={selectedAddons}
                  finalPrice={getFinalPrice()}
                  originalPrice={getOriginalPrice()}
                  loyaltyDiscount={getLoyaltyDiscount()}
                  formatPrice={formatPrice}
                  formatDuration={formatDuration}
                  user={user || undefined}
                  onClose={handleCloseConfirmationModal}
                  onViewDashboard={handleViewDashboard}
                />
              </ScrollView>
            </View>
          </Modal>
        )}

      {/* Bulk order booking confirmation modal */}
      {bulkConfirmationPayload && (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleBulkConfirmationClose}
        >
          <BulkOrderConfirmationModal
            type="confirmed"
            bookingReference={bulkConfirmationPayload.bookingReference}
            numberOfVehicles={bulkConfirmationPayload.numberOfVehicles}
            date={bulkConfirmationPayload.date}
            startTime={bulkConfirmationPayload.startTime}
            endTime={bulkConfirmationPayload.endTime}
            serviceName={bulkConfirmationPayload.serviceName}
            serviceDurationMinutes={
              bulkConfirmationPayload.serviceDurationMinutes
            }
            address={bulkConfirmationPayload.address}
            totalAmount={bulkConfirmationPayload.totalAmount}
            invoiceSent={bulkConfirmationPayload.invoiceSent}
            formatPrice={formatPrice}
            onClose={handleBulkConfirmationClose}
            onViewDashboard={handleBulkConfirmationViewDashboard}
          />
        </Modal>
      )}
    </View>
  );
};

export default BookingScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
    padding: 10,
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  stepContainer: {
    flex: 1,
    alignItems: "center",
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 4,
  },

  stepTitle: {
    textAlign: "center",
    fontSize: 10,
  },
  stepLine: {
    position: "absolute",
    top: 20,
    left: "50%",
    width: "100%",
    height: 2,
    zIndex: -1,
  },
  stepContent: {
    marginBottom: 20,
  },
  stepHeader: {
    fontWeight: "600",
    marginBottom: 16,
  },
  specialInstructionsContainer: {
    marginTop: 20,
  },
  specialInstructionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  specialInstructionsInput: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    minHeight: 100,
    fontSize: 16,
  },
  navigationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 5,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    gap: 10,
    marginHorizontal: 5,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  backButton: {
    backgroundColor: "transparent",
  },
  backButtonText: {
    marginLeft: 8,
    fontWeight: "600",
  },
  nextButton: {
    flex: 1,
    marginBottom: 10,
  },
  confirmButton: {
    flex: 1,
    marginLeft: 12,
  },
  bulkToggleRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  bulkToggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bulkSuvOption: {
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    marginBottom: 5,
    borderWidth: 2,
  },
  bulkSuvOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  suvTextContainer: {
    flex: 1,
  },
  suvText: {
    fontWeight: "500",
  },
  suvDescription: {
    marginTop: 2,
  },
  infoText: {
    textAlign: "center",
    opacity: 0.7,
  },
  bulkConsentSection: {
    borderRadius: 10,
    padding: 15,
    marginTop: 16,
  },
  bulkConsentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  bulkConsentCheckboxOffset: {
    marginTop: 2,
  },
  bulkConsentTextWrap: {
    flex: 1,
  },
  paymentProcessingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  processingTitle: {
    marginTop: 20,
    marginBottom: 10,
    textAlign: "center",
  },
  processingSubtitle: {
    textAlign: "center",
    opacity: 0.7,
  },
  // Booking confirmation modal (dedicated modal for scrollable content)
  confirmationModalContainer: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? 24 : 0,
  },
  confirmationModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  confirmationModalHeaderSpacer: {
    width: 40,
  },
  confirmationModalTitle: {
    fontWeight: "600",
    fontSize: 18,
  },
  confirmationModalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmationModalContent: {
    flex: 1,
  },
  voucherRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  voucherInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voucherInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  voucherApplyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: "center",
  },
  voucherAppliedMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
});
