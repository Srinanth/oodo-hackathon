from django.contrib import admin

from .models import QuoteTemplate


@admin.register(QuoteTemplate)
class QuoteTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "validity_days", "payment_terms", "created_by", "updated_at")
    search_fields = ("name", "payment_terms")
    ordering = ("name",)
