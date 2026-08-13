import unittest

from main.utils.subscription_invoice import subscription_invoice_is_renewal


class SubscriptionInvoiceRenewalTests(unittest.TestCase):
    def test_subscription_create_is_initial(self):
        self.assertFalse(subscription_invoice_is_renewal("subscription_create"))
        self.assertFalse(subscription_invoice_is_renewal("subscription_create", True))

    def test_cycle_and_update_are_renewals(self):
        self.assertTrue(subscription_invoice_is_renewal("subscription_cycle"))
        self.assertTrue(subscription_invoice_is_renewal("subscription_update"))
        self.assertTrue(subscription_invoice_is_renewal("subscription_threshold"))

    def test_missing_reason_uses_seed_billing_status(self):
        self.assertFalse(subscription_invoice_is_renewal(None, seed_billing_is_pending=True))
        self.assertFalse(subscription_invoice_is_renewal("", seed_billing_is_pending=True))
        self.assertTrue(subscription_invoice_is_renewal(None, seed_billing_is_pending=False))
        self.assertTrue(subscription_invoice_is_renewal("", seed_billing_is_pending=False))


if __name__ == "__main__":
    unittest.main()
