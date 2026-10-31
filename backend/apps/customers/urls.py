from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import CustomerViewSet, PortalCustomerView

router = SimpleRouter(trailing_slash=False)
router.register("customers", CustomerViewSet, basename="customer")

urlpatterns = router.urls + [
    path("portal/customer", PortalCustomerView.as_view(), name="portal-customer"),
]
