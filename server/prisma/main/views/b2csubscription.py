"""
B2C consumer subscription API: plans, subscribe (paid-only), billing history, cancel, payment method.

Mirrors Stripe flow patterns from main.views.subcription.SubscriptionView without fleet entities.
"""
import stripe
from dateutil.relativedelta import relativedelta

from django.conf import settings
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from main.models import (
    B2CSubcriptionTier,
    B2CSubcriptionPlan,
    B2CSubcription,
    B2CSubcriptionBilling,
)
from main.serializer import (
    B2CSubscriptionBillingSerializer,
    B2CSubscriptionSerializer,
)

stripe.api_key = settings.STRIPE_SECRET_KEY


class B2CSubscriptionView(APIView):
    """
    B2C consumer subscription lifecycle (paid Stripe subscriptions, no fleet entities).

    Action-routed via ``b2c-subscription/<action>/``. Mirrors fleet SubscriptionView
    patterns: plans, subscribe, billing history, payment method, cancel, abandon checkout.
    """

    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    action_handlers = {
        'get_plans': 'get_plans',
        'get_current_subscription': 'get_current_subscription',
        'get_subscription_billing_history': 'get_subscription_billing_history',
        'get_setup_intent': 'get_setup_intent',
        'create_subscription': 'create_subscription',
        'update_payment_method': 'update_payment_method',
        'cancel_subscription': 'cancel_subscription',
        'abandon_incomplete_subscription': 'abandon_incomplete_subscription',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action (plans, current subscription, billing history, setup intent)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def post(self, request, *args, **kwargs):
        """Route POST by action (create_subscription, update_payment_method)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def patch(self, request, *args, **kwargs):
        """Route PATCH by action (update_payment_method)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def delete(self, request, *args, **kwargs):
        """Route DELETE by action (cancel_subscription, abandon_incomplete_subscription)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def get_plans(self, request):
        """Return all B2C subscription tiers with sedan and SUV/MPV list prices."""
        try:
            tiers = B2CSubcriptionTier.objects.all().order_by('monthlyPrice')
            plans_data = []
            for tier in tiers:
                sedan_monthly = float(tier.monthlyPriceSedan)
                sedan_yearly = float(tier.yearly_price_sedan)
                suv_monthly = float(tier.monthlyPrice)
                suv_yearly = float(tier.yearly_price)
                plans_data.append({
                    'id': str(tier.id),
                    'name': tier.name,
                    'tagLine': tier.tagLine or '',
                    # Legacy fields: SUV/MPV prices (unchanged for older clients).
                    'monthlyPrice': suv_monthly,
                    'yearlyPrice': suv_yearly,
                    'yearlyBillingText': '',
                    'badge': tier.badge or '',
                    'features': tier.features if tier.features else [],
                    'serviceDiscountPercent': int(tier.service_discount_percent or 0),
                    'maxComplimentaryWashes': int(tier.max_complimentary_washes or 0),
                    'pricesByVehicleCategory': {
                        B2CSubcriptionTier.VEHICLE_CATEGORY_SEDAN: {
                            'monthlyPrice': sedan_monthly,
                            'yearlyPrice': sedan_yearly,
                        },
                        B2CSubcriptionTier.VEHICLE_CATEGORY_SUV_MPV: {
                            'monthlyPrice': suv_monthly,
                            'yearlyPrice': suv_yearly,
                        },
                    },
                })
            return Response({'plans': plans_data}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_current_subscription(self, request):
        """Return active/pending/past_due subscription for user, or most recent if none active."""
        try:
            subscription = (
                B2CSubcription.objects.filter(
                    user=request.user,
                    status__in=['active', 'pending', 'past_due'],
                )
                .select_related('plan', 'plan__tier')
                .order_by('-start_date')
                .first()
            )
            if not subscription:
                subscription = (
                    B2CSubcription.objects.filter(user=request.user)
                    .select_related('plan', 'plan__tier')
                    .order_by('-start_date')
                    .first()
                )
            if not subscription:
                return Response({'subscription': None}, status=status.HTTP_200_OK)

            from main.utils.subscription_sync import (
                latest_paid_billing_at,
                sync_local_subscription_from_stripe,
            )
            stripe_snap = sync_local_subscription_from_stripe(subscription)
            last_paid = latest_paid_billing_at(subscription)

            billing_cycle = subscription.plan.billing_cycle
            status_map = subscription.status
            frontend_status = 'canceled' if status_map == 'cancelled' else status_map
            is_trialing = bool(stripe_snap.get('is_trialing'))
            trial_end = subscription.end_date if is_trialing else None
            trial_days_remaining = None
            if is_trialing and trial_end:
                if trial_end > timezone.now():
                    trial_days_remaining = max(0, (trial_end - timezone.now()).days)
                else:
                    trial_days_remaining = 0

            return Response({
                'subscription': {
                    'id': str(subscription.id),
                    'currentPlan': subscription.plan.tier.name if subscription.plan.tier else None,
                    'status': frontend_status,
                    'renewsOn': subscription.end_date.isoformat() if subscription.end_date else None,
                    'billingCycle': billing_cycle if billing_cycle in ('monthly', 'yearly') else 'monthly',
                    'vehicleCategory': (
                        subscription.plan.vehicle_category
                        if subscription.plan
                        else B2CSubcriptionPlan.VEHICLE_CATEGORY_SUV_MPV
                    ),
                    'trialDaysRemaining': trial_days_remaining,
                    'trialEndDate': trial_end.isoformat() if trial_end else None,
                    'isTrialing': is_trialing,
                    'lastPaidOn': last_paid.isoformat() if last_paid else None,
                    'paymentFailureStatus': None,
                    'serialized': B2CSubscriptionSerializer(subscription).data,
                },
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_subscription_billing_history(self, request):
        """Return billing records for all of the user's B2C subscriptions."""
        try:
            records = (
                B2CSubcriptionBilling.objects.filter(subscription__user=request.user)
                .select_related('subscription', 'subscription__plan', 'subscription__plan__tier')
                .order_by('-billing_date')
            )
            return Response(
                {'billing_history': B2CSubscriptionBillingSerializer(records, many=True).data},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def _calculate_subscription_dates(self, billing_cycle):
        """Compute start_date and end_date for monthly or yearly billing cycle."""
        now = timezone.now()
        if billing_cycle == 'monthly':
            end_date = now + relativedelta(months=1)
        elif billing_cycle == 'yearly':
            end_date = now + relativedelta(years=1)
        else:
            end_date = now + relativedelta(months=1)
        return {'start_date': now, 'end_date': end_date}

    def _get_or_create_b2c_plan(self, tier, billing_cycle, vehicle_category=None):
        """Get or create B2CSubcriptionPlan for tier + cycle + vehicle category; sync price from tier."""
        category = vehicle_category or B2CSubcriptionPlan.VEHICLE_CATEGORY_SUV_MPV
        defaults_price = tier.list_price(category, billing_cycle)
        plan, created = B2CSubcriptionPlan.objects.get_or_create(
            tier=tier,
            billing_cycle=billing_cycle,
            vehicle_category=category,
            defaults={'price': defaults_price},
        )
        if not created:
            plan.price = tier.list_price(category, billing_cycle)
            plan.save(update_fields=['price', 'updated_at'])
        return plan

    def _conflicting_subscription_exists(self, user):
        """True if user already has pending, active, or past_due B2C subscription."""
        return B2CSubcription.objects.filter(
            user=user,
            status__in=('pending', 'active', 'past_due'),
        ).exists()

    def abandon_incomplete_subscription(self, request):
        """
        Remove a pending (unpaid checkout) subscription so the user can start again.
        Used when the client payment sheet is closed without paying.
        """
        try:
            subscription_id = (
                request.data.get('subscriptionId')
                or request.data.get('subscription_id')
            )
            qs = B2CSubcription.objects.filter(user=request.user, status='pending')
            if subscription_id:
                subscription = qs.filter(id=subscription_id).first()
            else:
                subscription = qs.order_by('-start_date').first()

            if not subscription:
                return Response(
                    {'message': 'No incomplete subscription to remove.'},
                    status=status.HTTP_200_OK,
                )

            if subscription.stripe_subscription_id:
                try:
                    stripe.Subscription.delete(subscription.stripe_subscription_id)
                except stripe.error.InvalidRequestError:
                    pass

            now = timezone.now()
            subscription.status = 'cancelled'
            subscription.cancellation_date = now
            subscription.cancellation_reason = subscription.cancellation_reason or 'Checkout abandoned'
            subscription.auto_renew = False
            subscription.save(
                update_fields=[
                    'status',
                    'cancellation_date',
                    'cancellation_reason',
                    'auto_renew',
                ]
            )

            B2CSubcriptionBilling.objects.filter(
                subscription=subscription,
                status='pending',
            ).update(status='failed')

            return Response(
                {'message': 'Incomplete subscription removed.'},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def _create_stripe_b2c_subscription(self, amount, subscription, billing, user, plan):
        """Paid-only Stripe subscription (no trial). Mirrors fleet SubscriptionView pattern."""
        try:
            currency = 'eur'

            if getattr(user, 'stripe_customer_id', None):
                try:
                    customer = stripe.Customer.retrieve(user.stripe_customer_id)
                except stripe.error.InvalidRequestError:
                    customer = stripe.Customer.create(
                        email=user.email,
                        name=user.name,
                        metadata={'user_id': str(user.id)},
                    )
                    user.stripe_customer_id = customer.id
                    user.save(update_fields=['stripe_customer_id'])
            else:
                customer = stripe.Customer.create(
                    email=user.email,
                    name=user.name,
                    metadata={'user_id': str(user.id)},
                )
                user.stripe_customer_id = customer.id
                user.save(update_fields=['stripe_customer_id'])

            amount_in_cents = int(float(amount) * 100)
            interval = 'month' if plan.billing_cycle == 'monthly' else 'year'
            category_label = plan.get_vehicle_category_display()
            product_name = (
                f"{plan.tier.name} — {category_label} "
                f"({plan.billing_cycle}) Subscription (consumer)"
            )
            price = stripe.Price.create(
                unit_amount=amount_in_cents,
                currency=currency,
                recurring={'interval': interval},
                product_data={'name': product_name},
            )

            stripe_subscription = stripe.Subscription.create(
                customer=customer.id,
                items=[{'price': price.id}],
                metadata={
                    'user_id': str(user.id),
                    'subscription_id': str(subscription.id),
                    'billing_id': str(billing.id),
                    'type': 'b2c_subscription',
                    'vehicle_category': plan.vehicle_category,
                },
                payment_behavior='default_incomplete',
                payment_settings={'save_default_payment_method': 'on_subscription'},
                automatic_tax={'enabled': False},
                collection_method='charge_automatically',
                expand=['latest_invoice.payment_intent'],
            )

            subscription.stripe_subscription_id = stripe_subscription.id
            subscription.save(update_fields=['stripe_subscription_id'])

            latest_invoice = stripe_subscription.latest_invoice
            if not latest_invoice:
                return {'success': False, 'error': 'Latest invoice not available on subscription'}

            invoice_id = latest_invoice if isinstance(latest_invoice, str) else getattr(latest_invoice, 'id', None)
            if not invoice_id:
                return {'success': False, 'error': 'Latest invoice ID not available'}
            invoice = stripe.Invoice.retrieve(invoice_id, expand=['payment_intent'])

            payment_intent = getattr(invoice, 'payment_intent', None)
            if payment_intent:
                billing.transaction_id = payment_intent if isinstance(payment_intent, str) else payment_intent.id
                billing.save(update_fields=['transaction_id'])

            ephemeral_key = stripe.EphemeralKey.create(
                customer=customer.id,
                stripe_version='2022-11-15',
            )

            invoice_amount = invoice.amount_due or invoice.total or 0
            if not payment_intent and invoice_amount > 0 and invoice.status == 'draft':
                try:
                    stripe.Invoice.finalize_invoice(invoice.id)
                    invoice = stripe.Invoice.retrieve(invoice_id, expand=['payment_intent'])
                    payment_intent = getattr(invoice, 'payment_intent', None)
                    if payment_intent:
                        billing.transaction_id = payment_intent.id if hasattr(payment_intent, 'id') else payment_intent
                        billing.save(update_fields=['transaction_id'])
                except stripe.error.InvalidRequestError:
                    pass

            if not payment_intent:
                try:
                    payment_intent = stripe.PaymentIntent.create(
                        amount=invoice_amount,
                        currency=currency,
                        customer=customer.id,
                        receipt_email=user.email,
                        metadata={
                            'user_id': str(user.id),
                            'subscription_id': str(subscription.id),
                            'billing_id': str(billing.id),
                            'stripe_subscription_id': stripe_subscription.id,
                            'invoice_id': invoice.id,
                            'type': 'b2c_subscription',
                            'vehicle_category': plan.vehicle_category,
                        },
                        description=(
                            f"{plan.tier.name} B2C — {category_label} — {plan.billing_cycle}"
                        ),
                    )
                    billing.transaction_id = payment_intent.id
                    billing.save(update_fields=['transaction_id'])
                except Exception as exc:
                    return {'success': False, 'error': str(exc)}

            if isinstance(payment_intent, str):
                pi = stripe.PaymentIntent.retrieve(payment_intent)
                client_secret = pi.client_secret
            else:
                client_secret = payment_intent.client_secret

            return {
                'success': True,
                'payment_intent': client_secret,
                'ephemeral_key': ephemeral_key.secret,
                'customer': customer.id,
                'is_trial': False,
            }
        except Exception as exc:
            return {'success': False, 'error': str(exc)}

    def create_subscription(self, request):
        """
        Start B2C subscription: free tier activates immediately; paid tier returns Stripe payment sheet.

        Expects tierId, billingCycle (monthly|yearly), and vehicleCategory (sedan|suv_mpv).
        vehicleCategory defaults to suv_mpv for older clients. Creates pending subscription +
        billing row for the paid path.
        """
        try:
            tier_id = request.data.get('tierId') or request.data.get('tier_id')
            billing_cycle = request.data.get('billingCycle') or request.data.get('billing_cycle')
            vehicle_category = (
                request.data.get('vehicleCategory')
                or request.data.get('vehicle_category')
                or B2CSubcriptionPlan.VEHICLE_CATEGORY_SUV_MPV
            )

            if not tier_id:
                return Response({'error': 'tierId is required'}, status=status.HTTP_400_BAD_REQUEST)
            if billing_cycle not in ('monthly', 'yearly'):
                return Response(
                    {'error': 'billingCycle must be "monthly" or "yearly"'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            valid_categories = {
                B2CSubcriptionPlan.VEHICLE_CATEGORY_SEDAN,
                B2CSubcriptionPlan.VEHICLE_CATEGORY_SUV_MPV,
            }
            if vehicle_category not in valid_categories:
                return Response(
                    {'error': 'vehicleCategory must be "sedan" or "suv_mpv"'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                tier = B2CSubcriptionTier.objects.get(id=tier_id)
            except B2CSubcriptionTier.DoesNotExist:
                return Response({'error': 'Subscription tier not found'}, status=status.HTTP_404_NOT_FOUND)

            if self._conflicting_subscription_exists(request.user):
                return Response(
                    {'error': 'You already have a subscription pending or active. Cancel it before starting a new one.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            plan = self._get_or_create_b2c_plan(tier, billing_cycle, vehicle_category)
            is_free = float(plan.price) == 0
            dates = self._calculate_subscription_dates(billing_cycle)

            subscription = B2CSubcription.objects.create(
                user=request.user,
                plan=plan,
                start_date=dates['start_date'],
                end_date=dates['end_date'],
                status='active' if is_free else 'pending',
                auto_renew=True,
            )
            billing = B2CSubcriptionBilling.objects.create(
                subscription=subscription,
                amount=plan.price,
                billing_date=timezone.now(),
                status='paid' if is_free else 'pending',
            )

            if is_free:
                return Response({
                    'message': 'Free subscription activated successfully',
                    'subscription': {
                        'currentPlan': tier.name,
                        'status': 'active',
                        'renewsOn': subscription.end_date.isoformat(),
                        'billingCycle': billing_cycle,
                        'vehicleCategory': vehicle_category,
                    },
                    'billing': B2CSubscriptionBillingSerializer(billing).data,
                }, status=status.HTTP_201_CREATED)

            payment_sheet = self._create_stripe_b2c_subscription(
                float(plan.price),
                subscription,
                billing,
                request.user,
                plan,
            )
            if not payment_sheet['success']:
                subscription.status = 'past_due'
                subscription.save(update_fields=['status'])
                billing.status = 'failed'
                billing.save(update_fields=['status'])
                return Response(
                    {
                        'error': 'Failed to create payment sheet',
                        'details': payment_sheet.get('error', 'Unknown error'),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            return Response(
                {
                    'message': 'Subscription created. Please complete payment.',
                    'subscription': {
                        'id': str(subscription.id),
                        'currentPlan': tier.name,
                        'status': 'pending',
                        'renewsOn': subscription.end_date.isoformat(),
                        'billingCycle': billing_cycle,
                        'vehicleCategory': vehicle_category,
                    },
                    'paymentSheet': {
                        'paymentIntent': payment_sheet.get('payment_intent'),
                        'ephemeralKey': payment_sheet.get('ephemeral_key'),
                        'customer': payment_sheet.get('customer'),
                    },
                    'billing': B2CSubscriptionBillingSerializer(billing).data,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


    def update_payment_method(self, request):
        """Attach new default payment method on Stripe subscription; optional confirmation email."""
        try:
            subscription = (
                B2CSubcription.objects.filter(
                    user=request.user,
                    status__in=['active', 'pending', 'past_due'],
                )
                .order_by('-start_date')
                .first()
            )

            if not subscription or not subscription.stripe_subscription_id:
                return Response(
                    {'error': 'No active subscription found'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            payment_method_id = request.data.get('payment_method_id')
            if not payment_method_id:
                return Response(
                    {'error': 'payment_method_id is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                default_payment_method=payment_method_id,
            )

            if getattr(request.user, 'allow_email_notifications', True):
                from main.tasks.b2c.subscription_emails import (
                    send_b2c_subscription_payment_method_updated_email,
                )

                send_b2c_subscription_payment_method_updated_email.delay(
                    request.user.email,
                    request.user.name or '',
                )

            return Response({'message': 'Payment method updated successfully'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_setup_intent(self, request):
        """Return Stripe SetupIntent client secret for in-app card collection (update payment method)."""
        try:
            subscription = (
                B2CSubcription.objects.filter(
                    user=request.user,
                    status__in=['active', 'pending', 'past_due'],
                )
                .order_by('-start_date')
                .first()
            )

            if not subscription or not subscription.stripe_subscription_id:
                return Response(
                    {'error': 'No active subscription found'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if not request.user.stripe_customer_id:
                return Response(
                    {'error': 'No Stripe customer found'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            setup_intent = stripe.SetupIntent.create(
                customer=request.user.stripe_customer_id,
                payment_method_types=['card'],
                metadata={
                    'user_id': str(request.user.id),
                    'subscription_id': str(subscription.id),
                    'type': 'update_payment_method',
                    'subscription_kind': 'b2c_subscription',
                },
            )
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
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def cancel_subscription(self, request):
        """
        Cancel B2C subscription at period end or immediately.

        Pending (unpaid checkout) subscriptions are always cancelled immediately on Stripe.
        """
        try:
            subscription = (
                B2CSubcription.objects.filter(
                    user=request.user,
                    status__in=['active', 'pending', 'past_due'],
                )
                .order_by('-start_date')
                .first()
            )

            if not subscription:
                return Response(
                    {'error': 'Subscription is not active'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            cancel_at_period_end = request.data.get('cancel_at_period_end', True)
            cancellation_reason = request.data.get('cancellationReason') or request.data.get('cancellation_reason')
            cancellation_reason = cancellation_reason or 'Cancelled by user'

            # Pending = unpaid checkout; always release immediately (no billing period yet).
            if subscription.status == 'pending':
                cancel_at_period_end = False

            if subscription.stripe_subscription_id:
                # Stripe may have already lost track of this subscription (deleted directly
                # on Stripe, test-mode data reset, key/mode mismatch, etc.). Treat "no such
                # subscription" as already-cancelled instead of failing the request.
                stripe_gone = False
                if cancel_at_period_end:
                    try:
                        stripe.Subscription.modify(
                            subscription.stripe_subscription_id,
                            cancel_at_period_end=True,
                        )
                    except stripe.error.InvalidRequestError as exc:
                        if 'No such subscription' not in str(exc):
                            raise
                        stripe_gone = True
                    if stripe_gone:
                        subscription.status = 'cancelled'
                        subscription.cancellation_date = timezone.now()
                        subscription.cancellation_reason = cancellation_reason
                        subscription.auto_renew = False
                        subscription.save(
                            update_fields=[
                                'status',
                                'cancellation_date',
                                'cancellation_reason',
                                'auto_renew',
                            ]
                        )
                    else:
                        subscription.auto_renew = False
                        subscription.cancellation_reason = cancellation_reason
                        subscription.save(update_fields=['auto_renew', 'cancellation_reason'])
                else:
                    try:
                        stripe.Subscription.delete(subscription.stripe_subscription_id)
                    except stripe.error.InvalidRequestError as exc:
                        if 'No such subscription' not in str(exc):
                            raise
                    subscription.status = 'cancelled'
                    subscription.cancellation_date = timezone.now()
                    subscription.cancellation_reason = cancellation_reason
                    subscription.auto_renew = False
                    subscription.save(update_fields=['status', 'cancellation_date', 'cancellation_reason', 'auto_renew'])
            else:
                subscription.status = 'cancelled'
                subscription.cancellation_date = timezone.now()
                subscription.cancellation_reason = cancellation_reason
                subscription.auto_renew = False
                subscription.save(update_fields=['status', 'cancellation_date', 'cancellation_reason', 'auto_renew'])
                if getattr(request.user, 'allow_email_notifications', True):
                    from main.tasks.b2c.subscription_emails import (
                        send_b2c_subscription_cancelled_email,
                    )

                    plan_nm = (
                        subscription.plan.tier.name
                        if subscription.plan and subscription.plan.tier
                        else 'Subscription'
                    )
                    cancel_disp = timezone.localtime(subscription.cancellation_date).strftime('%B %d, %Y')
                    until_disp = (
                        timezone.localtime(subscription.end_date).strftime('%B %d, %Y')
                        if subscription.end_date
                        else 'the end of your billing period'
                    )
                    send_b2c_subscription_cancelled_email.delay(
                        request.user.email,
                        request.user.name or '',
                        plan_nm,
                        cancel_disp,
                        until_disp,
                    )

            return Response({'message': 'Subscription cancelled successfully'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
