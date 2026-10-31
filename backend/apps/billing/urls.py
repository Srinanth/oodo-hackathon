from rest_framework.routers import SimpleRouter

from .views import BillingRunViewSet

router = SimpleRouter(trailing_slash=False)
router.register("billing-runs", BillingRunViewSet, basename="billing-run")

urlpatterns = router.urls
