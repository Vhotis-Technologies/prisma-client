"""
Django admin site for Prisma Car Care: register and configure all main models.

Includes custom forms (e.g. ServiceType description as textarea), list displays, filters,
and inline editors for User, Vehicle, Fleet, Branch, BookedAppointment, Partner, Payment, etc.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from django.core.exceptions import ValidationError
from django import forms
from django.db import models
from django.utils import timezone
from .models import User, Vehicle, VehicleOwnership, VehicleEvent, Fleet, FleetMember, FleetVehicle, VehicleTransfer, ServiceType, ValetType, DetailerProfile, BookedAppointment, Address, AddOns, Notification, LoyaltyProgram, Promotions, PaymentTransaction, RefundRecord, TermsAndConditions, PrivacyPolicy, Referral, Branch, SubscriptionTier, SubscriptionPlan, FleetSubscription, SubscriptionBilling, EventDataManagement, BookedAppointmentImage, Partner, PartnerBankAccount, PartnerPayoutRequest, ReferralAttribution, CommissionEarning, CommissionPayout, PartnerMetricsCache, CommissionAdminLog, PendingBooking, BulkOrder, WinnerVoucher



admin.site.site_header = "Prisma Car Care Admin"
admin.site.site_title = "Prisma Admin"
admin.site.index_title = "Welcome to Prisma Car Care Admin Panel"


# Custom form for ServiceType to handle description as textarea
class ServiceTypeForm(forms.ModelForm):
    description_text = forms.CharField(
        widget=forms.Textarea(attrs={'rows': 4, 'cols': 50}),
        help_text="Enter each service item on a new line. These will be stored as an array.",
        required=False
    )
    
    class Meta:
        model = ServiceType
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            # Convert JSON array back to text for editing
            if self.instance.description:
                self.fields['description_text'].initial = '\n'.join(self.instance.description)
    
    def save(self, commit=True):
        instance = super().save(commit=False)
        # Convert textarea input to JSON array
        description_text = self.cleaned_data.get('description_text', '')
        if description_text:
            # Split by newlines and filter out empty lines
            description_array = [line.strip() for line in description_text.split('\n') if line.strip()]
            instance.description = description_array
        else:
            instance.description = []
        
        if commit:
            instance.save()
        return instance

# Custom form for SubscriptionTier to handle features JSONField as textarea
class SubscriptionTierForm(forms.ModelForm):
    features_text = forms.CharField(
        widget=forms.Textarea(attrs={'rows': 8, 'cols': 50}),
        help_text="Enter each feature on a new line. These will be stored as an array.",
        required=False
    )
    
    class Meta:
        model = SubscriptionTier
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            # Convert JSON array back to text for editing
            if self.instance.features:
                self.fields['features_text'].initial = '\n'.join(self.instance.features)
    
    def save(self, commit=True):
        instance = super().save(commit=False)
        # Convert textarea input to JSON array
        features_text = self.cleaned_data.get('features_text', '')
        if features_text:
            # Split by newlines and filter out empty lines
            features_array = [line.strip() for line in features_text.split('\n') if line.strip()]
            instance.features = features_array
        else:
            instance.features = []
        
        if commit:
            instance.save()
        return instance

# Custom form for ValetType to handle description as textarea
class ValetTypeForm(forms.ModelForm):
    description_text = forms.CharField(
        widget=forms.Textarea(attrs={'rows': 4, 'cols': 50}),
        help_text="Enter the valet service description.",
        required=False
    )
    
    class Meta:
        model = ValetType
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            # Set the textarea with current description
            self.fields['description_text'].initial = self.instance.description
    
    def save(self, commit=True):
        instance = super().save(commit=False)
        # Get the description from textarea
        instance.description = self.cleaned_data.get('description_text', '')
        
        if commit:
            instance.save()
        return instance


class PrismaUserChangeForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User


class PrismaAdminUserCreationForm(AdminUserCreationForm):
    """Add user in admin: email + optional phone; Django 5 usable_password + password fields."""

    class Meta:
        model = User
        fields = ('email', 'name', 'phone')

    def clean_email(self):
        email = self.cleaned_data.get('email')
        if email and User.objects.filter(email__iexact=email).exists():
            raise ValidationError('A user with this email already exists.')
        return email


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    form = PrismaUserChangeForm
    add_form = PrismaAdminUserCreationForm
    ordering = ('email',)
    list_display = (
        'email',
        'name',
        'phone',
        'is_active',
        'is_staff',
        'is_fleet_owner',
        'is_branch_admin',
    )
    list_filter = (
        'is_active',
        'is_staff',
        'is_superuser',
        'is_fleet_owner',
        'is_branch_admin',
        'created_at',
        'groups',
    )
    search_fields = ('email', 'name', 'phone')
    raw_id_fields = ('referred_by',)
    readonly_fields = (
        'id',
        'username',
        'last_login',
        'date_joined',
        'created_at',
        'updated_at',
    )
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal', {'fields': ('name', 'phone')}),
        ('Fleet & branch', {'fields': ('is_fleet_owner', 'is_branch_admin')}),
        ('Referrals', {'fields': ('referral_code', 'referred_by')}),
        (
            'Notifications',
            {
                'fields': (
                    'notification_token',
                    'allow_marketing_emails',
                    'allow_push_notifications',
                    'allow_email_notifications',
                ),
            },
        ),
        (
            'Billing & promotions',
            {'fields': ('stripe_customer_id', 'has_signup_promotions', 'has_booking_promotions')},
        ),
        (
            'Permissions',
            {
                'fields': (
                    'is_active',
                    'is_staff',
                    'is_superuser',
                    'groups',
                    'user_permissions',
                ),
            },
        ),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
        (
            'Internal',
            {
                'description': 'Username is synced from email when the user is saved.',
                'fields': ('username', 'id'),
            },
        ),
        ('Metadata', {'fields': ('created_at', 'updated_at')}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': (
                    'email',
                    'name',
                    'phone',
                    'usable_password',
                    'password1',
                    'password2',
                ),
            },
        ),
    )


@admin.register(EventDataManagement)
class EventDataManagementAdmin(admin.ModelAdmin):
    list_filter = ('inspected_at',)
    search_fields = ('booking__booking_reference',)
    readonly_fields = ('id', 'inspected_at')
    date_hierarchy = 'inspected_at'

@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ('make', 'model', 'year', 'color', 'registration_number', 'country', 'vin', 'created_at')
    list_filter = ('make', 'year', 'country', 'created_at')
    search_fields = ('make', 'model', 'registration_number', 'vin', 'country')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(VehicleOwnership)
class VehicleOwnershipAdmin(admin.ModelAdmin):
    list_display = ('vehicle', 'owner', 'ownership_type', 'start_date', 'end_date', 'created_at')
    list_filter = ('ownership_type', 'start_date', 'created_at')
    search_fields = ('vehicle__registration_number', 'owner__name', 'owner__email')
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'start_date'

@admin.register(VehicleEvent)
class VehicleEventAdmin(admin.ModelAdmin):
    list_display = ('vehicle', 'event_type', 'performed_by', 'event_date', 'visibility', 'created_at')
    list_filter = ('event_type', 'visibility', 'event_date', 'created_at')
    search_fields = ('vehicle__registration_number', 'performed_by__name', 'booking__booking_reference')
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'event_date'

@admin.register(Fleet)
class FleetAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('name', 'owner__name', 'owner__email')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(FleetMember)
class FleetMemberAdmin(admin.ModelAdmin):
    list_display = ('fleet', 'user', 'role', 'joined_at')
    list_filter = ('role', 'joined_at')
    search_fields = ('fleet__name', 'user__name', 'user__email')
    readonly_fields = ('id', 'joined_at')

@admin.register(FleetVehicle)
class FleetVehicleAdmin(admin.ModelAdmin):
    list_display = ('fleet', 'vehicle', 'added_by', 'added_at')
    list_filter = ('added_at',)
    search_fields = ('fleet__name', 'vehicle__registration_number', 'added_by__name')
    readonly_fields = ('id', 'added_at')

@admin.register(VehicleTransfer)
class VehicleTransferAdmin(admin.ModelAdmin):
    list_display = ('vehicle', 'from_owner', 'to_owner', 'status', 'requested_at', 'expires_at')
    list_filter = ('status', 'requested_at', 'expires_at')
    search_fields = ('vehicle__registration_number', 'vehicle__vin', 'from_owner__name', 'from_owner__email', 'to_owner__name', 'to_owner__email')
    readonly_fields = ('id', 'requested_at', 'created_at')
    date_hierarchy = 'requested_at'
    actions = ['expire_selected_transfers']
    
    def expire_selected_transfers(self, request, queryset):
        """Manually expire selected transfer requests"""
        from django.utils import timezone
        count = queryset.filter(status='pending').update(
            status='expired',
            responded_at=timezone.now()
        )
        self.message_user(request, f"Expired {count} transfer requests")
    expire_selected_transfers.short_description = "Expire selected transfers"

@admin.register(ServiceType)
class ServiceTypeAdmin(admin.ModelAdmin):
    form = ServiceTypeForm
    list_display = ('name', 'price', 'duration')
    list_filter = ('price', 'duration')
    search_fields = ('name',)
    
    def get_fields(self, request, obj=None):
        # Exclude the original description field and use our custom one
        fields = list(super().get_fields(request, obj))
        if 'description' in fields:
            fields.remove('description')
        return fields

@admin.register(ValetType)
class ValetTypeAdmin(admin.ModelAdmin):
    form = ValetTypeForm
    list_display = ('name',)
    search_fields = ('name',)
    
    def get_fields(self, request, obj=None):
        # Exclude the original description field and use our custom one
        fields = list(super().get_fields(request, obj))
        if 'description' in fields:
            fields.remove('description')
        return fields

@admin.register(DetailerProfile)
class DetailerProfileAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'rating', 'created_at')
    list_filter = ('rating', 'created_at')
    search_fields = ('name','phone')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ('user', 'address', 'post_code', 'city', 'country')
    list_filter = ('city', 'country')
    search_fields = ('user__name', 'address', 'city')

@admin.register(BookedAppointment)
class BookedAppointmentAdmin(admin.ModelAdmin):
    list_display = ('user', 'vehicle', 'service_type', 'valet_type', 'appointment_date', 'status', 'total_amount','booking_reference')
    list_filter = ('status', 'appointment_date', 'created_at')
    search_fields = ('user__name', 'vehicle__make', 'vehicle__model', 'booking_reference')
    readonly_fields = ('id', 'booking_date', 'created_at', 'updated_at', 'booking_reference')
    date_hierarchy = 'appointment_date'

@admin.register(AddOns)
class AddOnsAdmin(admin.ModelAdmin):
    list_display = ('name', 'price', 'description', 'extra_duration')
    search_fields = ('name',)
    readonly_fields = ('created_at', 'updated_at')

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'type', 'status', 'message')
    list_filter = ('type', 'status')
    search_fields = ('user__name', 'title')

@admin.register(LoyaltyProgram)
class LoyaltyProgramAdmin(admin.ModelAdmin):
    list_display = ('user', 'current_tier', 'completed_bookings')
    search_fields = ('user__name',)

@admin.register(Promotions)
class PromotionsAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'discount_percentage', 'valid_until', 'is_active', 'terms_conditions')
    search_fields = ('user__name', 'title')

@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = ['booking', 'user', 'transaction_type', 'amount', 'status', 'created_at']
    list_filter = ['transaction_type', 'status', 'created_at']
    search_fields = ['booking__booking_reference', 'user__email', 'stripe_payment_intent_id']
    readonly_fields = ['created_at', 'processed_at']

@admin.register(RefundRecord)
class RefundRecordAdmin(admin.ModelAdmin):
    list_display = ['booking', 'user', 'requested_amount', 'status', 'created_at', 'dispute_resolved']
    list_filter = ['status', 'dispute_resolved', 'created_at']
    search_fields = ['booking__booking_reference', 'user__email', 'stripe_refund_id']
    actions = ['resolve_disputes', 'mark_as_resolved']
    readonly_fields = ['created_at', 'processed_at', 'dispute_resolved_at']
    
    def resolve_disputes(self, request, queryset):
        """Mark disputes as resolved"""
        updated = queryset.filter(status='disputed').update(
            dispute_resolved=True,
            dispute_resolved_at=timezone.now()
        )
        self.message_user(request, f"Marked {updated} disputes as resolved")
    resolve_disputes.short_description = "Mark selected disputes as resolved"
    
    def mark_as_resolved(self, request, queryset):
        """Mark refunds as resolved"""
        updated = queryset.update(dispute_resolved=True, dispute_resolved_at=timezone.now())
        self.message_user(request, f"Marked {updated} refunds as resolved")
    mark_as_resolved.short_description = "Mark selected refunds as resolved"

@admin.register(TermsAndConditions)
class TermsAndConditionsAdmin(admin.ModelAdmin):
    list_display = ('version', 'last_updated')
    ordering = ('-last_updated',)

@admin.register(PrivacyPolicy)
class PrivacyPolicyAdmin(admin.ModelAdmin):
    list_display = ('version', 'last_updated')
    ordering = ('-last_updated',)

@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ('referrer', 'referred', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('referrer__name', 'referred__name')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ('name', 'address', 'postcode', 'city', 'country', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('name', 'address', 'postcode', 'city', 'country')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(SubscriptionTier)
class SubscriptionTierAdmin(admin.ModelAdmin):
    form = SubscriptionTierForm
    list_display = ('name', 'monthlyPrice', 'yearly_price', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'tagLine')
    readonly_fields = ('id', 'created_at', 'updated_at')
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'tagLine', 'badge', 'is_active')
        }),
        ('Pricing', {
            'fields': ('monthlyPrice', 'yearly_price', 'yearly_billing_text')
        }),
        ('Features', {
            'fields': ('features_text',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_fields(self, request, obj=None):
        # Exclude the original features field and use our custom one
        fields = list(super().get_fields(request, obj))
        if 'features' in fields:
            fields.remove('features')
        return fields

@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ('name', 'tier', 'billing_cycle', 'price', 'is_active', 'created_at')
    list_filter = ('billing_cycle', 'is_active', 'tier', 'created_at')
    search_fields = ('name', 'tier__name')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(FleetSubscription)
class FleetSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('fleet', 'plan', 'status', 'start_date', 'end_date', 'auto_renew', 'created_at')
    list_filter = ('status', 'auto_renew', 'start_date', 'end_date', 'created_at')
    search_fields = ('fleet__name', 'fleet__owner__name', 'fleet__owner__email', 'stripe_subscription_id')
    readonly_fields = ('id', 'created_at', 'updated_at')
    date_hierarchy = 'start_date'
    fieldsets = (
        ('Subscription Details', {
            'fields': ('fleet', 'plan', 'status', 'start_date', 'end_date', 'auto_renew')
        }),
        ('Stripe Information', {
            'fields': ('stripe_subscription_id',)
        }),
        ('Cancellation', {
            'fields': ('cancellation_date', 'cancellation_reason'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(BookedAppointmentImage)
class BookedAppointmentImageAdmin(admin.ModelAdmin):
    list_display = ('booking', 'image_type', 'segment', 'image_url', 'created_at')
    list_filter = ('image_type', 'segment', 'created_at')
    search_fields = ('booking__booking_reference', 'image_url')
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'created_at'

@admin.register(SubscriptionBilling)
class SubscriptionBillingAdmin(admin.ModelAdmin):
    list_display = ('subscription', 'amount', 'billing_date', 'status', 'transaction_id', 'created_at')
    list_filter = ('status', 'billing_date', 'created_at')
    search_fields = ('subscription__fleet__name', 'transaction_id', 'subscription__stripe_subscription_id')
    readonly_fields = ('id', 'created_at', 'updated_at')
    date_hierarchy = 'billing_date'


@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = ('business_name', 'partner_type', 'referral_code', 'user', 'commission_rate', 'is_active', 'created_at')
    list_filter = ('partner_type', 'is_active', 'created_at')
    search_fields = ('business_name', 'referral_code', 'user__email', 'user__name')
    readonly_fields = ('id', 'referral_code', 'created_at', 'updated_at')
    raw_id_fields = ('user',)


@admin.register(PartnerBankAccount)
class PartnerBankAccountAdmin(admin.ModelAdmin):
    list_display = ('partner', 'account_holder_name', 'created_at')
    search_fields = ('partner__business_name', 'account_holder_name')
    readonly_fields = ('id', 'created_at', 'updated_at')
    raw_id_fields = ('partner',)


@admin.register(PartnerPayoutRequest)
class PartnerPayoutRequestAdmin(admin.ModelAdmin):
    list_display = ('partner', 'amount_requested', 'status', 'requested_at', 'paid_at')
    list_filter = ('status', 'requested_at')
    search_fields = ('partner__business_name', 'partner__user__email')
    readonly_fields = ('id', 'requested_at', 'created_at')
    raw_id_fields = ('partner',)
    date_hierarchy = 'requested_at'
    list_editable = ('status',)


@admin.register(ReferralAttribution)
class ReferralAttributionAdmin(admin.ModelAdmin):
    list_display = ('partner', 'referred_user', 'source', 'attribution_type', 'attributed_at', 'expires_at')
    list_filter = ('source', 'attribution_type', 'attributed_at')
    search_fields = ('partner__business_name', 'referred_user__email', 'referred_user__name')
    readonly_fields = ('id', 'attributed_at', 'created_at', 'updated_at')
    raw_id_fields = ('partner', 'referred_user')


@admin.register(CommissionEarning)
class CommissionEarningAdmin(admin.ModelAdmin):
    list_display = ('partner', 'booking', 'referred_user', 'gross_amount', 'commission_rate', 'commission_amount', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('partner__business_name', 'booking__booking_reference', 'referred_user__email')
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('partner', 'booking', 'referred_user', 'payout')
    date_hierarchy = 'created_at'
    actions = ['reverse_commission', 'approve_commission']

    def reverse_commission(self, request, queryset):
        from main.models import CommissionAdminLog
        count = 0
        for earning in queryset.exclude(status='reversed'):
            prev_status = earning.status
            prev_amount = earning.commission_amount
            CommissionAdminLog.objects.create(
                commission_earning=earning,
                admin_user=request.user,
                action='reverse',
                reason='Admin reversal',
                previous_status=prev_status,
                previous_amount=prev_amount,
            )
            earning.status = 'reversed'
            earning.save(update_fields=['status'])
            count += 1
        self.message_user(request, f'Reversed {count} commission(s)')
    reverse_commission.short_description = 'Reverse selected commissions'

    def approve_commission(self, request, queryset):
        from main.models import CommissionAdminLog
        count = 0
        for earning in queryset.filter(status='pending'):
            prev_status = earning.status
            CommissionAdminLog.objects.create(
                commission_earning=earning,
                admin_user=request.user,
                action='approve',
                reason='Admin approval',
                previous_status=prev_status,
            )
            earning.status = 'approved'
            earning.save(update_fields=['status'])
            count += 1
        self.message_user(request, f'Approved {count} commission(s)')
    approve_commission.short_description = 'Approve selected pending commissions'


@admin.register(CommissionAdminLog)
class CommissionAdminLogAdmin(admin.ModelAdmin):
    list_display = ('commission_earning', 'admin_user', 'action', 'previous_status', 'previous_amount', 'reason', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('commission_earning__booking__booking_reference', 'admin_user__email', 'reason')
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('commission_earning', 'admin_user')
    date_hierarchy = 'created_at'


@admin.register(CommissionPayout)
class CommissionPayoutAdmin(admin.ModelAdmin):
    list_display = ('partner', 'total_amount', 'period_start', 'period_end', 'status', 'paid_at', 'created_at')
    list_filter = ('status', 'period_start', 'period_end')
    search_fields = ('partner__business_name', 'stripe_payout_id')
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('partner',)
    date_hierarchy = 'period_start'


@admin.register(PartnerMetricsCache)
class PartnerMetricsCacheAdmin(admin.ModelAdmin):
    list_display = ('partner', 'total_referred_users', 'active_referred_users', 'total_revenue_from_referrals', 'total_commission_earned', 'pending_commission', 'last_updated')
    search_fields = ('partner__business_name',)
    readonly_fields = ('last_updated',)

@admin.register(PendingBooking)
class PendingBookingAdmin(admin.ModelAdmin):
    list_display = ('booking_reference', 'user', 'payment_status', 'expires_at', 'created_at')
    list_filter = ('payment_status', 'expires_at', 'created_at')
    search_fields = ('booking_reference', 'user__email', 'user__name')


@admin.register(BulkOrder)
class BulkOrderAdmin(admin.ModelAdmin):
    list_display = ('booking_reference', 'user', 'branch', 'fleet', 'payment_status', 'number_of_vehicles', 'total_amount', 'created_at')
    list_filter = ('payment_status', 'created_at')
    search_fields = ('booking_reference', 'user__email', 'user__name')
    readonly_fields = ('id', 'created_at', 'updated_at')
    date_hierarchy = 'created_at'


@admin.register(WinnerVoucher)
class WinnerVoucherAdmin(admin.ModelAdmin):
    """
    Multiple unredeemed vouchers may share the same assigned_email; signup links all
    open rows (assigned_user null) to the new user.
    """

    list_display = (
        'code',
        'assigned_email',
        'assigned_user',
        'credit_amount',
        'valid_from',
        'expires_at',
        'redeemed_at',
        'is_active',
        'created_at',
    )
    list_filter = ('is_active', 'redeemed_at', 'expires_at')
    search_fields = ('code', 'assigned_email', 'assigned_user__email')
    readonly_fields = ('id', 'created_at', 'updated_at')
    raw_id_fields = ('assigned_user', 'consumed_booking')
