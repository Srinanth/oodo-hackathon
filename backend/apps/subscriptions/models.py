import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.customers.models import Customer
from apps.catalog.models import Plan, Product, ProductVariant, TaxRule


class QuoteTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    validity_days = models.PositiveIntegerField()
    payment_terms = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_quote_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "quote_template"
        ordering = ("name", "id")
        constraints = [
            models.CheckConstraint(
                condition=Q(validity_days__gt=0),
                name="quote_template_validity_days_positive",
            ),
        ]

    def __str__(self):
        return self.name


class QuoteTemplateLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(QuoteTemplate, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    plan = models.ForeignKey(Plan, null=True, blank=True, on_delete=models.PROTECT)
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.PROTECT)
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.PROTECT)
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    tax_rules = models.ManyToManyField(TaxRule, through="QuoteTemplateLineTaxRule", blank=True, related_name="quote_template_lines")

    class Meta:
        db_table = "quote_template_line"
        ordering = ("line_number", "id")
        constraints = [
            models.UniqueConstraint(fields=("template", "line_number"), name="quote_tpl_line_unique"),
            models.CheckConstraint(condition=Q(line_number__gt=0), name="quote_tpl_line_number_positive"),
            models.CheckConstraint(condition=Q(quantity__gt=0), name="quote_tpl_line_quantity_positive"),
            models.CheckConstraint(condition=~Q(plan__isnull=True, product__isnull=True), name="quote_tpl_line_source_required"),
        ]


class Quote(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        QUOTATION = "quotation", "Quotation"
        CONFIRMED = "confirmed", "Confirmed"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=40, unique=True, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="quotes")
    template = models.ForeignKey(
        QuoteTemplate,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quotes",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    valid_until = models.DateField()
    start_date = models.DateField(default=timezone.localdate)
    expiry_date = models.DateField(null=True, blank=True)
    payment_terms = models.CharField(max_length=200, blank=True, default="")
    currency = models.CharField(max_length=3, default="USD")
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_quotes",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "quote"
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=["draft", "quotation", "confirmed", "expired", "cancelled"]),
                name="quote_status_valid",
            ),
            models.CheckConstraint(condition=Q(subtotal__gte=0), name="quote_subtotal_nonnegative"),
            models.CheckConstraint(condition=Q(tax_total__gte=0), name="quote_tax_total_nonnegative"),
            models.CheckConstraint(condition=Q(discount_total__gte=0), name="quote_discount_total_nonnegative"),
            models.CheckConstraint(condition=Q(total__gte=0), name="quote_total_nonnegative"),
            models.CheckConstraint(
                condition=Q(expiry_date__isnull=True) | Q(expiry_date__gte=models.F("start_date")),
                name="quote_expiry_after_start",
            ),
        ]
        indexes = [models.Index(fields=("customer", "status"), name="quote_customer_status_idx")]

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = f"Q-{uuid.uuid4().hex}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.number


class QuoteLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    plan = models.ForeignKey(Plan, null=True, blank=True, on_delete=models.PROTECT)
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.PROTECT)
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.PROTECT)
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "quote_line"
        ordering = ("line_number", "id")
        constraints = [
            models.UniqueConstraint(fields=("quote", "line_number"), name="quote_line_unique"),
            models.CheckConstraint(condition=Q(line_number__gt=0), name="quote_line_number_positive"),
            models.CheckConstraint(condition=Q(quantity__gt=0), name="quote_line_quantity_positive"),
            models.CheckConstraint(condition=Q(unit_price__gte=0), name="quote_line_unit_price_nonnegative"),
            models.CheckConstraint(condition=Q(subtotal__gte=0), name="quote_line_subtotal_nonnegative"),
            models.CheckConstraint(condition=Q(tax_total__gte=0), name="quote_line_tax_nonnegative"),
            models.CheckConstraint(condition=Q(discount_total__gte=0), name="quote_line_discount_nonnegative"),
            models.CheckConstraint(condition=Q(total__gte=0), name="quote_line_total_nonnegative"),
        ]


class QuoteLineTax(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quote_line = models.ForeignKey(QuoteLine, on_delete=models.CASCADE, related_name="taxes")
    tax_rule = models.ForeignKey(TaxRule, null=True, blank=True, on_delete=models.SET_NULL)
    name_snapshot = models.CharField(max_length=160)
    rate_percent_snapshot = models.DecimalField(max_digits=7, decimal_places=4)
    amount = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "quote_line_tax"
        constraints = [
            models.CheckConstraint(condition=Q(rate_percent_snapshot__gte=0), name="quote_line_tax_rate_nonnegative"),
            models.CheckConstraint(condition=Q(amount__gte=0), name="quote_line_tax_amount_nonnegative"),
        ]


class QuoteTemplateLineTaxRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quote_template_line = models.ForeignKey(QuoteTemplateLine, on_delete=models.CASCADE)
    tax_rule = models.ForeignKey(TaxRule, on_delete=models.PROTECT)

    class Meta:
        db_table = "quote_template_line_tax_rule"
        constraints = [models.UniqueConstraint(fields=("quote_template_line", "tax_rule"), name="quote_tpl_line_tax_unique")]


class Subscription(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmed"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=40, unique=True, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="subscriptions")
    source_quote = models.OneToOneField(Quote, null=True, blank=True, on_delete=models.PROTECT, related_name="subscription")
    plan = models.ForeignKey(Plan, null=True, blank=True, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    start_date = models.DateField()
    expiry_date = models.DateField(null=True, blank=True)
    next_period_start = models.DateField()
    next_billing_at = models.DateField(db_index=True)
    payment_terms = models.CharField(max_length=200, blank=True, default="")
    currency = models.CharField(max_length=3, default="USD")
    close_at_period_end = models.BooleanField(default=False)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscription"
        ordering = ("-created_at", "id")
        indexes = [
            models.Index(fields=("status", "next_billing_at"), name="sub_status_due_idx"),
            models.Index(fields=("customer", "status"), name="subs_cust_status_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(status__in=["confirmed", "active", "paused", "closed"]), name="subscription_status_valid"),
            models.CheckConstraint(condition=Q(expiry_date__isnull=True) | Q(expiry_date__gte=models.F("start_date")), name="subscription_expiry_valid"),
        ]

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = f"S-{uuid.uuid4().hex[:12].upper()}"
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.number


class SubscriptionLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    plan = models.ForeignKey(Plan, null=True, blank=True, on_delete=models.PROTECT)
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.PROTECT)
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.PROTECT)
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3)
    tax_rules = models.ManyToManyField(TaxRule, through="SubscriptionLineTaxRule", related_name="subscription_lines")

    class Meta:
        db_table = "subscription_line"
        ordering = ("line_number", "id")
        constraints = [
            models.UniqueConstraint(fields=("subscription", "line_number"), name="subscription_line_unique"),
            models.CheckConstraint(condition=Q(line_number__gt=0), name="subscription_line_number_positive"),
            models.CheckConstraint(condition=Q(quantity__gt=0), name="subscription_line_quantity_positive"),
            models.CheckConstraint(condition=Q(unit_price__gte=0), name="subscription_line_price_nonnegative"),
        ]


class SubscriptionLineTaxRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription_line = models.ForeignKey(SubscriptionLine, on_delete=models.CASCADE)
    tax_rule = models.ForeignKey(TaxRule, on_delete=models.PROTECT)

    class Meta:
        db_table = "subscription_line_tax_rule"
        constraints = [models.UniqueConstraint(fields=("subscription_line", "tax_rule"), name="subscription_line_tax_unique")]


class SubscriptionEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=32)
    from_status = models.CharField(max_length=16, blank=True, default="")
    to_status = models.CharField(max_length=16)
    note = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "subscription_event"
        ordering = ("created_at", "id")
        indexes = [models.Index(fields=("subscription", "created_at"), name="subscription_event_history_idx")]
