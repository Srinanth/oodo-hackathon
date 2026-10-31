from django.core.management import call_command
from django.test import TestCase

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.subscriptions.models import QuoteTemplate, QuoteTemplateLine


class DemoSeedCommandTests(TestCase):
    def test_seed_demo_is_repeatable_and_links_the_customer_portal(self):
        call_command("seed_demo", password="Demo-Seed#2026", verbosity=0)
        call_command("seed_demo", password="Demo-Seed#2026", verbosity=0)

        self.assertEqual(User.objects.filter(email__startswith="demo-").count(), 3)
        customer_user = User.objects.get(email="demo-customer@example.test")
        self.assertTrue(Customer.objects.filter(account_user=customer_user).exists())
        template = QuoteTemplate.objects.get(name="Selection Round Demo Quote")
        self.assertEqual(QuoteTemplateLine.objects.filter(template=template).count(), 2)
