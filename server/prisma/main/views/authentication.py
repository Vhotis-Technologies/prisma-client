"""
Authentication API for Prisma Car Care: user registration, JWT token obtain/refresh.

- CustomTokenObtainPairView: JWT token pair with custom serializer.
- AuthenticationView: register (create_new_account) with optional referral, fleet owner, dealership.
  On success can trigger send_welcome_email and send_promotional_email.
"""
from rest_framework.generics import CreateAPIView
from rest_framework.permissions import AllowAny
from ..serializer import UserSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView as BaseTokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import timedelta
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.http import JsonResponse
from django_ratelimit.decorators import ratelimit

from ..models import User, Address, LoyaltyProgram, Partner, Promotions, Referral, ReferralAttribution
from ..serializer import CustomTokenObtainPairSerializer
from rest_framework.response import Response
from rest_framework import status
from main.tasks import send_welcome_email, send_promotional_email
from main.utils.ratelimit_helpers import rate_limit_json_response
from time import sleep


def _auth_rate_limit_block(request):
    """Rate-limit exceeded callback: return 429 JSON for auth endpoints."""
    return JsonResponse({'detail': 'Too many requests. Try again later.'}, status=429)


@method_decorator(
    ratelimit(key='ip', rate='5/m', method='POST', block=_auth_rate_limit_block),
    name='post',
)
class CustomTokenObtainPairView(TokenObtainPairView):
    """
  JWT login: email/password → access + refresh tokens.

  Uses CustomTokenObtainPairSerializer for user payload in the token response.
  Rate-limited (5/min per IP). Public (AllowAny).
  """

    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer


@method_decorator(
    ratelimit(key="ip", rate="30/m", method="POST", block=rate_limit_json_response),
    name="post",
)
class TokenRefreshView(BaseTokenRefreshView):
    """Refresh an access token from a valid refresh token. Rate-limited (30/min per IP). Public."""

    permission_classes = [AllowAny]


@method_decorator(
    ratelimit(key='ip', rate='5/m', method='POST', block=_auth_rate_limit_block),
    name='post',
)
class AuthenticationView(CreateAPIView):
    """
  Onboarding API: action-based registration (no JWT required until success).

  Routed via ``onboard/<action>/`` (see main.urls). Currently supports
  ``create_new_account`` → ``register``.
  """

    permission_classes = [AllowAny]
    action_handlers = {
        'create_new_account': 'register'
    }

    def post(self, request, *args, **kwargs):
        """Route POST by URL action (e.g. create_new_account → register). Returns 400 if action invalid."""
        # Dispatch to handler named in action_handlers
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
        

    def register(self, request):
        """
        Create a new user account. Expects request.data.credentials: name, email, phone, password.
        Optional: referred_code/referredCode, isFleetOwner, isDealership, business_name, business_address.
        Validates referral (Partner DP* or User code), creates User, optional Fleet/Branch (fleet owner),
        optional Partner (dealership), optional ReferralAttribution + Promotions (partner referral).
        Sends welcome and promotional emails; returns user payload and JWT access/refresh tokens.
        """
        try:
            data = request.data.get('credentials')
            # Optional referral and business signup flags from mobile client
            referral_code = data.get('referred_code') or data.get('referredCode')
            is_fleet_owner = data.get('isFleetOwner', False)
            is_dealership = data.get('isDealership', False)
            business_name = data.get('business_name') or data.get('businessName', '').strip()
            business_address = data.get('business_address') or data.get('businessAddress')

            if is_fleet_owner or is_dealership:
                if not business_name:
                    return Response(
                        {'error': 'Business name is required when signing up as a fleet owner or dealership'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if not business_address or not isinstance(business_address, dict):
                    return Response(
                        {'error': 'Business address is required when signing up as a fleet owner or dealership'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                addr = business_address
                if not addr.get('address') or not addr.get('city') or not addr.get('country'):
                    return Response(
                        {'error': 'Please provide a complete business address (address, city, country)'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Resolve referral code: Partner first (DP prefix), then User. Prevent self-referral.
            referred_by_user = None
            referrer_partner = None
            if referral_code:
                referral_code = str(referral_code).strip().upper()
                # Try Partner first (codes start with DP)
                if referral_code.startswith('DP'):
                    try:
                        referrer_partner = Partner.objects.get(referral_code=referral_code)
                        if referrer_partner.user.email.lower() == data.get('email', '').strip().lower():
                            return Response({'error': 'You cannot use your own referral code'}, status=status.HTTP_400_BAD_REQUEST)
                    except Partner.DoesNotExist:
                        return Response({'error': 'Invalid referral code'}, status=status.HTTP_400_BAD_REQUEST)
                else:
                    try:
                        referrer_user = User.objects.get(referral_code=referral_code)
                        if referrer_user.email.lower() == data.get('email', '').strip().lower():
                            return Response({'error': 'You cannot use your own referral code'}, status=status.HTTP_400_BAD_REQUEST)
                        referred_by_user = referrer_user
                    except User.DoesNotExist:
                        return Response({'error': 'Invalid referral code'}, status=status.HTTP_400_BAD_REQUEST)

            email = (data.get('email') or '').strip().lower()
            existing = User.objects.filter(email__iexact=email).first() if email else None
            if existing is not None:
                if existing.is_guest:
                    return Response(
                        {
                            'error': (
                                'This email was used for a guest booking. Open the link we emailed '
                                'to set a password — your vehicle and history will stay in the garage.'
                            ),
                            'code': 'guest_unclaimed',
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                return Response(
                    {
                        'error': 'An account already exists for this email. Sign in instead.',
                        'code': 'email_registered',
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            # Call the user model to create a new user
            user = User.objects.create_user(
                name=data['name'],
                email=data['email'],
                phone=data['phone'],
                password=data['password']
            )

            # Set fleet owner status and user-to-user referral
            user.is_fleet_owner = is_fleet_owner
            if referred_by_user:
                user.referred_by = referred_by_user
            user.save()

            # Ensure every new user has a unique referral code (fleet/regular may not get one from User.save() path)
            if not user.referral_code:
                while True:
                    code = user.create_referral_code()
                    if not User.objects.filter(referral_code=code).exists() and not Partner.objects.filter(referral_code=code).exists():
                        user.referral_code = code
                        user.save(update_fields=['referral_code'])
                        break

            if referred_by_user:
                Referral.objects.get_or_create(referrer=referred_by_user, referred=user)

            # Update fleet with business name and create first Branch if business data provided
            if is_fleet_owner and (business_name or business_address):
                user.create_fleet(business_name=business_name or None, business_address=business_address)

            # Create Partner if dealership
            if is_dealership:
                partner_kwargs = {
                    'user': user,
                    'partner_type': 'dealership',
                    'business_name': business_name or f"{user.name}'s Dealership",
                    'is_active': True,
                }
                if business_address and isinstance(business_address, dict):
                    from decimal import Decimal
                    partner_kwargs['business_address'] = business_address.get('address') or ''
                    partner_kwargs['business_postcode'] = business_address.get('post_code') or ''
                    partner_kwargs['business_city'] = business_address.get('city') or ''
                    partner_kwargs['business_country'] = business_address.get('country') or ''
                    if business_address.get('latitude') is not None:
                        partner_kwargs['business_latitude'] = Decimal(str(business_address['latitude']))
                    if business_address.get('longitude') is not None:
                        partner_kwargs['business_longitude'] = Decimal(str(business_address['longitude']))
                partner = Partner.objects.create(**partner_kwargs)
                # Create PartnerMetricsCache for new partner
                from ..models import PartnerMetricsCache
                PartnerMetricsCache.objects.create(partner=partner)

            # Create ReferralAttribution if referred by partner (after user exists)
            if referrer_partner:
                ReferralAttribution.objects.create(
                    referred_user=user,
                    partner=referrer_partner,
                    source='partner',
                    expires_at=timezone.now() + timedelta(days=60)
                )
                Promotions.objects.create(
                    user=user,
                    title="Partner Referral Discount",
                    description=f"40% off washes for 60 days (referred by {referrer_partner.business_name})",
                    discount_percentage=40,
                    valid_until=(timezone.now() + timedelta(days=60)).date(),
                    is_active=True,
                    terms_conditions="Valid for 60 days from signup. Partner referral. Cannot be combined with other offers.",
                )
            # Side effects: onboarding emails (allowed for new users regardless of prefs)
            send_welcome_email.apply_async(args=[user.email], countdown=60)
            send_promotional_email.apply_async(args=[user.email, user.name], countdown=300)
            
            # Issue JWT so client can log in without a second login request
            refresh = RefreshToken.for_user(user)
            access_token = str(refresh.access_token)
            refresh_token = str(refresh)
            
            # Get user address data (if any)
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
            
            # Partner profile data for dealership users
            is_dealership = False
            partner_referral_code = None
            partner_business_name = None
            try:
                partner_profile = user.partner_profile
                is_dealership = True
                partner_referral_code = partner_profile.referral_code
                partner_business_name = partner_profile.business_name
            except Partner.DoesNotExist:
                pass

            return Response({
                'message': 'Welcome to PRISMA VALLET. Your account has been created successfully.\n\nPlease check your email for further updates',
                'user': {
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
                    'loyalty_tier': loyalty.current_tier if loyalty else None,
                    'loyalty_benefits': loyalty_benefits,
                    'referral_code': user.referral_code if user.referral_code else None,
                },
                'access': access_token,
                'refresh': refresh_token
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)