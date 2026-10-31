from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.customers.models import Customer
from .models import Quote, QuoteTemplate


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

    def test_priced_lines_are_rejected_until_catalog_integration(self):
        response = self.client.post(
            "/api/v1/quotes",
            self.draft_payload(lines=[{"description": "Unpriced item", "quantity": 1}]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lines", response.data["error"]["fieldErrors"])

    def test_customer_accounts_cannot_create_quotes(self):
        customer_user = User.objects.create_user(
            email="portal@example.com",
            password="test-password",
            role=User.Role.CUSTOMER,
        )
        self.client.force_authenticate(customer_user)

        response = self.client.post("/api/v1/quotes", self.draft_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
