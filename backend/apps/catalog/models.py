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
