from decimal import Decimal
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class BillingRun(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        COMPLETED_WITH_ERRORS = "completed_with_errors", "Completed with errors"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business_date = models.DateField()
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.RUNNING,
    )
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="billing_runs",
    )
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    subscriptions_seen = models.PositiveIntegerField(default=0)
    invoices_created = models.PositiveIntegerField(default=0)
    failures = models.PositiveIntegerField(default=0)
    error_summary = models.TextField(blank=True, default="")

    class Meta:
        db_table = "billing_run"
        ordering = ("-started_at", "-id")
        indexes = [
            models.Index(fields=["business_date", "started_at"], name="billing_run_date_idx"),
        ]

    def __str__(self):
        return f"BillingRun {self.business_date} [{self.status}]"


class Invoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CONFIRMED = "confirmed", "Confirmed"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=40, unique=True)
    customer_id = models.UUIDField(db_index=True)
    subscription_id = models.UUIDField(db_index=True)
    billing_run = models.ForeignKey(
        BillingRun,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="invoices",
    )
    billing_period_start = models.DateField()
    billing_period_end = models.DateField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    issue_date = models.DateField()
    due_date = models.DateField()
    currency = models.CharField(max_length=3, default="USD")
    customer_name_snapshot = models.CharField(max_length=200)
    customer_email_snapshot = models.EmailField(max_length=254)
    billing_address_snapshot = models.TextField(blank=True, default="")
    subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    tax_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    discount_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "invoice"
        ordering = ("-issue_date", "-created_at", "-id")
        constraints = [
            models.UniqueConstraint(
                fields=["subscription_id", "billing_period_start"],
                name="invoice_one_per_period",
            ),
            models.CheckConstraint(
                check=models.Q(billing_period_end__gte=models.F("billing_period_start")),
                name="invoice_period_valid",
            ),
            models.CheckConstraint(
                check=models.Q(subtotal__gte=0),
                name="invoice_subtotal_non_negative",
            ),
            models.CheckConstraint(
                check=models.Q(tax_total__gte=0),
                name="invoice_tax_total_non_negative",
            ),
            models.CheckConstraint(
                check=models.Q(discount_total__gte=0),
                name="invoice_discount_non_negative",
            ),
            models.CheckConstraint(
                check=models.Q(total__gte=0),
                name="invoice_total_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "due_date"], name="invoice_due_status_idx"),
            models.Index(fields=["customer_id", "issue_date"], name="invoice_customer_date_idx"),
            models.Index(fields=["subscription_id", "billing_period_start"], name="invoice_sub_period_idx"),
        ]

    def __str__(self):
        return f"{self.number} ({self.status})"


class InvoiceLine(models.Model):
    class LineType(models.TextChoices):
        PRODUCT = "product", "Product"
        DISCOUNT = "discount", "Discount"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    line_number = models.PositiveIntegerField()
    line_type = models.CharField(
        max_length=16,
        choices=LineType.choices,
        default=LineType.PRODUCT,
    )
    product_id = models.UUIDField(null=True, blank=True)
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=Decimal("1.000"),
    )
    unit_price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    currency = models.CharField(max_length=3, default="USD")
    subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    tax_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    discount_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    class Meta:
        db_table = "invoice_line"
        ordering = ("line_number", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["invoice", "line_number"],
                name="invoice_line_unique",
            ),
            models.CheckConstraint(
                check=models.Q(line_number__gt=0),
                name="invoice_line_number_positive",
            ),
            models.CheckConstraint(
                check=models.Q(quantity__gt=0),
                name="invoice_line_quantity_positive",
            ),
            models.CheckConstraint(
                check=models.Q(unit_price__gte=0),
                name="invoice_line_unit_price_non_neg",
            ),
        ]

    def __str__(self):
        return f"{self.invoice.number} line {self.line_number}: {self.description}"


class InvoiceLineTax(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_line = models.ForeignKey(
        InvoiceLine,
        on_delete=models.CASCADE,
        related_name="taxes",
    )
    tax_rule_id = models.UUIDField(null=True, blank=True)
    name_snapshot = models.CharField(max_length=160)
    rate_percent_snapshot = models.DecimalField(
        max_digits=7,
        decimal_places=4,
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
    )

    class Meta:
        db_table = "invoice_line_tax"
        constraints = [
            models.CheckConstraint(
                check=models.Q(rate_percent_snapshot__gte=0),
                name="invoice_line_tax_rate_non_neg",
            ),
            models.CheckConstraint(
                check=models.Q(amount__gte=0),
                name="invoice_line_tax_amt_non_neg",
            ),
        ]

    def __str__(self):
        return f"{self.name_snapshot} ({self.rate_percent_snapshot}%): {self.amount}"


class InvoiceDiscountLine(models.Model):
    class DiscountType(models.TextChoices):
        FIXED = "fixed", "Fixed"
        PERCENTAGE = "percentage", "Percentage"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="discount_lines",
    )
    discount_rule_id = models.UUIDField(null=True, blank=True)
    name_snapshot = models.CharField(max_length=160)
    discount_type_snapshot = models.CharField(
        max_length=12,
        choices=DiscountType.choices,
    )
    value_snapshot = models.DecimalField(
        max_digits=14,
        decimal_places=4,
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
    )
    currency = models.CharField(max_length=3, default="USD")

    class Meta:
        db_table = "invoice_discount_line"
        constraints = [
            models.UniqueConstraint(
                fields=["invoice", "discount_rule_id"],
                name="invoice_discount_rule_unique",
            ),
            models.CheckConstraint(
                check=models.Q(amount__gt=0),
                name="invoice_discount_amount_positive",
            ),
        ]

    def __str__(self):
        return f"{self.name_snapshot}: -{self.amount} {self.currency}"


class BillingRunItem(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        ALREADY_EXISTS = "already_exists", "Already exists"
        SKIPPED = "skipped", "Skipped"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    billing_run = models.ForeignKey(
        BillingRun,
        on_delete=models.CASCADE,
        related_name="items",
    )
    subscription_id = models.UUIDField(db_index=True)
    period_start = models.DateField()
    invoice = models.ForeignKey(
        Invoice,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="billing_run_items",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
    )
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "billing_run_item"
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["billing_run", "subscription_id", "period_start"],
                name="billing_run_item_unique",
            ),
        ]

    def __str__(self):
        return f"RunItem {self.subscription_id} ({self.period_start}): {self.status}"
