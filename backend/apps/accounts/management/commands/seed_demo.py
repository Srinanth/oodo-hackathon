from getpass import getpass
import os

from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from apps.accounts.models import User
from apps.catalog.models import DiscountRule, Plan, Product, ProductVariant, TaxRule
from apps.customers.models import Customer
from apps.subscriptions.models import QuoteTemplate, QuoteTemplateLine


class Command(BaseCommand):
    help = "Create synthetic Brightloop accounts and catalog data for the selection-round walkthrough."

    emails = {
        "admin": "demo-admin@example.test",
        "staff": "demo-staff@example.test",
        "customer": "demo-customer@example.test",
    }

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            help="Optional password shared by the seeded users; omitted to prompt without echoing.",
        )

    def handle(self, *args, **options):
        password = options.get("password") or os.getenv("DEMO_SEED_PASSWORD")
        if not password:
            password = getpass("Choose a password for the local demo accounts: ")
            confirmation = getpass("Confirm demo password: ")
            if password != confirmation:
                raise CommandError("The demo passwords did not match.")
        if not password:
            raise CommandError("A demo password is required.")
        validate_password(password)

        with transaction.atomic():
            admin = self._account(self.emails["admin"], password, User.Role.ADMIN, superuser=True)
            self._account(self.emails["staff"], password, User.Role.STAFF, created_by=admin)
            customer_user = self._account(self.emails["customer"], password, User.Role.CUSTOMER)

            customer, _ = Customer.objects.get_or_create(
                account_user=customer_user,
                defaults={
                    "company_name": "Brightloop Demo Company",
                    "contact_name": "Avery Chen",
                    "email": customer_user.email,
                    "phone": "+1 555 0100",
                    "billing_address": "42 Demo Street, Sample City",
                },
            )
            product, _ = Product.objects.get_or_create(
                name="Odoo Brand Add-on",
                defaults={
                    "product_type": "addon",
                    "sales_price": "40.00",
                    "cost_price": "12.00",
                    "currency": "USD",
                    "notes": "Synthetic selection-round product for variant price demonstration.",
                },
            )
            variant, _ = ProductVariant.objects.get_or_create(
                product=product,
                name="Odoo",
                defaults={"price_adjustment": "560.00", "currency": "USD"},
            )
            plan, _ = Plan.objects.get_or_create(
                name="Demo Monthly Team Plan",
                defaults={
                    "interval_unit": Plan.Interval.MONTHLY,
                    "interval_count": 1,
                    "price": "120.00",
                    "currency": "USD",
                    "minimum_quantity": 1,
                    "end_policy": Plan.EndPolicy.RENEW_UNTIL_CLOSED,
                    "allow_pause": True,
                    "allow_renewal": True,
                },
            )
            tax_rule, _ = TaxRule.objects.get_or_create(
                name="Demo Sales Tax",
                defaults={"rate_percent": "8.2500", "is_active": True},
            )
            discount_rule, _ = DiscountRule.objects.get_or_create(
                name="Demo Volume Discount",
                defaults={
                    "discount_type": DiscountRule.DiscountType.PERCENTAGE,
                    "value": "10.0000",
                    "minimum_purchase": "0.00",
                    "minimum_quantity": 5,
                    "scope": DiscountRule.Scope.WHOLE_SUBSCRIPTION,
                    "maximum_uses": 100,
                    "is_active": True,
                },
            )
            template, _ = QuoteTemplate.objects.get_or_create(
                name="Selection Round Demo Quote",
                defaults={
                    "validity_days": 14,
                    "payment_terms": "Net 30",
                    "created_by": admin,
                },
            )
            self._template_line(template, 1, plan=plan, description="Monthly team seats", quantity="5.000", tax_rule=tax_rule)
            self._template_line(template, 2, product=product, variant=variant, description="Odoo brand add-on", quantity="1.000", tax_rule=tax_rule)

        self.stdout.write(self.style.SUCCESS("Synthetic selection-round demo data is ready."))
        self.stdout.write("Admin:    " + self.emails["admin"])
        self.stdout.write("Staff:    " + self.emails["staff"])
        self.stdout.write("Customer: " + self.emails["customer"])
        self.stdout.write("Password: the password entered at the prompt (not printed).")
        self.stdout.write("Quote template: Selection Round Demo Quote")
        self.stdout.write("Do not run this command with real customer data or a production database.")

    @staticmethod
    def _account(email, password, role, superuser=False, created_by=None):
        account = User.objects.filter(email=email).first()
        if account:
            if account.role != role:
                raise CommandError(f"{email} exists with a different role; refusing to change it.")
            return account
        if superuser:
            account = User.objects.create_superuser(email=email, password=password, first_name="Demo Admin")
        else:
            account = User.objects.create_user(
                email=email,
                password=password,
                role=role,
                first_name="Avery" if role == User.Role.CUSTOMER else "Demo Staff",
                created_by=created_by,
            )
        return account

    @staticmethod
    def _template_line(template, number, *, description, quantity, tax_rule, plan=None, product=None, variant=None):
        line, _ = QuoteTemplateLine.objects.get_or_create(
            template=template,
            line_number=number,
            defaults={
                "plan": plan,
                "product": product,
                "variant": variant,
                "description": description,
                "quantity": quantity,
            },
        )
        line.tax_rules.add(tax_rule)
        return line
