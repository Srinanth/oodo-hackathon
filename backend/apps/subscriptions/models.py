import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.customers.models import Customer


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
