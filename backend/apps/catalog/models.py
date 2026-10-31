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
