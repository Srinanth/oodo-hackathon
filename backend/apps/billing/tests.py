from datetime import date, timedelta
from decimal import Decimal
import io
import uuid

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.billing.models import (
    BillingRun,
    BillingRunItem,
    Invoice,
    InvoiceLine,
)
from apps.billing.services import (
    SubscriptionData,
    SubscriptionLineData,
    compute_due_date,
    compute_period_bounds,
    execute_billing_run,
    generate_invoice_number,
)


class BillingModelTests(TestCase):
    def setUp(self):
        self.run = BillingRun.objects.create(
            business_date=date(2026, 11, 1),
            status=BillingRun.Status.RUNNING,
        )
        self.sub_id = uuid.uuid4()
        self.cust_id = uuid.uuid4()

    def test_invoice_creation_and_period_uniqueness(self):
        invoice1 = Invoice.objects.create(
            number="INV-20261101-0001",
            customer_id=self.cust_id,
            subscription_id=self.sub_id,
            billing_run=self.run,
            billing_period_start=date(2026, 11, 1),
            billing_period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 12, 1),
            customer_name_snapshot="Acme Corp",
            customer_email_snapshot="acme@example.com",
            subtotal=Decimal("100.00"),
            total=Decimal("100.00"),
        )
        self.assertIsNotNone(invoice1.id)

        # Attempt duplicate invoice for same (subscription_id, billing_period_start)
        with self.assertRaises(IntegrityError):
            Invoice.objects.create(
                number="INV-20261101-0002",
                customer_id=self.cust_id,
                subscription_id=self.sub_id,
                billing_run=self.run,
                billing_period_start=date(2026, 11, 1),
                billing_period_end=date(2026, 11, 30),
                issue_date=date(2026, 11, 1),
                due_date=date(2026, 12, 1),
                customer_name_snapshot="Acme Corp",
                customer_email_snapshot="acme@example.com",
                subtotal=Decimal("100.00"),
                total=Decimal("100.00"),
            )

    def test_invoice_line_and_totals(self):
        invoice = Invoice.objects.create(
            number="INV-20261101-0010",
            customer_id=self.cust_id,
            subscription_id=self.sub_id,
            billing_run=self.run,
            billing_period_start=date(2026, 11, 1),
            billing_period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 12, 1),
            customer_name_snapshot="Acme Corp",
            customer_email_snapshot="acme@example.com",
            subtotal=Decimal("250.00"),
            total=Decimal("250.00"),
        )
        line = InvoiceLine.objects.create(
            invoice=invoice,
            line_number=1,
            description="Pro Plan Monthly",
            quantity=Decimal("2.000"),
            unit_price=Decimal("125.00"),
            subtotal=Decimal("250.00"),
            total=Decimal("250.00"),
        )
        self.assertEqual(invoice.lines.count(), 1)
        self.assertEqual(line.subtotal, Decimal("250.00"))


class BillingServiceTests(TestCase):
    def setUp(self):
        self.sub_id = uuid.uuid4()
        self.cust_id = uuid.uuid4()
        self.business_date = date(2026, 11, 1)

    def _sample_subscriptions(self):
        return [
            SubscriptionData(
                id=self.sub_id,
                number="SUB-001",
                customer_id=self.cust_id,
                plan_id=uuid.uuid4(),
                status="active",
                start_date=date(2026, 10, 1),
                next_billing_at=date(2026, 11, 1),
                next_period_start=date(2026, 11, 1),
                payment_terms="Net 30",
                currency="USD",
                customer_name="TechStart Inc",
                customer_email="billing@techstart.io",
                lines=[
                    SubscriptionLineData(
                        line_number=1,
                        description="Starter SaaS Tier",
                        quantity=Decimal("1.000"),
                        unit_price=Decimal("49.99"),
                        currency="USD",
                    )
                ],
            )
        ]

    def test_execute_billing_run_creates_invoice(self):
        subs = self._sample_subscriptions()
        run = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=subs,
        )

        self.assertEqual(run.status, BillingRun.Status.COMPLETED)
        self.assertEqual(run.subscriptions_seen, 1)
        self.assertEqual(run.invoices_created, 1)
        self.assertEqual(run.failures, 0)

        # Verify created invoice
        invoice = Invoice.objects.get(subscription_id=self.sub_id)
        self.assertEqual(invoice.billing_period_start, date(2026, 11, 1))
        self.assertEqual(invoice.billing_period_end, date(2026, 11, 30))
        self.assertEqual(invoice.total, Decimal("49.99"))
        self.assertEqual(invoice.customer_name_snapshot, "TechStart Inc")

        # Verify run item
        item = run.items.get(subscription_id=self.sub_id)
        self.assertEqual(item.status, BillingRunItem.Status.CREATED)
        self.assertEqual(item.invoice, invoice)

    def test_idempotent_retry_creates_no_duplicates(self):
        subs = self._sample_subscriptions()

        # First run: creates invoice
        run1 = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=subs,
        )
        self.assertEqual(run1.invoices_created, 1)
        self.assertEqual(Invoice.objects.filter(subscription_id=self.sub_id).count(), 1)

        # Retry run for same date: exactly 0 new invoices
        run2 = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=subs,
        )
        self.assertEqual(run2.status, BillingRun.Status.COMPLETED)
        self.assertEqual(run2.invoices_created, 0)
        self.assertEqual(run2.failures, 0)
        self.assertEqual(Invoice.objects.filter(subscription_id=self.sub_id).count(), 1)

        item2 = run2.items.get(subscription_id=self.sub_id)
        self.assertEqual(item2.status, BillingRunItem.Status.ALREADY_EXISTS)
        self.assertIsNotNone(item2.invoice)

    def test_failure_isolation_and_visibility(self):
        sub_good = self._sample_subscriptions()[0]
        sub_bad = SubscriptionData(
            id=uuid.uuid4(),
            number="SUB-BAD",
            customer_id=uuid.uuid4(),
            plan_id=None,
            status="active",
            start_date=date(2026, 10, 1),
            next_billing_at=date(2026, 11, 1),
            lines=[
                SubscriptionLineData(
                    line_number=-1,  # Invalid line_number violates check constraint
                    description="Bad Line",
                    quantity=Decimal("1.000"),
                    unit_price=Decimal("10.00"),
                )
            ],
        )

        run = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=[sub_good, sub_bad],
        )

        self.assertEqual(run.status, BillingRun.Status.COMPLETED_WITH_ERRORS)
        self.assertEqual(run.subscriptions_seen, 2)
        self.assertEqual(run.invoices_created, 1)
        self.assertEqual(run.failures, 1)
        self.assertTrue(run.items.filter(status=BillingRunItem.Status.FAILED).exists())
        failed_item = run.items.get(status=BillingRunItem.Status.FAILED)
        self.assertTrue(len(failed_item.error_message) > 0)

    def test_expired_subscription_is_skipped(self):
        """A subscription whose expiry_date is before the business_date
        must be skipped and recorded as SKIPPED, not FAILED or CREATED."""
        expired_sub = SubscriptionData(
            id=uuid.uuid4(),
            number="SUB-EXPIRED",
            customer_id=uuid.uuid4(),
            plan_id=None,
            status="active",
            start_date=date(2026, 1, 1),
            next_billing_at=date(2026, 11, 1),
            next_period_start=date(2026, 11, 1),
            expiry_date=date(2026, 10, 31),  # Expired yesterday
            lines=[
                SubscriptionLineData(
                    line_number=1,
                    description="Expired plan",
                    quantity=Decimal("1.000"),
                    unit_price=Decimal("50.00"),
                )
            ],
        )
        run = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=[expired_sub],
        )
        self.assertEqual(run.subscriptions_seen, 1)
        self.assertEqual(run.invoices_created, 0)
        self.assertEqual(run.failures, 0)
        self.assertEqual(run.status, BillingRun.Status.COMPLETED)
        item = run.items.get(subscription_id=expired_sub.id)
        self.assertEqual(item.status, BillingRunItem.Status.SKIPPED)
        self.assertIn("expired", item.error_message.lower())

    def test_expired_sub_mixed_with_active(self):
        """When one sub is expired and another is active, only the active
        one produces an invoice; the expired one is SKIPPED."""
        active_sub = self._sample_subscriptions()[0]
        expired_sub = SubscriptionData(
            id=uuid.uuid4(),
            number="SUB-EXP-MIX",
            customer_id=uuid.uuid4(),
            plan_id=None,
            status="active",
            start_date=date(2026, 1, 1),
            next_billing_at=date(2026, 11, 1),
            expiry_date=date(2026, 10, 15),  # Well before business_date
            lines=[
                SubscriptionLineData(
                    line_number=1,
                    description="Old plan",
                    quantity=Decimal("1.000"),
                    unit_price=Decimal("100.00"),
                )
            ],
        )
        run = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=[active_sub, expired_sub],
        )
        self.assertEqual(run.subscriptions_seen, 2)
        self.assertEqual(run.invoices_created, 1)
        self.assertEqual(run.failures, 0)
        self.assertTrue(run.items.filter(status=BillingRunItem.Status.SKIPPED).exists())
        self.assertTrue(run.items.filter(status=BillingRunItem.Status.CREATED).exists())

    def test_triple_retry_idempotency(self):
        """Running the billing run three times for the same date still
        produces exactly one invoice."""
        subs = self._sample_subscriptions()
        for _ in range(3):
            execute_billing_run(
                business_date=self.business_date,
                subscriptions_override=subs,
            )
        self.assertEqual(
            Invoice.objects.filter(subscription_id=self.sub_id).count(), 1,
        )

    def test_dry_run_then_real_run(self):
        """A dry run does NOT create invoices; a subsequent real run does."""
        subs = self._sample_subscriptions()

        dry = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=subs,
            dry_run=True,
        )
        self.assertEqual(dry.invoices_created, 1)  # predicted count
        self.assertEqual(Invoice.objects.filter(subscription_id=self.sub_id).count(), 0)

        real = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=subs,
        )
        self.assertEqual(real.invoices_created, 1)
        self.assertEqual(Invoice.objects.filter(subscription_id=self.sub_id).count(), 1)

    def test_tax_rules_snapshot_on_invoice_line(self):
        """Tax rules attached to subscription lines are snapshotted as
        InvoiceLineTax records on the generated invoice."""
        from apps.billing.models import InvoiceLineTax

        tax_id = uuid.uuid4()
        sub = SubscriptionData(
            id=uuid.uuid4(),
            number="SUB-TAX",
            customer_id=uuid.uuid4(),
            plan_id=None,
            status="active",
            start_date=date(2026, 10, 1),
            next_billing_at=date(2026, 11, 1),
            next_period_start=date(2026, 11, 1),
            customer_name="Tax Corp",
            customer_email="tax@corp.com",
            lines=[
                SubscriptionLineData(
                    line_number=1,
                    description="Taxed service",
                    quantity=Decimal("2.000"),
                    unit_price=Decimal("100.00"),
                    tax_rules=[
                        {"id": tax_id, "name": "GST 10%", "rate_percent": "10.0000"},
                    ],
                )
            ],
        )
        run = execute_billing_run(
            business_date=self.business_date,
            subscriptions_override=[sub],
        )
        self.assertEqual(run.invoices_created, 1)
        invoice = Invoice.objects.get(subscription_id=sub.id)
        # subtotal = 2 * 100 = 200, tax = 200 * 10% = 20
        self.assertEqual(invoice.subtotal, Decimal("200.00"))
        self.assertEqual(invoice.tax_total, Decimal("20.00"))
        self.assertEqual(invoice.total, Decimal("220.00"))

        tax_entry = InvoiceLineTax.objects.get(invoice_line__invoice=invoice)
        self.assertEqual(tax_entry.name_snapshot, "GST 10%")
        self.assertEqual(tax_entry.rate_percent_snapshot, Decimal("10.0000"))
        self.assertEqual(tax_entry.amount, Decimal("20.00"))


class ManagementCommandTests(TestCase):
    def test_run_billing_command(self):
        out = io.StringIO()
        call_command("run_billing", "--business-date=2026-11-01", stdout=out)
        output = out.getvalue()
        self.assertIn("Starting billing run", output)
        self.assertIn("Status: completed", output)

    def test_billing_run_alias_dry_run(self):
        out = io.StringIO()
        call_command("billing_run", "--dry-run", stdout=out)
        output = out.getvalue()
        self.assertIn("DRY RUN", output)


class BillingApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpassword123",
        )
        self.customer_user = User.objects.create_user(
            email="customer@example.com",
            password="custpassword123",
            role=User.Role.CUSTOMER,
        )

    def test_unauthenticated_denied(self):
        response = self.client.post("/api/v1/billing-runs", {"businessDate": "2026-11-01"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.json()["error"]["code"], "AUTHENTICATION_REQUIRED")

    def test_customer_role_forbidden(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.post("/api/v1/billing-runs", {"businessDate": "2026-11-01"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.json()["error"]["code"], "FORBIDDEN")

    def test_staff_can_trigger_billing_run(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/billing-runs",
            {"businessDate": "2026-11-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["businessDate"], "2026-11-01")
        self.assertIn("status", data)
        self.assertIn("subscriptionsSeen", data)
        self.assertIn("invoicesCreated", data)
        self.assertIn("failures", data)
        self.assertIn("items", data)

    def test_staff_can_list_and_retrieve_billing_runs(self):
        self.client.force_authenticate(user=self.admin)
        run = BillingRun.objects.create(
            business_date=date(2026, 11, 1),
            status=BillingRun.Status.COMPLETED,
            subscriptions_seen=5,
            invoices_created=5,
        )

        # List
        list_resp = self.client.get("/api/v1/billing-runs")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(len(list_resp.json()) >= 1)

        # Retrieve
        detail_resp = self.client.get(f"/api/v1/billing-runs/{run.id}")
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_resp.json()["id"], str(run.id))


class InvoiceWorkflowAndPaymentTests(APITestCase):
    def setUp(self):
        # Clean up all billing data from prior test classes in correct order
        from apps.billing.models import Payment, InvoiceLineTax, InvoiceDiscountLine
        Payment.objects.all().delete()
        InvoiceLineTax.objects.all().delete()
        InvoiceDiscountLine.objects.all().delete()
        InvoiceLine.objects.all().delete()
        BillingRunItem.objects.all().delete()
        Invoice.objects.all().delete()
        BillingRun.objects.all().delete()

        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpassword123",
            role=User.Role.ADMIN,
        )
        self.cust_id = uuid.uuid4()
        self.sub_id = uuid.uuid4()
        self.customer_user = User.objects.create_user(
            email="cust@example.com",
            password="custpassword123",
            role=User.Role.CUSTOMER,
        )
        self.customer_user.customer_id = self.cust_id

        self.invoice = Invoice.objects.create(
            number="INV-20261101-0001",
            customer_id=self.cust_id,
            subscription_id=self.sub_id,
            billing_period_start=date(2026, 11, 1),
            billing_period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 15),
            customer_name_snapshot="Apex Corp",
            customer_email_snapshot="cust@example.com",
            billing_address_snapshot="123 Tech Way",
            subtotal=Decimal("100.00"),
            tax_total=Decimal("10.00"),
            discount_total=Decimal("5.00"),
            total=Decimal("105.00"),
            status=Invoice.Status.DRAFT,
        )
        InvoiceLine.objects.create(
            invoice=self.invoice,
            line_number=1,
            description="Cloud Platform Pro",
            quantity=Decimal("1.000"),
            unit_price=Decimal("100.00"),
            subtotal=Decimal("100.00"),
            tax_total=Decimal("10.00"),
            discount_total=Decimal("5.00"),
            total=Decimal("105.00"),
        )

    def test_invoice_list_and_detail(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/invoices")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        data = body.get("results", body)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["number"], "INV-20261101-0001")
        self.assertEqual(data[0]["status"], "draft")
        self.assertEqual(data[0]["total"], "105.00")
        self.assertEqual(data[0]["paidAmount"], "0.00")
        self.assertEqual(data[0]["balanceDue"], "105.00")

        # Detail view
        detail_res = self.client.get(f"/api/v1/invoices/{self.invoice.id}")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        det = detail_res.json()
        self.assertEqual(len(det["lines"]), 1)
        self.assertEqual(det["billingAddressSnapshot"], "123 Tech Way")

    def test_invoice_confirm_and_cancel_actions(self):
        self.client.force_authenticate(user=self.admin)

        # Confirm action
        conf_res = self.client.post(
            f"/api/v1/invoices/{self.invoice.id}/actions",
            {"action": "confirm"},
            format="json",
        )
        self.assertEqual(conf_res.status_code, status.HTTP_200_OK)
        self.assertEqual(conf_res.json()["status"], "confirmed")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.CONFIRMED)
        self.assertIsNotNone(self.invoice.confirmed_at)

        # Cannot confirm an already confirmed invoice
        conf_again = self.client.post(
            f"/api/v1/invoices/{self.invoice.id}/actions",
            {"action": "confirm"},
            format="json",
        )
        self.assertEqual(conf_again.status_code, status.HTTP_400_BAD_REQUEST)

        # Cancel action
        cancel_res = self.client.post(
            f"/api/v1/invoices/{self.invoice.id}/actions",
            {"action": "cancel"},
            format="json",
        )
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_res.json()["status"], "cancelled")

    def test_payment_recording_and_status_auto_advancement(self):
        self.client.force_authenticate(user=self.admin)
        self.invoice.status = Invoice.Status.CONFIRMED
        self.invoice.save()

        # Partial payment: 50.00 of 105.00
        pay1 = self.client.post(
            f"/api/v1/invoices/{self.invoice.id}/payments",
            {"method": "credit_card", "amount": "50.00", "note": "Partial upfront"},
            format="json",
        )
        self.assertEqual(pay1.status_code, status.HTTP_201_CREATED)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.CONFIRMED)

        # Check detail reflects remaining balance
        det1 = self.client.get(f"/api/v1/invoices/{self.invoice.id}").json()
        self.assertEqual(det1["paidAmount"], "50.00")
        self.assertEqual(det1["balanceDue"], "55.00")

        # Second payment: remaining 55.00
        pay2 = self.client.post(
            f"/api/v1/invoices/{self.invoice.id}/payments",
            {"method": "bank_transfer", "amount": "55.00", "note": "Settlement"},
            format="json",
        )
        self.assertEqual(pay2.status_code, status.HTTP_201_CREATED)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)

        # Check detail reflects fully paid
        det2 = self.client.get(f"/api/v1/invoices/{self.invoice.id}").json()
        self.assertEqual(det2["paidAmount"], "105.00")
        self.assertEqual(det2["balanceDue"], "0.00")

    def test_customer_portal_scoping(self):
        # Customer sees their own invoice
        self.client.force_authenticate(user=self.customer_user)
        res = self.client.get("/api/v1/portal/invoices")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.json().get("results", res.json())
        self.assertEqual(len(results), 1)

        # Another customer sees none
        other_user = User.objects.create_user(
            email="other@example.com",
            password="otherpassword123",
            role=User.Role.CUSTOMER,
        )
        other_user.customer_id = uuid.uuid4()
        self.client.force_authenticate(user=other_user)
        res2 = self.client.get("/api/v1/portal/invoices")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        results2 = res2.json().get("results", res2.json())
        self.assertEqual(len(results2), 0)

    def test_finance_reporting_aggregations(self):
        self.client.force_authenticate(user=self.admin)
        report_res = self.client.get("/api/v1/reports/finance")
        self.assertEqual(report_res.status_code, status.HTTP_200_OK)
        data = report_res.json()
        self.assertIn("metrics", data)
        self.assertIn("invoicedAmount", data["metrics"])
        self.assertIn("collectedRevenue", data["metrics"])
        self.assertIn("outstandingBalance", data["metrics"])
        self.assertIn("overdueCount", data["metrics"])
        self.assertIn("invoices", data)
