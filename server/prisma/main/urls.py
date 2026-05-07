"""
URL routing for main app: authentication, profile, garage, events, dashboard, payment, fleet, etc.

Includes Stripe webhook, password reset, vehicle transfer web flow, and action-based view routes.
"""
from django.urls import path
from main.views.authentication import CustomTokenObtainPairView, AuthenticationView
from rest_framework_simplejwt.views import TokenRefreshView
from main.views.profile import ProfileView
from main.views.garage import GarageView
from main.views.events import EventsView
from main.views.dashboard import DashboardView
from main.views.payment import PaymentView, StripeWebhookView
from main.views.terms import TermsView
from django.conf import settings
from django.conf.urls.static import static
from main.views.notifications import NotificationsView
from main.views.password_reset import RequestPasswordResetView, ResetPasswordView, ValidateResetTokenView, WebResetPasswordView
from main.views.vehicle_transfer import WebTransferActionView
from main.views.fleet import FleetView
from main.views.subcription import SubscriptionView
from main.views.b2csubscription import B2CSubscriptionView
from main.views.service_history import ServiceHistoryView
from main.views.partner import PartnerView
from main.views.tickets import TicketView
from main.views.support.support_dashboard import SupportDashboardView
from main.views.support.support_bookings import SupportBookingsView
from main.views.support.support_customers import SupportCustomersView
from main.views.support.support_activities import SupportActivitiesView
from main.views.support.support_tickets import SupportTicketsView
from main.views.support.support_vouchers import SupportVouchersView
from main.views.support.support_accounting import SupportAccountingView


app_name = 'main'

urlpatterns = [
    path('authentication/login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('authentication/refresh/', TokenRefreshView.as_view(), name='refresh'),
    path('onboard/<action>/', AuthenticationView.as_view(), name='onboard'),
    path('profile/<action>/', ProfileView.as_view(), name='profile'),
    path('garage/<action>/', GarageView.as_view(), name='garage'),
    path('garage/<action>/<vehicle_id>/', GarageView.as_view(), name='garage'),
    path('events/<action>/', EventsView.as_view(), name='events'),
    path('dashboard/<action>/', DashboardView.as_view(), name='dashboard'),
    path('notifications/<action>/', NotificationsView.as_view(), name='notifications'),
    path('terms/<action>/', TermsView.as_view(), name='terms'),
    # Payment and webhook endpoints
    path('payment/stripe-webhook/', StripeWebhookView.as_view(), name='stripe_webhook'),
    path('payment/<action>/', PaymentView.as_view(), name='payment'),
    
    # Password reset endpoints
    path('auth/password-reset/', RequestPasswordResetView.as_view(), name='request_password_reset'),
    path('auth/validate-reset-token/', ValidateResetTokenView.as_view(), name='validate_reset_token'),
    path('auth/reset-password/', ResetPasswordView.as_view(), name='reset_password'),
    path('auth/web-reset-password/', WebResetPasswordView.as_view(), name='web_reset_password'),
    
    # Vehicle transfer web endpoints
    path('garage/web-transfer-action/<uuid:transfer_id>/', WebTransferActionView.as_view(), name='web_transfer_action'),
    
    # Fleet management endpoints
    path('fleet/<action>/', FleetView.as_view(), name='fleet'),
    path('fleet/<action>/<uuid:branch_id>/', FleetView.as_view(), name='fleet'),
    path('fleet/<action>/<uuid:vehicle_id>/', FleetView.as_view(), name='fleet'),
    
    # Subscription endpoints
    path('subscription/<action>/', SubscriptionView.as_view(), name='subscription'),
    path('b2c-subscription/<action>/', B2CSubscriptionView.as_view(), name='b2c-subscription'),
    
    # Service history endpoints
    path('service-history/<action>/', ServiceHistoryView.as_view(), name='service_history'),

    # Partner (Dealership) endpoints
    path('partner/<action>/', PartnerView.as_view(), name='partner'),

    # Support tickets (client-owned)
    path('tickets/create/', TicketView.as_view(), name='tickets_create'),
    path('tickets/list/', TicketView.as_view(), name='tickets_list'),
    path('tickets/detail/<uuid:ticket_id>/', TicketView.as_view(), name='tickets_detail'),

    # Support dashboard endpoints
    path('support/dashboard/<action>/', SupportDashboardView.as_view(), name='support_dashboard'),
    path('support/bookings/<action>/', SupportBookingsView.as_view(), name='support_bookings'),
    path('support/customers/<action>/', SupportCustomersView.as_view(), name='support_customers'),
    path('support/activities/<action>/', SupportActivitiesView.as_view(), name='support_activities'),
    path('support/tickets/<action>/', SupportTicketsView.as_view(), name='support_tickets'),
    path('support/vouchers/<action>/', SupportVouchersView.as_view(), name='support_vouchers'),
    path('support/accounting/<action>/', SupportAccountingView.as_view(), name='support_accounting'),
]


if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)