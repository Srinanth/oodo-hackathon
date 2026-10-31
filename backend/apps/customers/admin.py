from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("contact_name", "company_name", "email", "account_user")
    list_filter = ("created_at",)
    search_fields = ("contact_name", "company_name", "email")
