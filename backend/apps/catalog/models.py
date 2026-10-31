import uuid

from django.db import models
from django.db.models import Q


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    product_type = models.CharField(max_length=24)
    sales_price = models.DecimalField(max_digits=14, decimal_places=2)
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3)
    notes = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product"
        ordering = ("name", "id")
        constraints = [
            models.CheckConstraint(condition=Q(sales_price__gte=0), name="product_sales_price_nonnegative"),
            models.CheckConstraint(condition=Q(cost_price__gte=0), name="product_cost_price_nonnegative"),
        ]

    def __str__(self):
        return self.name


class ProductVariant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="variants")
    name = models.CharField(max_length=160)
    price_adjustment = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "product_variant"
        ordering = ("name", "id")
        constraints = [
            models.UniqueConstraint(fields=("product", "name"), name="product_variant_name_unique"),
        ]

    def __str__(self):
        return f"{self.product.name} — {self.name}"


class Plan(models.Model):
    class Interval(models.TextChoices):
        DAILY = "daily", "Daily"
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"
        YEARLY = "yearly", "Yearly"

    class EndPolicy(models.TextChoices):
        CLOSE_AT_END = "close_at_end", "Close at end"
        RENEW_UNTIL_CLOSED = "renew_until_closed", "Renew until closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    interval_unit = models.CharField(max_length=12, choices=Interval.choices)
    interval_count = models.PositiveSmallIntegerField(default=1)
    price = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3)
    minimum_quantity = models.PositiveIntegerField(default=1)
    available_from = models.DateField(null=True, blank=True)
    available_until = models.DateField(null=True, blank=True)
    end_policy = models.CharField(max_length=24, choices=EndPolicy.choices)
    allow_pause = models.BooleanField(default=False)
    allow_renewal = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plan"
        ordering = ("name", "id")
        constraints = [
            models.CheckConstraint(condition=Q(interval_unit__in=["daily", "weekly", "monthly", "yearly"]), name="plan_interval_valid"),
            models.CheckConstraint(condition=Q(interval_count__gt=0), name="plan_interval_count_positive"),
            models.CheckConstraint(condition=Q(price__gte=0), name="plan_price_nonnegative"),
            models.CheckConstraint(condition=Q(minimum_quantity__gt=0), name="plan_minimum_quantity_positive"),
            models.CheckConstraint(condition=Q(end_policy__in=["close_at_end", "renew_until_closed"]), name="plan_end_policy_valid"),
            models.CheckConstraint(condition=Q(available_until__isnull=True) | Q(available_from__isnull=True) | Q(available_until__gte=models.F("available_from")), name="plan_availability_ordered"),
        ]

    def __str__(self):
        return self.name


class TaxRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    rate_percent = models.DecimalField(max_digits=7, decimal_places=4)
    active_from = models.DateField(null=True, blank=True)
    active_until = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tax_rule"
        ordering = ("name", "id")
        constraints = [
            models.CheckConstraint(condition=Q(rate_percent__gte=0, rate_percent__lte=100), name="tax_rule_rate_range"),
            models.CheckConstraint(condition=Q(active_until__isnull=True) | Q(active_from__isnull=True) | Q(active_until__gte=models.F("active_from")), name="tax_rule_date_ordered"),
        ]

    def __str__(self):
        return f"{self.name} ({self.rate_percent}%)"


class DiscountRule(models.Model):
    class DiscountType(models.TextChoices):
        FIXED = "fixed", "Fixed amount"
        PERCENTAGE = "percentage", "Percentage"

    class Scope(models.TextChoices):
        PRODUCTS = "products", "Selected products"
        WHOLE_SUBSCRIPTION = "whole_subscription", "Whole subscription"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    discount_type = models.CharField(max_length=12, choices=DiscountType.choices)
    value = models.DecimalField(max_digits=14, decimal_places=4)
    currency = models.CharField(max_length=3, null=True, blank=True)
    minimum_purchase = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    minimum_quantity = models.PositiveIntegerField(default=1)
    scope = models.CharField(max_length=24, choices=Scope.choices)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    maximum_uses = models.PositiveIntegerField(null=True, blank=True)
    products = models.ManyToManyField("Product", through="DiscountRuleProduct", related_name="discount_rules")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "discount_rule"
        ordering = ("name", "id")
        constraints = [
            models.CheckConstraint(condition=Q(discount_type__in=["fixed", "percentage"]), name="discount_rule_type_valid"),
            models.CheckConstraint(condition=Q(value__gt=0), name="discount_rule_value_positive"),
            models.CheckConstraint(condition=Q(discount_type="fixed", currency__isnull=False) | Q(discount_type="percentage"), name="discount_rule_fixed_currency_required"),
            models.CheckConstraint(condition=Q(discount_type="percentage", value__lte=100) | Q(discount_type="fixed"), name="discount_rule_percent_at_most_100"),
            models.CheckConstraint(condition=Q(minimum_purchase__gte=0), name="discount_rule_minimum_purchase_nonnegative"),
            models.CheckConstraint(condition=Q(minimum_quantity__gt=0), name="discount_rule_minimum_quantity_positive"),
            models.CheckConstraint(condition=Q(scope__in=["products", "whole_subscription"]), name="discount_rule_scope_valid"),
            models.CheckConstraint(condition=Q(maximum_uses__isnull=True) | Q(maximum_uses__gt=0), name="discount_rule_maximum_uses_positive"),
            models.CheckConstraint(condition=Q(ends_at__isnull=True) | Q(starts_at__isnull=True) | Q(ends_at__gte=models.F("starts_at")), name="discount_rule_date_ordered"),
        ]

    def __str__(self):
        return self.name


class DiscountRuleProduct(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    discount_rule = models.ForeignKey(DiscountRule, on_delete=models.CASCADE, db_column="discount_rule_id")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, db_column="product_id")

    class Meta:
        db_table = "discount_rule_product"
        constraints = [
            models.UniqueConstraint(fields=("discount_rule", "product"), name="discount_rule_product_unique"),
        ]


class DiscountRedemption(models.Model):
    class Status(models.TextChoices):
        RESERVED = "reserved", "Reserved"
        CONSUMED = "consumed", "Consumed"
        RELEASED = "released", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    discount_rule = models.ForeignKey(DiscountRule, on_delete=models.PROTECT, related_name="redemptions", db_column="discount_rule_id")
    # Invoice owns the related model in the billing feature; this UUID allows
    # the discount reservation contract to land before that app's model exists.
    invoice_id = models.UUIDField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.RESERVED)
    reserved_at = models.DateTimeField(auto_now_add=True)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "discount_redemption"
        constraints = [
            models.UniqueConstraint(fields=("discount_rule", "invoice_id"), name="discount_redemption_rule_invoice_unique"),
            models.CheckConstraint(condition=Q(status__in=["reserved", "consumed", "released"]), name="discount_redemption_status_valid"),
        ]
        indexes = [
            models.Index(fields=("discount_rule", "status"), name="discount_redemption_usage_idx"),
            models.Index(fields=("invoice_id",), name="discount_red_invoice_idx"),
        ]
