from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.customers.views import CustomerViewSet, PortalCustomerView
from apps.subscriptions.views import QuoteTemplateViewSet

router = DefaultRouter(trailing_slash=False)
router.register("customers", CustomerViewSet, basename="customer")
router.register("quote-templates", QuoteTemplateViewSet, basename="quote-template")

urlpatterns = [
    path("", include(router.urls)),
    path("portal/customer", PortalCustomerView.as_view(), name="portal-customer"),
]
