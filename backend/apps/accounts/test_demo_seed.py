from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase

from apps.accounts.models import User
from apps.billing.models import Invoice, Payment
from apps.customers.models import Customer
from apps.subscriptions.models import Quote, Subscription


class DemoSeedDatasetTests(TestCase):
    def test_seed_creates_repeatable_end_to_end_records(self):
        call_command("seed_demo", password="Demo-Seed#2026", verbosity=0)
        call_command("seed_demo", password="Demo-Seed#2026", verbosity=0)

        self.assertEqual(User.objects.filter(email__startswith="demo-").count(), 3)
        self.assertEqual(Customer.objects.count(), 2)
        self.assertEqual(Quote.objects.count(), 3)
        self.assertEqual(Subscription.objects.count(), 1)
        self.assertEqual(Invoice.objects.count(), 3)
        self.assertEqual(Payment.objects.count(), 2)

        self.assertEqual(Invoice.objects.get(number="INV-DEMO-PAID-01").status, Invoice.Status.PAID)
        overdue = Invoice.objects.get(number="INV-DEMO-OVERDUE-01")
        paid_to_date = sum(overdue.payments.values_list("amount", flat=True), Decimal("0.00"))
        self.assertEqual(overdue.total - paid_to_date, Decimal("929.00"))
