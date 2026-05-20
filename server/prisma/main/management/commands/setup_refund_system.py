"""
Management command: python manage.py setup_refund_system

Verifies PaymentTransaction and RefundRecord models are ready; prints next steps for migrations.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from main.models import PaymentTransaction, RefundRecord

class Command(BaseCommand):
    """
    Verify ``PaymentTransaction`` and ``RefundRecord`` models are reachable after migrations.

    Does not create schema; prints next steps when tables are missing.
    """

    help = 'Setup refund system - creates database tables and verifies setup'

    def handle(self, *args, **options):
        """
        Run lightweight ORM counts inside a transaction to confirm refund tables exist.

        Args:
            *args: Unused positional args from Django.
            **options: Unused command options.

        Returns:
            None
        """
        self.stdout.write(self.style.SUCCESS('Setting up refund system...'))
        
        try:
            # Test database connection and table creation
            with transaction.atomic():
                # Test PaymentTransaction model
                PaymentTransaction.objects.all().count()
                self.stdout.write(self.style.SUCCESS('✓ PaymentTransaction model is ready'))
                
                # Test RefundRecord model
                RefundRecord.objects.all().count()
                self.stdout.write(self.style.SUCCESS('✓ RefundRecord model is ready'))
                
            self.stdout.write(self.style.SUCCESS('\n🎉 Refund system setup completed successfully!'))
            self.stdout.write(self.style.SUCCESS('\nNext steps:'))
            self.stdout.write('1. Run: python manage.py makemigrations')
            self.stdout.write('2. Run: python manage.py migrate')
            self.stdout.write('3. Update your Stripe webhook to include these events:')
            self.stdout.write('   - payment_intent.succeeded')
            self.stdout.write('   - refund.succeeded')
            self.stdout.write('   - refund.failed')
            self.stdout.write('   - charge.dispute.created')
            self.stdout.write('4. Test the refund flow with a test booking')
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error setting up refund system: {str(e)}'))
            self.stdout.write(self.style.ERROR('Please run migrations first: python manage.py makemigrations && python manage.py migrate'))
