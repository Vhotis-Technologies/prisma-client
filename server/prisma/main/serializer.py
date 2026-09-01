"""
DRF serializers for main models: User, Vehicle, Fleet, BookedAppointment, Address, etc.

Includes :class:`CustomTokenObtainPairSerializer` for JWT login responses enriched with
profile, address, loyalty, fleet branch, and partner fields for the mobile app.
"""
from rest_framework import serializers
from .models import User, Vehicle, VehicleOwnership, VehicleEvent, Fleet, FleetMember, FleetVehicle, VehicleTransfer, ServiceType, ValetType, DetailerProfile, BookedAppointment, Address, AddOns, LoyaltyProgram, Promotions, Branch, SubscriptionTier, SubscriptionPlan, FleetSubscription, SubscriptionBilling, EventDataManagement, B2CSubcriptionTier, B2CSubcriptionPlan, B2CSubcription, B2CSubcriptionBilling
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.exceptions import ValidationError


class UserSerializer(serializers.ModelSerializer):
    """Read/write all :class:`~main.models.user.User` fields for admin/API use."""

    class Meta:
        model = User
        fields = '__all__'


class VehicleSerializer(serializers.ModelSerializer):
    """Vehicle CRUD; exposes image URL when present."""

    image = serializers.ImageField(required=False, allow_null=True, use_url=True)

    class Meta:
        model = Vehicle
        fields = '__all__'


class VehicleOwnershipSerializer(serializers.ModelSerializer):
    """Ownership interval linking a user to a vehicle."""

    class Meta:
        model = VehicleOwnership
        fields = '__all__'


class VehicleEventSerializer(serializers.ModelSerializer):
    """Garage timeline event serializer."""

    class Meta:
        model = VehicleEvent
        fields = '__all__'


class FleetSerializer(serializers.ModelSerializer):
    """Fleet header record (owner, name, trial flags)."""

    class Meta:
        model = Fleet
        fields = '__all__'


class FleetMemberSerializer(serializers.ModelSerializer):
    """User membership in a fleet with role and optional branch."""

    class Meta:
        model = FleetMember
        fields = '__all__'


class FleetVehicleSerializer(serializers.ModelSerializer):
    """Vehicle linked to a fleet (and optional branch)."""

    class Meta:
        model = FleetVehicle
        fields = '__all__'


class VehicleTransferSerializer(serializers.ModelSerializer):
    """Peer ownership transfer request."""

    class Meta:
        model = VehicleTransfer
        fields = '__all__'


class ServiceTypeSerializer(serializers.ModelSerializer):
    """Bookable service catalog entry."""

    class Meta:
        model = ServiceType
        fields = '__all__'


class ValetTypeSerializer(serializers.ModelSerializer):
    """Valet modality (mobile vs on-site)."""

    class Meta:
        model = ValetType
        fields = '__all__'


class DetailerProfileSerializer(serializers.ModelSerializer):
    """Assigned detailer profile from detailer service."""

    class Meta:
        model = DetailerProfile
        fields = '__all__'


class BookedAppointmentSerializer(serializers.ModelSerializer):
    """Single booking row including pricing and status."""

    class Meta:
        model = BookedAppointment
        fields = '__all__'


class AddOnsSerializer(serializers.ModelSerializer):
    """Optional booking add-on."""

    class Meta:
        model = AddOns
        fields = '__all__'


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    """B2C loyalty tier and free-wash counters."""

    class Meta:
        model = LoyaltyProgram
        fields = '__all__'


class PromotionsSerializer(serializers.ModelSerializer):
    """Per-user promotional discount."""

    class Meta:
        model = Promotions
        fields = '__all__'


class BranchSerializer(serializers.ModelSerializer):
    """Fleet branch location and spend limits."""

    class Meta:
        model = Branch
        fields = '__all__'


class SubscriptionTierSerializer(serializers.ModelSerializer):
    """Fleet SaaS tier definition."""

    class Meta:
        model = SubscriptionTier
        fields = '__all__'


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    """Fleet plan with nested tier read and writable tier_id."""

    tier = SubscriptionTierSerializer(read_only=True)
    tier_id = serializers.PrimaryKeyRelatedField(queryset=SubscriptionTier.objects.all(), source='tier', write_only=True, required=False)

    class Meta:
        model = SubscriptionPlan
        fields = '__all__'


class FleetSubscriptionSerializer(serializers.ModelSerializer):
    """Active fleet subscription with nested plan."""

    plan = SubscriptionPlanSerializer(read_only=True)
    plan_id = serializers.PrimaryKeyRelatedField(queryset=SubscriptionPlan.objects.all(), source='plan', write_only=True, required=False)

    class Meta:
        model = FleetSubscription
        fields = '__all__'


class B2CSubscriptionTierSerializer(serializers.ModelSerializer):
    """B2C subscription tier for consumer catalog APIs."""

    class Meta:
        model = B2CSubcriptionTier
        fields = '__all__'


class B2CSubscriptionPlanSerializer(serializers.ModelSerializer):
    """B2C plan with tier, billing cycle, price, and computed entitlement limits."""

    tier = B2CSubscriptionTierSerializer(read_only=True)
    tier_id = serializers.PrimaryKeyRelatedField(
        queryset=B2CSubcriptionTier.objects.all(),
        source='tier',
        write_only=True,
        required=False,
    )
    limits = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = B2CSubcriptionPlan
        fields = (
            'id',
            'tier',
            'tier_id',
            'billing_cycle',
            'vehicle_category',
            'price',
            'created_at',
            'updated_at',
            'limits',
        )

    def get_limits(self, obj):
        """Expose :meth:`B2CSubcriptionPlan.get_limits` for mobile subscription UI."""
        return obj.get_limits()


class B2CSubscriptionSerializer(serializers.ModelSerializer):
    """User B2C subscription instance with nested plan."""

    plan = B2CSubscriptionPlanSerializer(read_only=True)
    plan_id = serializers.PrimaryKeyRelatedField(
        queryset=B2CSubcriptionPlan.objects.all(),
        source='plan',
        write_only=True,
        required=False,
    )

    class Meta:
        model = B2CSubcription
        fields = '__all__'


class B2CSubscriptionBillingSerializer(serializers.ModelSerializer):
    """B2C subscription invoice/charge row."""

    subscription = B2CSubscriptionSerializer(read_only=True)

    class Meta:
        model = B2CSubcriptionBilling
        fields = '__all__'


class SubscriptionBillingSerializer(serializers.ModelSerializer):
    """Fleet subscription billing row with nested subscription."""

    subscription = FleetSubscriptionSerializer(read_only=True)

    class Meta:
        model = SubscriptionBilling
        fields = '__all__'


class EventDataManagementSerializer(serializers.ModelSerializer):
    """Digital health check fields attached to a completed booking."""

    class Meta:
        model = EventDataManagement
        fields = [
            'id', 'booking', 'tire_tread_depth', 'tire_condition', 'wiper_status',
            'oil_level', 'coolant_level', 'brake_fluid_level', 'battery_condition',
            'headlights_status', 'taillights_status', 'indicators_status',
            'vehicle_condition_notes', 'damage_report', 'inspected_at'
        ]
        read_only_fields = ['inspected_at']


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    JWT login: normalize email, then attach user profile payload to the token response.

    Returns access/refresh tokens plus nested ``user`` (address, loyalty, fleet branch,
    partner/dealership flags) for the React Native client bootstrap.
    """

    def validate(self, attrs):
        """Authenticate by email and enrich token payload with profile context."""
        email = attrs.get(self.username_field)
        if email:
            normalized_email = email.strip().lower()
            try:
                user = User.objects.get(email__iexact=normalized_email)
                attrs[self.username_field] = user.email
                if user.is_guest:
                    raise ValidationError(
                        "This email was used for a guest booking. "
                        "Open the link we emailed to create your password."
                    )
            except User.DoesNotExist:
                attrs[self.username_field] = normalized_email

        try:
            data = super().validate(attrs)
        except ValidationError as e:
            raise e

        user = self.user
        # Primary service address (first row) for booking defaults
        address = Address.objects.filter(user=user).first()
        loyalty = (
            LoyaltyProgram.objects.filter(user=user).first()
            if user.is_b2c_user()
            else None
        )
        loyalty_benefits = loyalty.get_tier_benefits() if loyalty else None

        # Branch admins see their managed site in the app shell
        managed_branch = None
        if user.is_branch_admin:
            managed_branch_obj = user.get_managed_branch()
            if managed_branch_obj:
                managed_branch = {
                    'id': str(managed_branch_obj.id),
                    'name': managed_branch_obj.name,
                    'address': managed_branch_obj.address,
                    'postcode': managed_branch_obj.postcode,
                    'city': managed_branch_obj.city,
                }

        # Partner / dealership profile for referral dashboard entry
        from main.models import Partner
        try:
            partner_profile = user.partner_profile
            is_dealership = partner_profile is not None
            partner_referral_code = partner_profile.referral_code if is_dealership else None
            partner_business_name = partner_profile.business_name if is_dealership else None
        except Partner.DoesNotExist:
            is_dealership = False
            partner_referral_code = None
            partner_business_name = None

        data.update({
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'phone': user.phone,
                'is_fleet_owner': user.is_fleet_owner,
                'is_branch_admin': user.is_branch_admin,
                'is_guest': user.is_guest,
                'is_dealership': is_dealership,
                'partner_referral_code': partner_referral_code,
                'business_name': partner_business_name,
                'managed_branch': managed_branch,
                'address': {
                    'address': address.address if address else None,
                    'city': address.city if address else None,
                    'post_code': address.post_code if address else None,
                    'country': address.country if address else None,
                },
                'push_notification_token': user.allow_push_notifications,
                'email_notification_token': user.allow_email_notifications,
                'marketing_email_token': user.allow_marketing_emails,
                'loyalty_tier': loyalty.current_tier if loyalty else None,
                'loyalty_benefits': loyalty_benefits,
                'referral_code': user.referral_code if user.referral_code else None,
            }

        })
        return data
