from django.urls import path
from apps.accounts import views as account_views

urlpatterns = [
    path("auth/csrf", account_views.csrf_cookie, name="auth-csrf"),
    path("auth/register", account_views.register, name="auth-register"),
    path("auth/login", account_views.login_view, name="auth-login"),
    path("auth/logout", account_views.logout_view, name="auth-logout"),
    path("auth/me", account_views.me, name="auth-me"),
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
