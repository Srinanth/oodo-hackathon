import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


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
