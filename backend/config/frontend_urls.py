from django.urls import path

from .views import frontend_app

urlpatterns = [
    path("", frontend_app, name="frontend-app"),
    path(
        "password-reset/<uidb64>/<token>/",
        frontend_app,
        name="password_reset_confirm",
    ),
]
