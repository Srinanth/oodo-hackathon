from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health_check(_request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path("healthz/", health_check, name="health-check"),
    path("api/v1/", include("config.api_urls")),
    path("admin/", admin.site.urls),
    path("", include("config.frontend_urls")),
]
