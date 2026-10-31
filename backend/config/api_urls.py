from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.customers.views import CustomerViewSet, PortalCustomerView

router = DefaultRouter(trailing_slash=False)
router.register("customers", CustomerViewSet, basename="customer")

urlpatterns = [
    path("", include(router.urls)),
    path("portal/customer", PortalCustomerView.as_view(), name="portal-customer"),
]
