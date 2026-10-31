from django.urls import include
from rest_framework.routers import SimpleRouter

from .views import PortalSubscriptionViewSet, QuoteTemplateViewSet, QuoteViewSet, SubscriptionViewSet

router = SimpleRouter(trailing_slash=False)
router.register("quote-templates", QuoteTemplateViewSet, basename="quote-template")
router.register("quotes", QuoteViewSet, basename="quote")
router.register("subscriptions", SubscriptionViewSet, basename="subscription")
router.register("portal/subscriptions", PortalSubscriptionViewSet, basename="portal-subscription")

urlpatterns = router.urls
