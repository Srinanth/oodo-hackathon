from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

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


@override_settings(CSRF_TRUSTED_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"])
class SessionLogoutTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="logout@example.test",
            password="Logout-Test#2026",
            role=User.Role.ADMIN,
        )
        self.client = APIClient(enforce_csrf_checks=True)

    def test_logout_ends_session_from_local_vite_origin(self):
        origin = "http://127.0.0.1:5173"
        self.client.get("/api/v1/auth/csrf")
        csrf_token = self.client.cookies["csrftoken"].value

        login = self.client.post(
            "/api/v1/auth/login",
            {"email": self.user.email, "password": "Logout-Test#2026"},
            format="json",
            HTTP_ORIGIN=origin,
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(login.status_code, 200, login.data)

        # Django rotates the CSRF cookie when establishing the session.
        csrf_token = self.client.cookies["csrftoken"].value
        logout_response = self.client.post(
            "/api/v1/auth/logout",
            {},
            format="json",
            HTTP_ORIGIN=origin,
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(logout_response.status_code, 204, logout_response.data)
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 403)

    def test_logout_rejects_untrusted_local_origin(self):
        origin = "http://localhost:5173"
        self.client.get("/api/v1/auth/csrf")
        login = self.client.post(
            "/api/v1/auth/login",
            {"email": self.user.email, "password": "Logout-Test#2026"},
            format="json",
            HTTP_ORIGIN=origin,
            HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value,
        )
        self.assertEqual(login.status_code, 200, login.data)

        denied = self.client.post(
            "/api/v1/auth/logout",
            {},
            format="json",
            HTTP_ORIGIN="http://localhost:5174",
            HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value,
        )
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 200)
