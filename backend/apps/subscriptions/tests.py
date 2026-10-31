from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.billing.services import execute_billing_run
from apps.catalog.models import DiscountRule, Plan, Product, ProductVariant, TaxRule
from apps.customers.models import Customer
from .models import Quote, QuoteTemplate, Subscription


class QuoteDraftApiTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="staff@example.com",
            password="test-password",
            role=User.Role.STAFF,
        )
        self.customer = Customer.objects.create(
            contact_name="Avery Chen",
            email="avery@example.com",
        )
        self.template = QuoteTemplate.objects.create(
            name="Standard terms",
            validity_days=14,
            payment_terms="Net 30",
        )
        self.client.force_authenticate(self.staff)

    def draft_payload(self, **overrides):
        payload = {
            "customerId": str(self.customer.id),
            "templateId": str(self.template.id),
            "validUntil": (timezone.localdate() + timedelta(days=14)).isoformat(),
            "currency": "usd",
        }
        payload.update(overrides)
        return payload

    def test_staff_creates_draft_with_generated_number_and_template_terms(self):
        response = self.client.post("/api/v1/quotes", self.draft_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["number"].startswith("Q-"))
        self.assertEqual(response.data["status"], Quote.Status.DRAFT)
        self.assertEqual(response.data["paymentTerms"], "Net 30")
        self.assertEqual(response.data["currency"], "USD")
        self.assertEqual(response.data["total"], "0.00")
        self.assertEqual(response.data["customerName"], "Avery Chen")

    def test_staff_can_update_a_draft_header(self):
        quote = Quote.objects.create(
            customer=self.customer,
            template=self.template,
            valid_until=timezone.localdate() + timedelta(days=14),
        )
        new_valid_until = (timezone.localdate() + timedelta(days=30)).isoformat()

        response = self.client.patch(
            f"/api/v1/quotes/{quote.id}",
            {"validUntil": new_valid_until, "paymentTerms": "Due on receipt"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["validUntil"], new_valid_until)
        self.assertEqual(response.data["paymentTerms"], "Due on receipt")

    def test_non_draft_quote_cannot_be_updated(self):
        quote = Quote.objects.create(
            customer=self.customer,
            valid_until=timezone.localdate() + timedelta(days=14),
            status=Quote.Status.QUOTATION,
        )

        response = self.client.patch(
            f"/api/v1/quotes/{quote.id}",
            {"paymentTerms": "Updated after sending"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_quote_list_supports_customer_search(self):
        Quote.objects.create(
            customer=self.customer,
            valid_until=timezone.localdate() + timedelta(days=14),
        )

        response = self.client.get("/api/v1/quotes?search=Avery")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["items"]), 1)

    def test_past_validity_date_and_invalid_currency_are_rejected(self):
        past_date = (timezone.localdate() - timedelta(days=1)).isoformat()
        past_response = self.client.post("/api/v1/quotes", self.draft_payload(validUntil=past_date), format="json")
        currency_response = self.client.post("/api/v1/quotes", self.draft_payload(currency="US"), format="json")

        self.assertEqual(past_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(currency_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_line_without_product_or_plan_is_rejected(self):
        response = self.client.post(
            "/api/v1/quotes",
            self.draft_payload(lines=[{"description": "Unpriced item", "quantity": 1}]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_accounts_cannot_create_quotes(self):
        customer_user = User.objects.create_user(
            email="portal@example.com",
            password="test-password",
            role=User.Role.CUSTOMER,
        )
        self.client.force_authenticate(customer_user)

        response = self.client.post("/api/v1/quotes", self.draft_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class QuoteWorkflowIntegrationTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="sales@example.com",
            password="Demo-Sales#2026",
            role=User.Role.STAFF,
        )
        self.customer = Customer.objects.create(
            contact_name="Avery Chen",
            email="avery@example.com",
        )
        self.portal_user = User.objects.create_user(
            email="avery-portal@example.com",
            password="Demo-Customer#2026",
            role=User.Role.CUSTOMER,
        )
        self.customer.account_user = self.portal_user
        self.customer.save(update_fields=("account_user", "updated_at"))
        self.plan = Plan.objects.create(
            name="Monthly Team",
            interval_unit=Plan.Interval.MONTHLY,
            interval_count=1,
            price="120.00",
            currency="USD",
            end_policy=Plan.EndPolicy.RENEW_UNTIL_CLOSED,
            allow_pause=True,
            allow_renewal=True,
        )
        self.product = Product.objects.create(
            name="Odoo Add-on",
            product_type="addon",
            sales_price="40.00",
            cost_price="12.00",
            currency="USD",
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            name="Odoo",
            price_adjustment="560.00",
            currency="USD",
        )
        self.tax = TaxRule.objects.create(name="Sales tax", rate_percent="8.2500")
        self.template = QuoteTemplate.objects.create(
            name="Team quote",
            validity_days=14,
            payment_terms="Net 30",
        )
        self.client.force_authenticate(self.staff)

    def test_quote_prices_from_catalog_sends_and_converts_once(self):
        valid_until = (timezone.localdate() + timedelta(days=14)).isoformat()
        response = self.client.post(
            "/api/v1/quotes",
            {
                "customerId": str(self.customer.id),
                "templateId": str(self.template.id),
                "validUntil": valid_until,
                "currency": "USD",
                "lines": [
                    {"planId": str(self.plan.id), "quantity": "5.000", "taxRuleIds": [str(self.tax.id)]},
                    {"productId": str(self.product.id), "variantId": str(self.variant.id), "quantity": "1.000", "taxRuleIds": [str(self.tax.id)]},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["subtotal"], "1200.00")
        self.assertEqual(response.data["taxTotal"], "99.00")
        self.assertEqual(response.data["total"], "1299.00")
        self.assertEqual(response.data["lines"][1]["unitPrice"], "600.00")

        quote_id = response.data["id"]
        sent = self.client.post(f"/api/v1/quotes/{quote_id}/send", {}, format="json")
        self.assertEqual(sent.status_code, status.HTTP_200_OK)
        self.assertEqual(sent.data["deliveryStatus"], "simulated")

        confirmed = self.client.post(f"/api/v1/quotes/{quote_id}/confirm", {}, format="json")
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK)
        subscription_id = confirmed.data["subscriptionId"]
        subscription = Subscription.objects.get(pk=subscription_id)
        self.assertEqual(subscription.status, Subscription.Status.ACTIVE)
        self.assertEqual(subscription.lines.count(), 2)

        retried = self.client.post(f"/api/v1/quotes/{quote_id}/confirm", {}, format="json")
        self.assertEqual(retried.data["subscriptionId"], subscription_id)
        self.assertEqual(Subscription.objects.filter(source_quote_id=quote_id).count(), 1)

        DiscountRule.objects.create(
            name="Demo volume discount",
            discount_type=DiscountRule.DiscountType.PERCENTAGE,
            value="10.0000",
            minimum_purchase="0.00",
            minimum_quantity=5,
            scope=DiscountRule.Scope.WHOLE_SUBSCRIPTION,
            maximum_uses=1,
        )
        run = execute_billing_run(business_date=timezone.localdate())
        invoice = Invoice.objects.get(subscription_id=subscription_id)
        self.assertEqual(run.invoices_created, 1)
        self.assertEqual(invoice.subtotal, 1200)
        self.assertEqual(invoice.tax_total, 99)
        self.assertEqual(invoice.discount_total, 120)
        self.assertEqual(invoice.total, 1179)

        second_run = execute_billing_run(business_date=timezone.localdate())
        self.assertEqual(second_run.invoices_created, 0)
        self.assertEqual(Invoice.objects.filter(subscription_id=subscription_id).count(), 1)

        self.client.force_authenticate(self.portal_user)
        portal_invoices = self.client.get("/api/v1/portal/invoices")
        self.assertEqual(portal_invoices.status_code, status.HTTP_200_OK)
        self.assertEqual(len(portal_invoices.data["results"]), 1)

        self.client.force_authenticate(self.staff)
        confirmed_invoice = self.client.post(
            f"/api/v1/invoices/{invoice.id}/actions",
            {"action": "confirm"},
            format="json",
        )
        self.assertEqual(confirmed_invoice.status_code, status.HTTP_200_OK)
        payment = self.client.post(
            f"/api/v1/invoices/{invoice.id}/payments",
            {"method": "bank_transfer", "amount": "1179.00", "note": "Demo settlement"},
            format="json",
        )
        self.assertEqual(payment.status_code, status.HTTP_201_CREATED)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)

        report = self.client.get("/api/v1/reports/finance")
        self.assertEqual(report.status_code, status.HTTP_200_OK)
        self.assertEqual(report.data["metrics"]["invoicedAmount"], "1179.00")
        self.assertEqual(report.data["metrics"]["collectedRevenue"], "1179.00")
        self.assertEqual(report.data["metrics"]["outstandingBalance"], "0.00")
