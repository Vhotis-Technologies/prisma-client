"""
Fleet subscription API: plans, current subscription, create/cancel subscription, billing history, payment method.

SubscriptionView actions: get_plans, get_current_subscription, create_subscription,
get_subscription_billing_history, update_payment_method, cancel_subscription, get_setup_intent.
Uses Stripe for subscription and billing.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from main.models import (
    User, Fleet, SubscriptionTier, SubscriptionPlan, 
    FleetSubscription, SubscriptionBilling, PaymentTransaction
)
from main.serializer import FleetSubscriptionSerializer, SubscriptionBillingSerializer
from django.utils import timezone
from dateutil.relativedelta import relativedelta
from decimal import Decimal
import stripe
from django.conf import settings
import json

# Set Stripe API key
stripe.api_key = settings.STRIPE_SECRET_KEY


class SubscriptionView(APIView):
    """
    Fleet subscription lifecycle for fleet owners (Stripe trials, plans, billing).

    Action-routed via ``subscription/<action>/``. Fleet must exist and user must be
    ``is_fleet_owner``. Early-adopter trial logic applies to new subscriptions.
    """

    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    action_handlers = {
        'get_plans': 'get_plans',
        'get_current_subscription': 'get_current_subscription',
        'create_subscription': 'create_subscription',
        'get_subscription_billing_history': 'get_subscription_billing_history',
        'update_payment_method': 'update_payment_method',
        'cancel_subscription': 'cancel_subscription',
        'get_setup_intent': 'get_setup_intent',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action (get_plans, get_current_subscription, get_subscription_billing_history, get_setup_intent). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response(
                {'error': 'Invalid action'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def post(self, request, *args, **kwargs):
        """Route POST by action (create_subscription, update_payment_method, cancel_subscription). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response(
                {'error': 'Invalid action'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def get_plans(self, request):
        """Get all active subscription tiers"""
        try:
            # Get all active subscription tiers
            tiers = SubscriptionTier.objects.filter(is_active=True).order_by('monthlyPrice')
            
            # Transform data to match frontend interface
            plans_data = []
            for tier in tiers:
                plan = {
                    'id': str(tier.id),
                    'name': tier.name,
                    'tagLine': tier.tagLine or '',
                    'monthlyPrice': float(tier.monthlyPrice),
                    'yearlyPrice': float(tier.yearly_price),
                    'yearlyBillingText': tier.yearly_billing_text or '',
                    'badge': tier.badge or '',
                    'features': tier.features if tier.features else [],
                }
                plans_data.append(plan)
            
            return Response({
                'plans': plans_data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    def get_current_subscription(self, request):
        """Get current subscription for the authenticated fleet owner's fleet"""
        try:
            # Get the fleet owner from the authenticated user
            if not request.user.is_fleet_owner:
                return Response(
                    {'error': 'User is not a fleet owner'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get the fleet for this owner
            try:
                fleet = Fleet.objects.get(owner=request.user)
            except Fleet.DoesNotExist:
                return Response(
                    {'error': 'Fleet not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get the current subscription: prefer active/trialing/past_due, else most recent (any status)
            subscription = FleetSubscription.objects.filter(
                fleet=fleet,
                status__in=['active', 'trialing', 'past_due']
            ).select_related('plan', 'plan__tier').order_by('-created_at').first()

            if not subscription:
                # No active subscription: return most recent subscription if any (cancelled/expired/pending)
                subscription = FleetSubscription.objects.filter(
                    fleet=fleet
                ).select_related('plan', 'plan__tier').order_by('-created_at').first()

            if not subscription:
                # No subscription at all: tell frontend if they can start trial and if they'd get 2 months (early adopter)
                early_adopter_count = FleetSubscription.objects.filter(is_early_adopter=True).count()
                would_be_early_adopter = not fleet.has_used_trial and early_adopter_count < 20
                return Response({
                    'subscription': None,
                    'canStartTrial': not fleet.has_used_trial,
                    'isEarlyAdopter': would_be_early_adopter,
                }, status=status.HTTP_200_OK)

            # Serialize the subscription
            serializer = FleetSubscriptionSerializer(subscription)
            subscription_data = serializer.data

            # Map billing cycle: "yearly" -> "yearly", "monthly" -> "monthly"
            billing_cycle = subscription.plan.billing_cycle
            if billing_cycle not in ['monthly', 'yearly']:
                billing_cycle = 'monthly'

            # Map status for frontend: active, pending, trialing, past_due, canceled, expired
            subscription_status = subscription_data['status']
            if subscription_status == 'cancelled':
                subscription_status = 'canceled'

            # Calculate trial days remaining
            trial_days_remaining = None
            trial_end_date = None
            is_trialing = subscription.status == 'trialing'
            
            if subscription.trial_end_date:
                trial_end_date = subscription.trial_end_date.isoformat()
                if is_trialing and subscription.trial_end_date > timezone.now():
                    delta = subscription.trial_end_date - timezone.now()
                    trial_days_remaining = max(0, delta.days)
                elif is_trialing:
                    trial_days_remaining = 0

            # Build payment failure status
            payment_failure_status = None
            if subscription.status == 'past_due' or subscription.payment_failure_count > 0:
                payment_failure_status = {
                    'hasFailure': True,
                    'retryDate': subscription.last_payment_failure_date.isoformat() if subscription.last_payment_failure_date else None,
                    'gracePeriodUntil': subscription.grace_period_until.isoformat() if subscription.grace_period_until else None,
                    'failureCount': subscription.payment_failure_count,
                }

            # Build response data (id + extended statuses: active, pending, trialing, past_due, canceled, expired)
            response_data = {
                'subscription': {
                    'id': str(subscription.id),
                    'currentPlan': subscription.plan.tier.name if subscription.plan and subscription.plan.tier else None,
                    'status': subscription_status,
                    'renewsOn': subscription.end_date.isoformat() if subscription.end_date else None,
                    'billingCycle': billing_cycle,
                    'trialDaysRemaining': trial_days_remaining,
                    'trialEndDate': trial_end_date,
                    'isTrialing': is_trialing,
                    'canStartTrial': not fleet.has_used_trial,
                    'isEarlyAdopter': getattr(subscription, 'is_early_adopter', False),
                    'paymentFailureStatus': payment_failure_status,
                }
            }

            return Response(response_data, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    def get_subscription_billing_history(self, request):
        """Get billing history for the authenticated fleet owner's fleet"""
        try:
            # Get the fleet owner from the authenticated user
            if not request.user.is_fleet_owner:
                return Response(
                    {'error': 'User is not a fleet owner'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get the fleet for this owner
            try:
                fleet = Fleet.objects.get(owner=request.user)
            except Fleet.DoesNotExist:
                return Response(
                    {'error': 'Fleet not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get all billing records for the fleet's subscriptions
            billing_records = SubscriptionBilling.objects.filter(
                subscription__fleet=fleet
            ).select_related(
                'subscription',
                'subscription__plan',
                'subscription__plan__tier'
            ).order_by('-billing_date')

            # Serialize the billing records and enhance with subscription plan details
            enhanced_billing_data = []
            for billing_record in billing_records:
                billing_serializer = SubscriptionBillingSerializer(billing_record)
                billing_data = billing_serializer.data
                
                enhanced_record = {
                    **billing_data,
                    'subscription': {
                        'id': str(billing_record.subscription.id),
                        'plan': {
                            'id': str(billing_record.subscription.plan.id),
                            'name': billing_record.subscription.plan.name,
                            'tier': {
                                'id': str(billing_record.subscription.plan.tier.id),
                                'name': billing_record.subscription.plan.tier.name,
                            },
                            'billing_cycle': billing_record.subscription.plan.billing_cycle,
                        },
                    }
                }
                enhanced_billing_data.append(enhanced_record)

            return Response({
                'billing_history': enhanced_billing_data
            }, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    def create_subscription(self, request):
        """Create a new subscription for the authenticated fleet owner's fleet"""
        try:
            # Validate request data
            tier_id = request.data.get('tierId') or request.data.get('tier_id')
            billing_cycle = request.data.get('billingCycle') or request.data.get('billing_cycle')
            
            if not tier_id:
                return Response(
                    {'error': 'tierId is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if billing_cycle not in ['monthly', 'yearly']:
                return Response(
                    {'error': 'billingCycle must be "monthly" or "yearly"'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response(
                    {'error': 'User is not a fleet owner'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get fleet
            try:
                fleet = Fleet.objects.get(owner=request.user)
            except Fleet.DoesNotExist:
                return Response(
                    {'error': 'Fleet not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get tier
            try:
                tier = SubscriptionTier.objects.get(id=tier_id, is_active=True)
            except SubscriptionTier.DoesNotExist:
                return Response(
                    {'error': 'Subscription tier not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get or create subscription plan
            plan = self._get_or_create_subscription_plan(tier, billing_cycle)

            # Check if plan is free
            is_free = float(plan.price) == 0

            # Handle existing subscription
            self._handle_existing_subscription(fleet)

            # Determine trial eligibility and period
            trial_days = 0
            is_early_adopter = False
            
            if not is_free and not fleet.has_used_trial:
                # Check if this is an early adopter (first 20)
                early_adopter_count = FleetSubscription.objects.filter(is_early_adopter=True).count()
                is_early_adopter = early_adopter_count < 20
                trial_days = 60 if is_early_adopter else 30
                
                # Mark fleet as having used trial
                fleet.has_used_trial = True
                fleet.trial_used_date = timezone.now()
                fleet.save()

            # Calculate subscription dates
            dates = self._calculate_subscription_dates(billing_cycle)
            
            # Calculate trial dates if trial period applies
            trial_start_date = None
            trial_end_date = None
            if trial_days > 0:
                trial_start_date = timezone.now()
                trial_end_date = trial_start_date + relativedelta(days=trial_days)

            # Determine initial status
            if is_free:
                initial_status = 'active'
            elif trial_days > 0:
                initial_status = 'trialing'
            else:
                initial_status = 'pending'

            # For trialing subscriptions, end_date should match trial_end_date so "renewsOn" and trial end are consistent
            subscription_end_date = trial_end_date if trial_days > 0 else dates['end_date']

            # Create FleetSubscription with appropriate status
            subscription = FleetSubscription.objects.create(
                fleet=fleet,
                plan=plan,
                start_date=dates['start_date'],
                end_date=subscription_end_date,
                status=initial_status,
                auto_renew=True,
                is_early_adopter=is_early_adopter,
                trial_days=trial_days if trial_days > 0 else None,
                trial_start_date=trial_start_date,
                trial_end_date=trial_end_date,
            )

            # Create initial billing record
            billing = SubscriptionBilling.objects.create(
                subscription=subscription,
                amount=plan.price,
                billing_date=timezone.now(),
                status='paid' if is_free else 'pending',  # Free plans are paid immediately
            )

            # Map billing cycle for frontend
            frontend_billing_cycle = billing_cycle

            # For free plans, return immediately
            if is_free:
                return Response({
                    'message': 'Free subscription activated successfully',
                    'subscription': {
                        'currentPlan': tier.name,
                        'status': 'active',
                        'renewsOn': subscription.end_date.isoformat(),
                        'billingCycle': frontend_billing_cycle,
                    },
                    'billing': SubscriptionBillingSerializer(billing).data
                }, status=status.HTTP_201_CREATED)

            # For paid plans, create Stripe subscription
            payment_sheet = self._create_stripe_subscription(
                float(plan.price),
                subscription,
                billing,
                request.user,
                fleet,
                plan,
                trial_days
            )

            if not payment_sheet['success']:
                subscription.status = 'past_due'
                subscription.save()
                billing.status = 'failed'
                billing.save()
                return Response(
                    {
                        'error': 'Failed to create payment sheet',
                        'details': payment_sheet.get('error', 'Unknown error'),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Build response with payment sheet details
            response_data = {
                'message': 'Subscription created. Please complete payment setup.' if payment_sheet.get('is_trial') else 'Subscription created. Please complete payment.',
                'subscription': {
                    'id': str(subscription.id),
                    'currentPlan': tier.name,
                    'status': initial_status,
                    'renewsOn': subscription.end_date.isoformat(),
                    'billingCycle': frontend_billing_cycle,
                },
            }

            # Add payment sheet details (either payment_intent or setup_intent)
            if payment_sheet.get('is_trial'):
                response_data['paymentSheet'] = {
                    'setupIntent': payment_sheet.get('setup_intent'),
                    'ephemeralKey': payment_sheet.get('ephemeral_key'),
                    'customer': payment_sheet.get('customer'),
                }
                response_data['isTrial'] = True
            else:
                response_data['paymentSheet'] = {
                    'paymentIntent': payment_sheet.get('payment_intent'),
                    'ephemeralKey': payment_sheet.get('ephemeral_key'),
                    'customer': payment_sheet.get('customer'),
                }
                response_data['isTrial'] = False

            response_data['billing'] = SubscriptionBillingSerializer(billing).data

            return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception as e:
            import traceback
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _get_or_create_subscription_plan(self, tier, billing_cycle):
        """Get or create a SubscriptionPlan for the given tier and billing cycle"""
        plan, created = SubscriptionPlan.objects.get_or_create(
            tier=tier,
            billing_cycle=billing_cycle,
            defaults={
                'name': f"{tier.name} - {billing_cycle}",
                'price': tier.yearly_price if billing_cycle == 'yearly' else tier.monthlyPrice,
                'is_active': True,
            }
        )

        # Update price if plan already exists (in case tier prices changed)
        if not created:
            if billing_cycle == 'yearly':
                plan.price = tier.yearly_price
            else:
                plan.price = tier.monthlyPrice
            plan.save()
        
        return plan

    def _calculate_subscription_dates(self, billing_cycle):
        """Calculate subscription start and end dates"""
        now = timezone.now()
        
        # Calculate end date based on billing cycle
        if billing_cycle == 'monthly':
            end_date = now + relativedelta(months=1)
        elif billing_cycle == 'yearly':
            end_date = now + relativedelta(years=1)
        else:
            # Default to monthly
            end_date = now + relativedelta(months=1)
        
        return {
            'start_date': now,
            'end_date': end_date,
        }

    def _handle_existing_subscription(self, fleet):
        """Cancel existing active subscriptions for the fleet"""
        existing_subscriptions = FleetSubscription.objects.filter(
            fleet=fleet,
            status='active'
        )
        
        for existing in existing_subscriptions:
            existing.status = 'cancelled'
            existing.cancellation_date = timezone.now()
            existing.cancellation_reason = 'Replaced by new subscription'
            existing.save()

    def _create_stripe_subscription(self, amount, subscription, billing, user, fleet, plan, trial_days=0):
        """Create Stripe Subscription for subscription payment"""
        try:
            # Get currency (default to EUR, can be customized)
            currency = 'eur'
            
            # Get or create Stripe customer
            if hasattr(user, 'stripe_customer_id') and user.stripe_customer_id:
                try:
                    customer = stripe.Customer.retrieve(user.stripe_customer_id)
                except stripe.error.InvalidRequestError:
                    # Customer doesn't exist in Stripe, create new one
                    customer = stripe.Customer.create(
                        email=user.email,
                        name=user.name,
                        metadata={
                            'user_id': str(user.id),
                            'fleet_id': str(fleet.id),
                        }
                    )
                    user.stripe_customer_id = customer.id
                    user.save()
            else:
                customer = stripe.Customer.create(
                    email=user.email,
                    name=user.name,
                    metadata={
                        'user_id': str(user.id),
                        'fleet_id': str(fleet.id),
                    }
                )
                user.stripe_customer_id = customer.id
                user.save()
            
            # Convert amount to cents
            amount_in_cents = int(float(amount) * 100)
            
            # Determine recurring interval based on billing cycle
            interval = 'month' if plan.billing_cycle == 'monthly' else 'year'
            
            # Create Stripe Price
            price = stripe.Price.create(
                unit_amount=amount_in_cents,
                currency=currency,
                recurring={
                    'interval': interval,
                },
                product_data={
                    'name': f"{plan.tier.name} Subscription",
                }
            )
            
            # Create Stripe Subscription
            subscription_params = {
                'customer': customer.id,
                'items': [{'price': price.id}],
                'metadata': {
                    'user_id': str(user.id),
                    'fleet_id': str(fleet.id),
                    'subscription_id': str(subscription.id),
                    'billing_id': str(billing.id),
                    'type': 'fleet_subscription',
                },
                'payment_behavior': 'default_incomplete',
                'payment_settings': {'save_default_payment_method': 'on_subscription'},
                # Disable automatic tax since prices already include VAT
                'automatic_tax': {'enabled': False},
                # Ensure invoices are automatically sent (controlled by Dashboard, but explicit)
                'collection_method': 'charge_automatically',  # Automatically charge and send invoice
                'expand': ['latest_invoice.payment_intent'],
            }
            
            # Add trial period if applicable
            if trial_days > 0:
                subscription_params['trial_period_days'] = trial_days
            
            stripe_subscription = stripe.Subscription.create(**subscription_params)
            
            # Store Stripe subscription ID in subscription
            subscription.stripe_subscription_id = stripe_subscription.id
            subscription.save()
            
            # Handle latest_invoice - it might be a string ID or an object
            latest_invoice = stripe_subscription.latest_invoice
            
            if not latest_invoice:
                return {
                    'success': False,
                    'error': 'Latest invoice not available on subscription',
                }
            
            # Always get invoice by ID with payment_intent expanded so we use the invoice's
            # PaymentIntent (Stripe then marks the subscription active when it's paid).
            invoice_id = latest_invoice if isinstance(latest_invoice, str) else getattr(latest_invoice, 'id', None)
            if not invoice_id:
                return {'success': False, 'error': 'Latest invoice ID not available'}
            invoice = stripe.Invoice.retrieve(invoice_id, expand=['payment_intent'])
            
            # Store payment intent ID in billing for webhook lookup
            payment_intent = getattr(invoice, 'payment_intent', None)
            if payment_intent:
                billing.transaction_id = payment_intent if isinstance(payment_intent, str) else payment_intent.id
                billing.save()
            
            # Create ephemeral key
            ephemeral_key = stripe.EphemeralKey.create(
                customer=customer.id,
                stripe_version='2022-11-15',
            )
            
            invoice_amount = invoice.amount_due or invoice.total or 0
            is_trial_subscription = trial_days > 0 and invoice_amount == 0
            
            # If invoice has no PaymentIntent yet (e.g. not finalized), finalize and retry
            if not payment_intent and invoice_amount > 0 and invoice.status == 'draft':
                try:
                    stripe.Invoice.finalize_invoice(invoice.id)
                    invoice = stripe.Invoice.retrieve(invoice_id, expand=['payment_intent'])
                    payment_intent = getattr(invoice, 'payment_intent', None)
                    if payment_intent:
                        billing.transaction_id = payment_intent.id if hasattr(payment_intent, 'id') else payment_intent
                        billing.save()
                except stripe.error.InvalidRequestError as e:
                    pass  # leave payment_intent as-is and fall through

            if not payment_intent:
                if is_trial_subscription:
                    # For trial subscriptions, use SetupIntent to collect payment method
                    # without charging immediately
                    try:
                        setup_intent = stripe.SetupIntent.create(
                            customer=customer.id,
                            payment_method_types=['card'],
                            metadata={
                                'user_id': str(user.id),
                                'fleet_id': str(fleet.id),
                                'subscription_id': str(subscription.id),
                                'billing_id': str(billing.id),
                                'stripe_subscription_id': stripe_subscription.id,
                                'invoice_id': invoice.id,
                                'type': 'fleet_subscription',
                            },
                            description=f"{plan.tier.name} Subscription - {plan.billing_cycle} (Trial)",
                        )
                        
                        # Store setup intent ID for reference
                        billing.transaction_id = setup_intent.id
                        billing.save()
                        
                        # Return setup intent instead of payment intent
                        return {
                            'success': True,
                            'setup_intent': setup_intent.client_secret,
                            'ephemeral_key': ephemeral_key.secret,
                            'customer': customer.id,
                            'is_trial': True,
                        }
                        
                    except Exception as e:
                        import traceback
                        traceback.print_exc()
                        return {
                            'success': False,
                            'error': f'Failed to create setup intent: {str(e)}',
                        }
                else:
                    # For non-trial subscriptions, create PaymentIntent as before
                    try:
                        payment_intent = stripe.PaymentIntent.create(
                            amount=invoice_amount,
                            currency=currency,
                            customer=customer.id,
                            receipt_email=user.email,
                            metadata={
                                'user_id': str(user.id),
                                'fleet_id': str(fleet.id),
                                'subscription_id': str(subscription.id),
                                'billing_id': str(billing.id),
                                'stripe_subscription_id': stripe_subscription.id,
                                'invoice_id': invoice.id,
                                'type': 'fleet_subscription',
                            },
                            description=f"{plan.tier.name} Subscription - {plan.billing_cycle}",
                        )
                        
                        billing.transaction_id = payment_intent.id
                        billing.save()
                        
                    except Exception as e:
                        import traceback
                        traceback.print_exc()
                        return {
                            'success': False,
                            'error': f'Failed to create payment intent: {str(e)}',
                        }
            
            # Get client secret - payment_intent might be a string ID or an object
            if isinstance(payment_intent, str):
                pi = stripe.PaymentIntent.retrieve(payment_intent)
                payment_intent_client_secret = pi.client_secret
            else:
                payment_intent_client_secret = payment_intent.client_secret
            
            return {
                'success': True,
                'payment_intent': payment_intent_client_secret,
                'ephemeral_key': ephemeral_key.secret,
                'customer': customer.id,
                'is_trial': False,
            }
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e),
            }

    def update_payment_method(self, request):
        """Update payment method for the current subscription"""
        try:
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response(
                    {'error': 'User is not a fleet owner'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get fleet
            try:
                fleet = Fleet.objects.get(owner=request.user)
            except Fleet.DoesNotExist:
                return Response(
                    {'error': 'Fleet not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get current subscription
            subscription = FleetSubscription.objects.filter(
                fleet=fleet,
                status__in=['active', 'trialing', 'past_due']
            ).order_by('-created_at').first()

            if not subscription or not subscription.stripe_subscription_id:
                return Response(
                    {'error': 'No active subscription found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get payment method ID from request
            payment_method_id = request.data.get('payment_method_id')
            if not payment_method_id:
                return Response(
                    {'error': 'payment_method_id is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Update subscription payment method in Stripe
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                default_payment_method=payment_method_id,
            )

            if getattr(request.user, 'allow_email_notifications', True):
                from main.tasks import send_payment_method_updated_email

                send_payment_method_updated_email.delay(request.user.email, fleet.name)

            return Response({
                'message': 'Payment method updated successfully'
            }, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    def cancel_subscription(self, request):
        """Cancel the current subscription"""
        try:
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response(
                    {'error': 'User is not a fleet owner'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get fleet
            try:
                fleet = Fleet.objects.get(owner=request.user)
            except Fleet.DoesNotExist:
                return Response(
                    {'error': 'Fleet not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get current subscription
            subscription = FleetSubscription.objects.filter(
                fleet=fleet,
                status__in=['active', 'trialing', 'past_due']
            ).order_by('-created_at').first()

            if not subscription or not subscription.stripe_subscription_id:
                return Response(
                    {'error': 'No active subscription found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get cancel_at_period_end from request (default to True)
            cancel_at_period_end = request.data.get('cancel_at_period_end', True)

            # Cancel subscription in Stripe
            if cancel_at_period_end:
                # Cancel at period end (keep access until end of billing period)
                stripe.Subscription.modify(
                    subscription.stripe_subscription_id,
                    cancel_at_period_end=True,
                )
                # Update local status
                subscription.auto_renew = False
                subscription.save()
            else:
                # Cancel immediately
                stripe.Subscription.delete(subscription.stripe_subscription_id)
                # Update local status (webhook will handle the rest, but update immediately)
                subscription.status = 'cancelled'
                subscription.cancellation_date = timezone.now()
                subscription.cancellation_reason = 'Cancelled by user'
                subscription.save()

            return Response({
                'message': 'Subscription cancelled successfully',
                'cancel_at_period_end': cancel_at_period_end
            }, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    def get_setup_intent(self, request):
        """Get SetupIntent for updating payment method"""
        try:
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response(
                    {'error': 'User is not a fleet owner'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get fleet
            try:
                fleet = Fleet.objects.get(owner=request.user)
            except Fleet.DoesNotExist:
                return Response(
                    {'error': 'Fleet not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get current subscription
            subscription = FleetSubscription.objects.filter(
                fleet=fleet,
                status__in=['active', 'trialing', 'past_due']
            ).order_by('-created_at').first()

            if not subscription or not subscription.stripe_subscription_id:
                return Response(
                    {'error': 'No active subscription found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get or create Stripe customer
            if not request.user.stripe_customer_id:
                return Response(
                    {'error': 'No Stripe customer found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Create SetupIntent for collecting payment method
            setup_intent = stripe.SetupIntent.create(
                customer=request.user.stripe_customer_id,
                payment_method_types=['card'],
                metadata={
                    'user_id': str(request.user.id),
                    'fleet_id': str(fleet.id),
                    'subscription_id': str(subscription.id),
                    'type': 'update_payment_method',
                },
            )

            # Create ephemeral key
            ephemeral_key = stripe.EphemeralKey.create(
                customer=request.user.stripe_customer_id,
                stripe_version='2022-11-15',
            )

            return Response({
                'setupIntent': setup_intent.client_secret,
                'ephemeralKey': ephemeral_key.secret,
                'customer': request.user.stripe_customer_id,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
