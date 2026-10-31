from datetime import timedelta
from decimal import Decimal
import os
import uuid

from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from getpass import getpass

from apps.accounts.models import User
from apps.billing.models import (
    Invoice,
    InvoiceDiscountLine,
    InvoiceLine,
    InvoiceLineTax,
    Payment,
)
from apps.billing.services import (
    SubscriptionData,
    SubscriptionLineData,
    execute_billing_run,
)
from apps.catalog.models import DiscountRule, Plan, Product, ProductVariant, TaxRule
from apps.customers.models import Customer
from apps.subscriptions.models import Quote, QuoteTemplate, QuoteTemplateLine, Subscription
from apps.subscriptions.services import convert_quote_to_subscription, interval_add, replace_quote_lines


class Command(BaseCommand):
    help = "Create synthetic Brightloop accounts and records for the selection-round walkthrough."

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

        today = timezone.localdate()
        with transaction.atomic():
            admin = self._account(self.emails["admin"], password, User.Role.ADMIN, superuser=True)
            staff = self._account(self.emails["staff"], password, User.Role.STAFF, created_by=admin)
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
            Customer.objects.get_or_create(
                email="billing@northstar.example.test",
                defaults={
                    "company_name": "Northstar Demo Labs",
                    "contact_name": "Morgan Lee",
                    "phone": "+1 555 0101",
                    "billing_address": "18 Sample Avenue, Sample City",
                },
            )

            product, _ = Product.objects.get_or_create(
                name="Odoo Brand Add-on",
                defaults={
                    "product_type": "addon",
                    "sales_price": Decimal("40.00"),
                    "cost_price": Decimal("12.00"),
                    "currency": "USD",
                    "notes": "Synthetic selection-round product for variant price demonstration.",
                },
            )
            variant, _ = ProductVariant.objects.get_or_create(
                product=product,
                name="Odoo",
                defaults={"price_adjustment": Decimal("560.00"), "currency": "USD"},
            )
            plan, _ = Plan.objects.get_or_create(
                name="Demo Monthly Team Plan",
                defaults={
                    "interval_unit": Plan.Interval.MONTHLY,
                    "interval_count": 1,
                    "price": Decimal("120.00"),
                    "currency": "USD",
                    "minimum_quantity": 1,
                    "end_policy": Plan.EndPolicy.RENEW_UNTIL_CLOSED,
                    "allow_pause": True,
                    "allow_renewal": True,
                },
            )
            tax_rule, _ = TaxRule.objects.get_or_create(
                name="Demo Sales Tax",
                defaults={"rate_percent": Decimal("8.2500"), "is_active": True},
            )
            discount_rule, _ = DiscountRule.objects.get_or_create(
                name="Demo Volume Discount",
                defaults={
                    "discount_type": DiscountRule.DiscountType.PERCENTAGE,
                    "value": Decimal("10.0000"),
                    "minimum_purchase": Decimal("0.00"),
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

            quote_lines = self._quote_lines(plan, product, variant, tax_rule)
            self._seed_quote("Q-DEMO-DRAFT-01", customer, template, staff, today, Quote.Status.DRAFT, quote_lines)
            self._seed_quote("Q-DEMO-OPEN-01", customer, template, staff, today, Quote.Status.QUOTATION, quote_lines)
            active_quote = self._seed_quote("Q-DEMO-ACTIVE-01", customer, template, staff, today, Quote.Status.QUOTATION, quote_lines)
            subscription = Subscription.objects.filter(source_quote=active_quote).first()
            if subscription is None:
                subscription = convert_quote_to_subscription(active_quote, staff)

            self._seed_historical_invoice(
                key="paid",
                number="INV-DEMO-PAID-01",
                issue_date=today - timedelta(days=60),
                due_date=today - timedelta(days=30),
                status=Invoice.Status.PAID,
                payment_amount=Decimal("1179.00"),
                payment_date=timezone.now() - timedelta(days=2),
                subscription=subscription,
                customer=customer,
                staff=staff,
                plan=plan,
                product=product,
                tax_rule=tax_rule,
                discount_rule=discount_rule,
            )
            self._seed_historical_invoice(
                key="overdue",
                number="INV-DEMO-OVERDUE-01",
                issue_date=today - timedelta(days=31),
                due_date=today - timedelta(days=1),
                status=Invoice.Status.CONFIRMED,
                payment_amount=Decimal("250.00"),
                payment_date=timezone.now() - timedelta(days=2),
                subscription=subscription,
                customer=customer,
                staff=staff,
                plan=plan,
                product=product,
                tax_rule=tax_rule,
                discount_rule=discount_rule,
            )

        current_invoice = self._ensure_current_invoice(subscription, staff, today)

        self.stdout.write(self.style.SUCCESS("Synthetic selection-round demo data is ready."))
        self.stdout.write("Admin:    " + self.emails["admin"])
        self.stdout.write("Staff:    " + self.emails["staff"])
        self.stdout.write("Customer: " + self.emails["customer"])
        self.stdout.write("Password: the password entered at the prompt (not printed).")
        self.stdout.write("Quotes: one draft, one quotation, and one confirmed quote.")
        self.stdout.write("Subscription: one active customer subscription.")
        self.stdout.write("Invoices: one paid, one partially paid and overdue, and one current draft.")
        if current_invoice:
            self.stdout.write(f"Current demo invoice: {current_invoice.number}")
        else:
            self.stdout.write(f"No current invoice is due; next billing date: {subscription.next_billing_at}")
        self.stdout.write("Do not run this command with real customer data or a production database.")

    @staticmethod
    def _quote_lines(plan, product, variant, tax_rule):
        return [
            {
                "plan": plan,
                "description": "Monthly team seats",
                "quantity": Decimal("5.000"),
                "tax_rules": [tax_rule],
            },
            {
                "product": product,
                "variant": variant,
                "description": "Odoo brand add-on",
                "quantity": Decimal("1.000"),
                "tax_rules": [tax_rule],
            },
        ]

    @staticmethod
    def _seed_quote(number, customer, template, staff, today, status, lines):
        quote, created = Quote.objects.get_or_create(
            number=number,
            defaults={
                "customer": customer,
                "template": template,
                "status": status,
                "valid_until": today + timedelta(days=14),
                "start_date": today,
                "payment_terms": "Net 30",
                "currency": "USD",
                "created_by": staff,
            },
        )
        if quote.customer_id != customer.pk or quote.template_id != template.pk:
            raise CommandError(f"The reserved demo quote number {number} is already used by another record.")
        if created or not quote.lines.exists():
            replace_quote_lines(quote, lines)
        if quote.status in {Quote.Status.DRAFT, Quote.Status.QUOTATION} and quote.valid_until < today:
            quote.valid_until = today + timedelta(days=14)
            quote.save(update_fields=("valid_until", "updated_at"))
        return quote

    @staticmethod
    def _ensure_current_invoice(subscription, staff, today):
        period_start = subscription.next_period_start
        invoice = Invoice.objects.filter(
            subscription_id=subscription.pk,
            billing_period_start=period_start,
        ).first()
        if invoice:
            return invoice
        if subscription.next_billing_at > today:
            return Invoice.objects.filter(subscription_id=subscription.pk).order_by("-billing_period_start").first()

        run = execute_billing_run(
            business_date=today,
            triggered_by=staff,
            subscriptions_override=[Command._billing_data(subscription)],
        )
        if run.failures:
            raise CommandError(f"The demo billing run had {run.failures} failure(s): {run.error_summary}")
        return Invoice.objects.get(subscription_id=subscription.pk, billing_period_start=period_start)

    @staticmethod
    def _billing_data(subscription):
        customer = subscription.customer
        plan = subscription.plan
        lines = []
        for line in subscription.lines.select_related("product").prefetch_related("tax_rules"):
            lines.append(
                SubscriptionLineData(
                    line_number=line.line_number,
                    description=line.description,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    currency=line.currency,
                    product_id=line.product_id,
                    variant_id=line.variant_id,
                    tax_rules=[
                        {"id": rule.pk, "name": rule.name, "rate_percent": str(rule.rate_percent)}
                        for rule in line.tax_rules.all()
                    ],
                )
            )
        return SubscriptionData(
            id=subscription.pk,
            number=subscription.number,
            customer_id=customer.pk,
            plan_id=subscription.plan_id,
            status=subscription.status,
            start_date=subscription.start_date,
            next_billing_at=subscription.next_billing_at,
            next_period_start=subscription.next_period_start,
            expiry_date=subscription.expiry_date,
            payment_terms=subscription.payment_terms,
            currency=subscription.currency,
            interval_unit=plan.interval_unit if plan else "monthly",
            interval_count=plan.interval_count if plan else 1,
            customer_name=customer.company_name or customer.contact_name,
            customer_email=customer.email,
            billing_address=customer.billing_address,
            lines=lines,
        )

    @staticmethod
    def _seed_historical_invoice(
        *, key, number, issue_date, due_date, status, payment_amount, payment_date,
        subscription, customer, staff, plan, product, tax_rule, discount_rule,
    ):
        invoice, created = Invoice.objects.get_or_create(
            number=number,
            defaults={
                "customer_id": customer.pk,
                "subscription_id": subscription.pk,
                "billing_period_start": issue_date,
                "billing_period_end": interval_add(issue_date, plan) - timedelta(days=1),
                "status": status,
                "issue_date": issue_date,
                "due_date": due_date,
                "currency": "USD",
                "customer_name_snapshot": customer.company_name or customer.contact_name,
                "customer_email_snapshot": customer.email,
                "billing_address_snapshot": customer.billing_address,
                "subtotal": Decimal("1200.00"),
                "tax_total": Decimal("99.00"),
                "discount_total": Decimal("120.00"),
                "total": Decimal("1179.00"),
                "confirmed_at": timezone.now() - timedelta(days=1),
            },
        )
        if invoice.subscription_id != subscription.pk:
            raise CommandError(f"The reserved demo invoice number {number} is already used by another record.")
        if created:
            for line_number, line_product, description, quantity, unit_price in (
                (1, None, "Monthly team seats", Decimal("5.000"), Decimal("120.00")),
                (2, product, "Odoo brand add-on", Decimal("1.000"), Decimal("600.00")),
            ):
                subtotal = quantity * unit_price
                tax = (subtotal * tax_rule.rate_percent / Decimal("100")).quantize(Decimal("0.01"))
                line = InvoiceLine.objects.create(
                    id=Command._stable_id(f"invoice-{key}-line-{line_number}"),
                    invoice=invoice,
                    line_number=line_number,
                    product_id=line_product.pk if line_product else None,
                    description=description,
                    quantity=quantity,
                    unit_price=unit_price,
                    currency="USD",
                    subtotal=subtotal,
                    tax_total=tax,
                    total=subtotal + tax,
                )
                InvoiceLineTax.objects.get_or_create(
                    id=Command._stable_id(f"invoice-{key}-line-{line_number}-tax"),
                    defaults={
                        "invoice_line": line,
                        "tax_rule": tax_rule,
                        "name_snapshot": tax_rule.name,
                        "rate_percent_snapshot": tax_rule.rate_percent,
                        "amount": tax,
                    },
                )
            InvoiceDiscountLine.objects.get_or_create(
                id=Command._stable_id(f"invoice-{key}-discount"),
                defaults={
                    "invoice": invoice,
                    "discount_rule": discount_rule,
                    "name_snapshot": discount_rule.name,
                    "discount_type_snapshot": DiscountRule.DiscountType.PERCENTAGE,
                    "value_snapshot": Decimal("10.0000"),
                    "amount": Decimal("120.00"),
                    "currency": "USD",
                },
            )
        Payment.objects.get_or_create(
            id=Command._stable_id(f"payment-{key}"),
            defaults={
                "invoice": invoice,
                "method": "bank_transfer",
                "amount": payment_amount,
                "currency": "USD",
                "status": Payment.Status.POSTED,
                "paid_at": payment_date,
                "note": "Synthetic selection-round demo payment.",
                "recorded_by": staff,
            },
        )

    @staticmethod
    def _stable_id(name):
        return uuid.uuid5(uuid.NAMESPACE_URL, f"brightloop-demo:{name}")

    @staticmethod
    def _account(email, password, role, superuser=False, created_by=None):
        account = User.objects.filter(email=email).first()
        if account:
            if account.role != role:
                raise CommandError(f"{email} exists with a different role; refusing to change it.")
            return account
        if superuser:
            return User.objects.create_superuser(email=email, password=password, first_name="Demo Admin")
        return User.objects.create_user(
            email=email,
            password=password,
            role=role,
            first_name="Avery" if role == User.Role.CUSTOMER else "Demo Staff",
            created_by=created_by,
        )

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
