# File index – Prisma Valet client & server

One-line description of each documented file. Many files also have in-file module docstrings or JSDoc.

## Backend (server/prisma/main/)

### Views
| File | Description |
|------|-------------|
| `views/authentication.py` | Auth API: registration, JWT token obtain/refresh. |
| `views/dashboard.py` | Dashboard API: upcoming appointments, recent services, stats, reviews, detailer location. |
| `views/events.py` | Events/booking API: service types, valet types, add-ons, book_appointment (legacy), cancel, reschedule, check free wash, payment methods. |
| `views/fleet.py` | Fleet API: branches CRUD, branch admins, fleet dashboard, vehicles, spend, vehicle bookings. |
| `views/garage.py` | Garage API: vehicles CRUD, stats, S3 test, transfer approve/reject, pending transfers, vehicle events. |
| `views/notifications.py` | Notifications API: get, mark read, mark all read, delete, save token. |
| `views/partner.py` | Partner API: dashboard, bank account, payout requests, commission. |
| `views/payment.py` | Payment sheet creation, Stripe webhook, create_booking_from_pending, detailer payload builder. |
| `views/password_reset.py` | Password reset: request reset email, validate token, reset password (API + web). |
| `views/profile.py` | Profile API: addresses CRUD, profile get/update, push/email/marketing tokens. |
| `views/service_history.py` | Service history API: get_service_history, get_booking_images. |
| `views/subcription.py` | Fleet subscription API: plans, create/cancel, billing, setup intent, update payment method. |
| `views/terms.py` | Terms and privacy API: get_terms, get_privacy_policy. |
| `views/tickets.py` | Support tickets API: create, list, detail. |
| `views/vehicle_transfer.py` | Vehicle transfer web flow: approve/reject via email link. |
| `views/vinlookup.py` | VIN lookup API: check exists, get history, initiate/verify payment. |

### Models
| File | Description |
|------|-------------|
| `models/__init__.py` | Re-exports all models (User, Vehicle, Fleet, Partner, Ticket, etc.). |
| `models/user.py` | User, referral, address, loyalty, promotions, notifications, terms, password reset token. |
| `models/vehicle.py` | Vehicle, ownership, events, transfer, service/valet types, detailer, add-ons, booking, pending booking, bulk order, payment, refund, VIN lookup. |
| `models/fleet.py` | Fleet, branch, fleet member, fleet vehicle, subscription tier/plan, fleet subscription, subscription billing. |
| `models/partner.py` | Partner, bank account, payout request, referral attribution, commission earning/payout, metrics cache, admin log. |
| `models/ticket.py` | Ticket and TicketUpdate for support. |

### Signals
| File | Description |
|------|-------------|
| `signals/__init__.py` | Imports vehicle, user, partner, fleet signal modules to register handlers. |
| `signals/user.py` | Referral rewards on booking completion. |
| `signals/vehicle.py` | Booking completion: loyalty, activity bonus, notifications, promotional email, create vehicle event. |
| `signals/fleet.py` | Trial subscription activation email; clear branch_admin when last admin removed. |
| `signals/partner.py` | Commission on booking completion; reverse commission on refund. |

### Tasks
| File | Description |
|------|-------------|
| `tasks/__init__.py` | Re-exports all Celery tasks (notifications, bookings, emails, fleet). |
| `tasks/bookings/__init__.py` | Re-exports publish_booking_cancelled, publish_booking_rescheduled, publish_review_to_detailer. |
| `tasks/bookings/events.py` | Celery tasks to publish booking events to Redis for detailer app. |
| `tasks/emails/__init__.py` | Re-exports email tasks (welcome, booking, promotional, refund, auth, transfer, subscription, branch admin). |
| `tasks/notifications/__init__.py` | Re-exports push and scheduled notification tasks. |

### Utils & services
| File | Description |
|------|-------------|
| `utils/branch_spend.py` | Branch spend for period (weekly/monthly) for leash enforcement. |
| `utils/bulk_appointments.py` | Create BookedAppointment rows for each vehicle in a BulkOrder. |
| `utils/fleet_analytics.py` | Fleet dashboard metrics: branch performance, spend trends, health scores, booking activity, common issues. |
| `utils/partner_attribution.py` | get_partner_for_user for commission/referral. |
| `utils/redis_geo.py` | Redis GEO read for detailer location. |
| `utils/redis_streams.py` | Redis stream helper (job_events), get_redis, stream_add, consumer groups. |
| `util/graph_mail.py` | Microsoft Graph API client for sending email. |
| `util/media_helper.py` | Build full media URL from relative path. |
| `util/phone_utils.py` | Phone number normalization. |
| `services/NotificationServices.py` | NotificationService: booking confirmation via push and email. |

### Management commands
| File | Description |
|------|-------------|
| `management/commands/setup_refund_system.py` | Verify refund models ready. |
| `management/commands/subscribe_redis.py` | Consume job_events stream; update bookings, send push/email, sync images. |

### Other
| File | Description |
|------|-------------|
| `admin.py` | Django admin for all main models. |
| `apps.py` | Main app config; imports signals on ready. |
| `serializer.py` | DRF serializers for main models; custom JWT serializer. |
| `urls.py` | URL routing for main app. |

---

## Frontend (prisma_client)

### Interfaces
| File | Description |
|------|-------------|
| `app/interfaces/AuthInterface.ts` | Auth state and sign-up types. |
| `app/interfaces/BookingInterfaces.ts` | Booking types: service, valet, add-ons, create booking payload, payment sheet response. |
| `app/interfaces/DashboardInterfaces.ts` | Upcoming appointments, recent services, stats, review payloads. |
| `app/interfaces/FleetInterfaces.ts` | Branch, fleet dashboard, vehicles, spend, admins, capacity. |
| `app/interfaces/GarageInterface.ts` | My vehicles, inspection, promotions, fleet vehicle stats. |
| `app/interfaces/NotificationInterface.ts` | Notification types and status. |
| `app/interfaces/OtherInterfaces.ts` | Detailer profile, return booking props. |
| `app/interfaces/PaymentInterface.ts` | Owner details, billing address, checkout context. |
| `app/interfaces/ProfileInterfaces.ts` | User profile, addresses, service history. |
| `app/interfaces/SubscriptionInterfaces.ts` | Subscription tiers, plans, current subscription, billing. |
| `app/interfaces/SupportInterfaces.ts` | Create ticket payload, ticket, ticket detail. |
| `app/interfaces/VehicleHistoryInterfaces.ts` | Vehicle basic info, owners, history, VIN lookup. |

### Store
| File | Description |
|------|-------------|
| `app/store/baseQuery.ts` | Axios base query for RTK Query; auth header, token refresh. |
| `app/store/main_store.ts` | Redux store: slices and all RTK Query APIs. |
| `app/store/api/authApi.ts` | Login, register, refresh, logout. |
| `app/store/api/dashboardApi.ts` | User stats, upcoming appointments, recent services, cancel, review, detailer location. |
| `app/store/api/eventApi.ts` | Booking, payment sheet, confirm payment, service/valet/add-ons, cancel, reschedule, promotions, free wash, bulk order. |
| `app/store/api/fleetApi.ts` | Branches, branch admins, fleet dashboard, vehicles, spend, bookings, bulk orders. |
| `app/store/api/garageApi.ts` | Vehicles CRUD, stats, S3 test, transfer approve/reject, pending transfers, vehicle events. |
| `app/store/api/notificationApi.ts` | Get notifications, mark read, mark all read, delete, save token. |
| `app/store/api/partnerApi.ts` | Partner dashboard, payout details/history, create payout, update bank. |
| `app/store/api/profileApi.ts` | Addresses CRUD, get profile, update push/email/marketing tokens. |
| `app/store/api/serviceHistoryApi.ts` | Get service history, get booking images. |
| `app/store/api/subscriptionApi.ts` | Plans, current subscription, create/cancel, billing, setup intent, update payment method. |
| `app/store/api/ticketApi.ts` | Create ticket, list tickets, ticket detail. |
| `app/store/api/vinLookupApi.ts` | Check VIN exists, get vehicle history, initiate/verify payment. |
| `app/store/slices/authSlice.ts` | Auth state and reducers. |
| `app/store/slices/bookingSlice.ts` | Booking selection state. |
| `app/store/slices/dashboardSlice.ts` | Upcoming appointments list. |
| `app/store/slices/garageSlice.ts` | New vehicle for add flow. |
| `app/store/slices/profileSlice.ts` | New address for add flow. |
| `app/store/slices/vehicleDataUploadSlice.ts` | Vehicle event form and submit. |

### App hooks
| File | Description |
|------|-------------|
| `app/app-hooks/useAddresses.ts` | User addresses with RTK Query. |
| `app/app-hooks/useBooking.ts` | Full booking flow state and confirmation (payment + webhook wait). |
| `app/app-hooks/useBulkBooking.ts` | Bulk booking: service, valet, address, date, capacity, payload. |
| `app/app-hooks/useDashboard.ts` | Upcoming appointments, cancel, recent services, stats, review, detailer location. |
| `app/app-hooks/useFleet.ts` | Fleet management: branches, admins, dashboard, vehicles, spend, bulk orders. |
| `app/app-hooks/useFleetDashboard.ts` | Fleet dashboard data: performance, spend trends, health, booking activity, issues. |
| `app/app-hooks/useGarage.ts` | Vehicles, add/update/delete, stats, promotions, transfers, events. |
| `app/app-hooks/useGooglePlaces.ts` | Google Places autocomplete and place details. |
| `app/app-hooks/useLocationService.ts` | Device location and permission. |
| `app/app-hooks/useNotification.ts` | Single notification state and actions. |
| `app/app-hooks/useNotificationService.ts` | Expo Notifications: register, token, save to backend. |
| `app/app-hooks/useNotifications.ts` | Notifications list, filter, mark read, delete. |
| `app/app-hooks/useOnboarding.ts` | Sign-up flow and register API. |
| `app/app-hooks/usePartner.ts` | Partner dashboard, payout details/history, create payout. |
| `app/app-hooks/usePayment.ts` | Stripe payment sheet and wait for confirmation. |
| `app/app-hooks/usePermissions.ts` | Push and location permission prompts. |
| `app/app-hooks/useProfile.ts` | Addresses, profile, tokens, service history. |
| `app/app-hooks/useServiceHistory.ts` | Service history data and states. |
| `app/app-hooks/useVehicles.ts` | Vehicles list and branch grouping. |

### Hooks (app & root)
| File | Description |
|------|-------------|
| `app/hooks/useFleetSubscription.ts` | Fleet subscription: plans, create/cancel, billing, Stripe. |
| `app/hooks/useSubscriptionLimits.ts` | Subscription limits and current usage. |
| `hooks/useColorScheme.ts` | Re-export React Native useColorScheme. |
| `hooks/useColorScheme.web.ts` | Web color scheme. |
| `hooks/useLoadedFonts.ts` | Load app fonts (SpaceMono, Barlow). |
| `hooks/useThemeColor.ts` | Theme-aware color from Colors and ThemeProvider. |
| `hooks/useUpdateMonitor.ts` | Expo Updates: check for OTA, prompt reload. |

### Utils & constants
| File | Description |
|------|-------------|
| `app/utils/methods.ts` | getStatusColor, formatCurrency, etc. |
| `app/utils/imageDownload.ts` | Download/save/share images. |
| `app/utils/fleetDashboardUtils.ts` | Fleet dashboard data processing and API helpers. |
| `app/utils/helpers/storage.ts` | Save/load auth data to SecureStore. |
| `app/utils/ModalServices.tsx` | Reusable modal wrapper. |
| `constants/Colors.ts` | Light/dark theme colors. |
| `constants/Config.ts` | Expo extra: Stripe, API URLs, Google keys. |
| `constants/Status.ts` | Status labels for bookings/transfers. |

### Contexts
| File | Description |
|------|-------------|
| `app/contexts/AlertContext.tsx` | Global alert modal state and provider. |
| `app/contexts/AuthContextProvider.tsx` | Auth state provider and persistence. |
| `app/contexts/ExpoStripeProvider.tsx` | Stripe provider for Expo. |
| `app/contexts/ModalServiceProvider.tsx` | Modal service provider. |
| `app/contexts/SnackbarContext.tsx` | Snackbar/toast state and provider. |
| `app/contexts/ThemeProvider.tsx` | Theme (light/dark) context. |

### Components – booking
| File | Description |
|------|-------------|
| `app/components/booking/AddonCard.tsx` | Single add-on card for selection. |
| `app/components/booking/AddonSelection.tsx` | Add-on selection modal/list. |
| `app/components/booking/AddressSelector.tsx` | Address list and selection. |
| `app/components/booking/AvailabilityCalendar.tsx` | Calendar for date selection. |
| `app/components/booking/BookingCancellationModal.tsx` | Cancel booking confirmation and refund info. |
| `app/components/booking/BookingConfirmationModal.tsx` | Post-booking success modal. |
| `app/components/booking/BookingSummary.tsx` | Booking summary step. |
| `app/components/booking/BulkOrderConfirmationModal.tsx` | Bulk order success modal. |
| `app/components/booking/BulkRescheduleComponent.tsx` | Bulk reschedule UI. |
| `app/components/booking/PromotionsCard.tsx` | Promotions card on booking. |
| `app/components/booking/RescheduleComponent.tsx` | Single booking reschedule. |
| `app/components/booking/RescheduleBulkOrderContent.tsx` | Bulk reschedule content. |
| `app/components/booking/ReviewComponent.tsx` | Submit review for completed booking. |
| `app/components/booking/ServiceTypeCard.tsx` | Service type selection card. |
| `app/components/booking/TimeSlotPicker.tsx` | Time slot list and selection. |
| `app/components/booking/ValetTypeCard.tsx` | Valet type selection card. |
| `app/components/booking/VehicleSelector.tsx` | Vehicle selection and SUV/express toggles. |

### Components – dashboard
| File | Description |
|------|-------------|
| `app/components/dashboard/BarChart.tsx` | Bar chart for dashboard. |
| `app/components/dashboard/charts/ChartContainer.tsx` | Chart wrapper. |
| `app/components/dashboard/charts/HealthScoreGauge.tsx` | Health score gauge. |
| `app/components/dashboard/charts/LineChart.tsx` | Line chart. |
| `app/components/dashboard/charts/PieChart.tsx` | Pie chart. |
| `app/components/dashboard/DateRangePicker.tsx` | Date range picker. |
| `app/components/dashboard/ForthcomingBookingComponent.tsx` | Forthcoming booking card. |
| `app/components/dashboard/ForthcomingBookingsEmptyState.tsx` | Empty state for forthcoming bookings. |
| `app/components/dashboard/OngoingServiceCard.tsx` | Ongoing service card. |
| `app/components/dashboard/QuickActionsSection.tsx` | Quick actions. |
| `app/components/dashboard/RecentServicesSection.tsx` | Recent services list. |
| `app/components/dashboard/ReferralSection.tsx` | Referral section. |
| `app/components/dashboard/StatsSection.tsx` | Stats cards. |
| `app/components/dashboard/VehicleCard.tsx` | Vehicle card. |

### Components – garage, helpers, notification, profile, settings, shared, support, vehiclehistory
| File | Description |
|------|-------------|
| `app/components/garage/AddNewVehicle.tsx` | Add new vehicle form/screen content. |
| `app/components/garage/GarageVehicleComponent.tsx` | Single vehicle in garage list. |
| `app/components/garage/MyVehicleStatsComponent.tsx` | Vehicle stats. |
| `app/components/garage/PendingTransfersSection.tsx` | Pending transfer requests. |
| `app/components/garage/VehicleInspectionSection.tsx` | Inspection section. |
| `app/components/helpers/AlertModal.tsx` | Alert modal. |
| `app/components/helpers/LinearGradientComponent.tsx` | Linear gradient. |
| `app/components/helpers/StyledButton.tsx` | Themed button. |
| `app/components/helpers/StyledText.tsx` | Themed text. |
| `app/components/helpers/StyledTextInput.tsx` | Themed text input. |
| `app/components/helpers/TermsAcceptanceModal.tsx` | Terms acceptance modal. |
| `app/components/notification/AllowNotificationModal.tsx` | Prompt to allow notifications. |
| `app/components/notification/NotificationInitializer.tsx` | Init notification listener. |
| `app/components/notification/NotificationItem.tsx` | Single notification row. |
| `app/components/profile/AddAddressModal.tsx` | Add address modal. |
| `app/components/profile/AddressCard.tsx` | Address card. |
| `app/components/profile/FleetOwnerProfileCard.tsx` | Fleet owner profile card. |
| `app/components/profile/InspectionDataModal.tsx` | Inspection data modal. |
| `app/components/profile/PaymentMethodsComponent.tsx` | Payment methods list. |
| `app/components/profile/PaymentMethodsModal.tsx` | Payment methods modal. |
| `app/components/profile/ProfileCard.tsx` | Profile card. |
| `app/components/profile/ReferralCodeCard.tsx` | Referral code card. |
| `app/components/profile/SavedCardItem.tsx` | Saved card item. |
| `app/components/profile/ServiceHistoryComponent.tsx` | Service history list. |
| `app/components/profile/ServiceImageGalleryTab.tsx` | Service images gallery tab. |
| `app/components/profile/ServiceImagesModal.tsx` | Service images modal. |
| `app/components/profile/SubscriptionCard.tsx` | Subscription card. |
| `app/components/profile/SubscriptionTierCard.tsx` | Subscription tier card. |
| `app/components/settings/SettingItem.tsx` | Single setting row. |
| `app/components/settings/SettingLink.tsx` | Setting link. |
| `app/components/settings/SettingSection.tsx` | Setting section. |
| `app/components/settings/ToggleComponent.tsx` | Toggle setting. |
| `app/components/shared/AddressSearchInput.tsx` | Address search with autocomplete. |
| `app/components/shared/UnratedTag.tsx` | Unrated tag. |
| `app/components/support/CreateTicketModal.tsx` | Create support ticket modal. |
| `app/components/vehiclehistory/VehicleExistsModal.tsx` | Vehicle already exists modal. |
| `app/components/examples/AddressSelectorExample.tsx` | Example address selector. |

### Screens – main, tabs, onboarding, vehiclehistory
| File | Description |
|------|-------------|
| `app/main/(tabs)/bookings/BookingScreen.tsx` | Main booking flow (single + bulk). |
| `app/main/(tabs)/bookings/_layout.tsx` | Bookings tab layout. |
| `app/main/(tabs)/dashboard/DashboardScreen.tsx` | User dashboard. |
| `app/main/(tabs)/dashboard/FleetDashboardScreen.tsx` | Fleet owner dashboard. |
| `app/main/(tabs)/dashboard/BranchAdminDashboardScreen.tsx` | Branch admin dashboard. |
| `app/main/(tabs)/dashboard/BranchManagementScreen.tsx` | Branch management (fleet owner). |
| `app/main/(tabs)/dashboard/CreateBranchAdminScreen.tsx` | Create branch admin. |
| `app/main/(tabs)/dashboard/DealershipPartnerDashboardScreen.tsx` | Dealership partner dashboard. |
| `app/main/(tabs)/dashboard/ForthcomingBookingsListScreen.tsx` | Forthcoming bookings list. |
| `app/main/(tabs)/dashboard/PartnerPayoutScreen.tsx` | Partner payout. |
| `app/main/(tabs)/dashboard/UpcomingBookingScreen.tsx` | Upcoming booking detail. |
| `app/main/(tabs)/dashboard/VehicleBookingsScreen.tsx` | Vehicle bookings. |
| `app/main/(tabs)/dashboard/_layout.tsx` | Dashboard tab layout. |
| `app/main/(tabs)/garage/GarageScreen.tsx` | Garage list. |
| `app/main/(tabs)/garage/VehicleDataUploadScreen.tsx` | Vehicle data/event upload. |
| `app/main/(tabs)/garage/VehicleDetailsScreen.tsx` | Vehicle detail. |
| `app/main/(tabs)/garage/_layout.tsx` | Garage tab layout. |
| `app/main/(tabs)/history/HistoryScreen.tsx` | Service history list. |
| `app/main/(tabs)/history/ServiceHistoryDetailScreen.tsx` | Service history detail. |
| `app/main/(tabs)/history/_layout.tsx` | History tab layout. |
| `app/main/(tabs)/profile/ProfileScreen.tsx` | Profile. |
| `app/main/(tabs)/profile/BranchAdminProfileScreen.tsx` | Branch admin profile. |
| `app/main/(tabs)/profile/FleetOwnerProfileScreen.tsx` | Fleet owner profile. |
| `app/main/(tabs)/profile/SubscriptionPlanScreen.tsx` | Subscription plan selection. |
| `app/main/(tabs)/profile/_layout.tsx` | Profile tab layout. |
| `app/main/(tabs)/_layout.tsx` | Tabs root layout. |
| `app/main/_layout.tsx` | Main stack layout. |
| `app/main/HelpSupportScreen.tsx` | Help & support. |
| `app/main/NotificationScreen.tsx` | Notifications list. |
| `app/main/SettingsScreen.tsx` | Settings. |
| `app/main/TicketDetailScreen.tsx` | Ticket detail. |
| `app/main/TrackDetailerMapScreen.tsx` | Track detailer map. |
| `app/onboarding/SigninScreen.tsx` | Sign in. |
| `app/onboarding/OnboardingScreen.tsx` | Onboarding. |
| `app/onboarding/ForgotPasswordScreen.tsx` | Forgot password. |
| `app/onboarding/ResetPasswordScreen.tsx` | Reset password. |
| `app/onboarding/_layout.tsx` | Onboarding layout. |
| `app/vehiclehistory/VehicleHistoryScreen.tsx` | Vehicle history (VIN). |
| `app/vehiclehistory/VehicleDataInputScreen.tsx` | Vehicle data input. |
| `app/vehiclehistory/VehicleLookupPaymentScreen.tsx` | VIN lookup payment. |
| `app/vehiclehistory/_layout.tsx` | Vehicle history layout. |
| `app/_layout.tsx` | Root layout. |
| `app/index.tsx` | App entry / redirect. |

---

See also **BOOKING_FLOW.md** for the full booking and payment flow.
