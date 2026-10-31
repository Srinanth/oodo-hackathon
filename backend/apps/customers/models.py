import uuid

from django.conf import settings
from django.db import models


class Customer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account_user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="customer_record",
    )
    company_name = models.CharField(max_length=200, blank=True, default="")
    contact_name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254, db_index=True)
    phone = models.CharField(max_length=40, blank=True, default="")
    billing_address = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "customer"
        ordering = ("contact_name", "id")

    def __str__(self):
        return self.company_name or self.contact_name
