from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    BillingRunViewSet,
    CustomerPortalInvoiceViewSet,
    FinanceReportView,
    InvoiceViewSet,
)

router = SimpleRouter(trailing_slash=False)
router.register("billing-runs", BillingRunViewSet, basename="billing-run")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("portal/invoices", CustomerPortalInvoiceViewSet, basename="portal-invoice")

urlpatterns = router.urls + [
    path("reports/finance", FinanceReportView.as_view(), name="finance-report"),
]
