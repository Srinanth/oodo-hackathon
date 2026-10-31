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
