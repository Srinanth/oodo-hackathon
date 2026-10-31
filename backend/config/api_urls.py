from django.urls import path
from apps.accounts import views as account_views
from apps.catalog import views as catalog_views

urlpatterns = [
    path("auth/csrf", account_views.csrf_cookie, name="auth-csrf"),
    path("auth/register", account_views.register, name="auth-register"),
    path("auth/login", account_views.login_view, name="auth-login"),
    path("auth/logout", account_views.logout_view, name="auth-logout"),
    path("auth/me", account_views.me, name="auth-me"),
    path("staff", account_views.staff_accounts, name="staff-accounts"),
    path("products", catalog_views.products, name="product-list-create"),
    path("products/<uuid:product_id>", catalog_views.product_detail, name="product-detail"),
    path("products/<uuid:product_id>/variants", catalog_views.product_variants, name="variant-create"),
    path("products/<uuid:product_id>/variants/<uuid:variant_id>", catalog_views.product_variant_detail, name="variant-detail"),
    path("plans", catalog_views.plans, name="plan-list-create"),
    path("plans/<uuid:plan_id>", catalog_views.plan_detail, name="plan-detail"),
    path("tax-rules", catalog_views.tax_rules, name="tax-rule-list-create"),
    path("tax-rules/<uuid:tax_rule_id>", catalog_views.tax_rule_detail, name="tax-rule-detail"),
    path("tax-rules/<uuid:tax_rule_id>/preview", catalog_views.tax_rule_preview, name="tax-rule-preview"),
    path("discount-rules", catalog_views.discount_rules, name="discount-rule-list-create"),
    path("discount-rules/<uuid:discount_rule_id>", catalog_views.discount_rule_detail, name="discount-rule-detail"),
    path("discount-rules/<uuid:discount_rule_id>/preview", catalog_views.discount_rule_preview, name="discount-rule-preview"),
    path(
        "auth/password-reset-requests",
        account_views.password_reset_request,
        name="auth-password-reset-request",
    ),
    path(
        "auth/password-resets",
        account_views.password_reset,
        name="auth-password-reset",
    ),
]
