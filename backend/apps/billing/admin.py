from django.contrib import admin

from .models import (
    BillingRun,
    BillingRunItem,
    Invoice,
    InvoiceDiscountLine,
    InvoiceLine,
    InvoiceLineTax,
)


class BillingRunItemInline(admin.TabularInline):
    model = BillingRunItem
    extra = 0
    readonly_fields = ("subscription_id", "period_start", "invoice", "status", "error_message", "created_at")
    can_delete = False


@admin.register(BillingRun)
class BillingRunAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "business_date",
        "status",
        "subscriptions_seen",
        "invoices_created",
        "failures",
        "started_at",
        "finished_at",
    )
    list_filter = ("status", "business_date")
    search_fields = ("id", "error_summary")
    readonly_fields = ("started_at", "finished_at")
    inlines = [BillingRunItemInline]


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "number",
        "customer_name_snapshot",
        "status",
        "billing_period_start",
        "billing_period_end",
        "total",
        "currency",
        "issue_date",
        "due_date",
    )
    list_filter = ("status", "currency", "issue_date")
    search_fields = ("number", "customer_name_snapshot", "customer_email_snapshot")
    inlines = [InvoiceLineInline]


admin.site.register(BillingRunItem)
admin.site.register(InvoiceLine)
admin.site.register(InvoiceLineTax)
admin.site.register(InvoiceDiscountLine)
