"""
DRF serializers for main models: User, Vehicle, Fleet, BookedAppointment, Address, etc.

Includes CustomTokenObtainPairSerializer for JWT with custom claims.
"""
from rest_framework import serializers
from .models import User, Vehicle, VehicleOwnership, VehicleEvent, Fleet, FleetMember, FleetVehicle, VehicleTransfer, ServiceType, ValetType, DetailerProfile, BookedAppointment, Address, AddOns, LoyaltyProgram, Promotions, Branch, SubscriptionTier, SubscriptionPlan, FleetSubscription, SubscriptionBilling, EventDataManagement, B2CSubcriptionTier, B2CSubcriptionPlan, B2CSubcription, B2CSubcriptionBilling
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.exceptions import ValidationError   

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = '__all__'

class VehicleSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True, use_url=True)
    class Meta:
        model = Vehicle
        fields = '__all__'

class VehicleOwnershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleOwnership
        fields = '__all__'

class VehicleEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleEvent
        fields = '__all__'

class FleetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fleet
        fields = '__all__'

class FleetMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = FleetMember
        fields = '__all__'

class FleetVehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FleetVehicle
        fields = '__all__'

class VehicleTransferSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleTransfer
        fields = '__all__'

class ServiceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceType
        fields = '__all__'

class ValetTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ValetType
        fields = '__all__'

class DetailerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetailerProfile
        fields = '__all__'

class BookedAppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookedAppointment
        fields = '__all__'

class AddOnsSerializer(serializers.ModelSerializer):
    class Meta:
        model = AddOns
        fields = '__all__'

class LoyaltyProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyProgram
        fields = '__all__'

class PromotionsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Promotions
        fields = '__all__'

class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = '__all__'

class SubscriptionTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionTier
        fields = '__all__'

class SubscriptionPlanSerializer(serializers.ModelSerializer):
    tier = SubscriptionTierSerializer(read_only=True)
    tier_id = serializers.PrimaryKeyRelatedField(queryset=SubscriptionTier.objects.all(), source='tier', write_only=True, required=False)
    
    class Meta:
        model = SubscriptionPlan
        fields = '__all__'

class FleetSubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)
    plan_id = serializers.PrimaryKeyRelatedField(queryset=SubscriptionPlan.objects.all(), source='plan', write_only=True, required=False)
    
    class Meta:
        model = FleetSubscription
        fields = '__all__'

class B2CSubscriptionTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = B2CSubcriptionTier
        fields = '__all__'


class B2CSubscriptionPlanSerializer(serializers.ModelSerializer):
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
            'price',
            'created_at',
            'updated_at',
            'limits',
        )

    def get_limits(self, obj):
        return obj.get_limits()


class B2CSubscriptionSerializer(serializers.ModelSerializer):
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
    subscription = B2CSubscriptionSerializer(read_only=True)

    class Meta:
        model = B2CSubcriptionBilling
        fields = '__all__'

class SubscriptionBillingSerializer(serializers.ModelSerializer):
    subscription = FleetSubscriptionSerializer(read_only=True)
    
    class Meta:
        model = SubscriptionBilling
        fields = '__all__'

class EventDataManagementSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventDataManagement
        fields = [
            'id', 'booking', 'tire_tread_depth', 'tire_condition', 'wiper_status',
            'oil_level', 'coolant_level', 'brake_fluid_level', 'battery_condition',
            'headlights_status', 'taillights_status', 'indicators_status',
            'vehicle_condition_notes', 'damage_report', 'inspected_at'
        ]
        read_only_fields = ['inspected_at']

""" Customise the token serializer to get the attrs sent from the client 
    This attrs contains the users email and password.
    Returns the users profile data, access and refresh tokens,
    and the users address data if there is any associated adress with the user , else returns null
"""
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        email = attrs.get(self.username_field)
        if email:
            normalized_email = email.strip().lower()
            try:
                user = User.objects.get(email__iexact=normalized_email)
                attrs[self.username_field] = user.email
            except User.DoesNotExist:
                attrs[self.username_field] = normalized_email

        try:
            data = super().validate(attrs)
        except ValidationError as e:
            raise e
        
        user = self.user
        # Check if the user has an address
        address = Address.objects.filter(user=user).first()
        loyalty = (
            LoyaltyProgram.objects.filter(user=user).first()
            if user.is_b2c_user()
            else None
        )
        loyalty_benefits = loyalty.get_tier_benefits() if loyalty else None
        
        # Get managed branch if user is branch admin
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
        
        # Partner profile for dealership users
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

        # Add user data to the existing token data
        data.update({
            'user': {
                'id': user.id,
                'name': user.name ,
                'email': user.email,
                'phone': user.phone,
                'is_fleet_owner': user.is_fleet_owner,
                'is_branch_admin': user.is_branch_admin,
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