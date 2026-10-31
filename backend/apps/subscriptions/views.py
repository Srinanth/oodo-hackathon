import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import exception_handler
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from rest_framework.decorators import action

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.customers.permissions import IsCustomerAccount, IsOperationalStaff
from .models import Quote, QuoteTemplate, Subscription, SubscriptionEvent
from .pagination import QuoteCursorPagination, QuoteTemplateCursorPagination
from .permissions import CanManageQuoteTemplates
from .serializers import PortalSubscriptionSerializer, QuoteSerializer, QuoteTemplateSerializer, SubscriptionSerializer
from .services import convert_quote_to_subscription, interval_add


class QuoteTemplateViewSet(ModelViewSet):
    serializer_class = QuoteTemplateSerializer
    permission_classes = (IsAuthenticated, CanManageQuoteTemplates)
    pagination_class = QuoteTemplateCursorPagination
    http_method_names = ("get", "post", "patch", "head", "options")

    def handle_exception(self, exc):
        response = exception_handler(exc, self.get_exception_handler_context())
        if response is None:
            return super().handle_exception(exc)

        if response.status_code == status.HTTP_400_BAD_REQUEST:
            code = "VALIDATION_ERROR"
            message = "Please correct the highlighted fields."
            field_errors = {
                field: str(value[0] if isinstance(value, (list, tuple)) else value)
                for field, value in response.data.items()
            } if isinstance(response.data, dict) else {}
            if "detail" in field_errors:
                message = field_errors.pop("detail")
        elif response.status_code == status.HTTP_401_UNAUTHORIZED:
            code, message, field_errors = "AUTHENTICATION_REQUIRED", "Sign in to continue.", {}
        elif response.status_code == status.HTTP_403_FORBIDDEN:
            code, message, field_errors = "FORBIDDEN", "You do not have access to this action.", {}
        elif response.status_code == status.HTTP_404_NOT_FOUND:
            code, message, field_errors = "NOT_FOUND", "The requested template was not found.", {}
        else:
            code, message, field_errors = "API_ERROR", "The request could not be completed.", {}

        payload = {
            "error": {
                "code": code,
                "message": message,
                "requestId": uuid.uuid4().hex,
            }
        }
        if field_errors:
            payload["error"]["fieldErrors"] = field_errors
        return Response(payload, status=response.status_code, headers=response.headers)

    def get_queryset(self):
        queryset = QuoteTemplate.objects.select_related("created_by").all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(payment_terms__icontains=search))
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class QuoteApiErrorMixin:
    def handle_exception(self, exc):
        response = exception_handler(exc, self.get_exception_handler_context())
        if response is None:
            return super().handle_exception(exc)
        if response.status_code == status.HTTP_400_BAD_REQUEST:
            code, message = "VALIDATION_ERROR", "Please correct the highlighted fields."
            field_errors = {
                field: str(value[0] if isinstance(value, (list, tuple)) else value)
                for field, value in response.data.items()
            } if isinstance(response.data, dict) else {}
        elif response.status_code == status.HTTP_401_UNAUTHORIZED:
            code, message, field_errors = "AUTHENTICATION_REQUIRED", "Sign in to continue.", {}
        elif response.status_code == status.HTTP_403_FORBIDDEN:
            code, message, field_errors = "FORBIDDEN", "You do not have access to this action.", {}
        elif response.status_code == status.HTTP_404_NOT_FOUND:
            code, message, field_errors = "NOT_FOUND", "The requested quote was not found.", {}
        else:
            code, message, field_errors = "API_ERROR", "The request could not be completed.", {}
        payload = {"error": {"code": code, "message": message, "requestId": uuid.uuid4().hex}}
        if field_errors:
            payload["error"]["fieldErrors"] = field_errors
        return Response(payload, status=response.status_code, headers=response.headers)


class QuoteViewSet(QuoteApiErrorMixin, ModelViewSet):
    serializer_class = QuoteSerializer
    permission_classes = (IsAuthenticated, IsOperationalStaff)
    pagination_class = QuoteCursorPagination
    http_method_names = ("get", "post", "patch", "head", "options")

    def get_queryset(self):
        queryset = Quote.objects.select_related("customer", "template", "created_by").all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(number__icontains=search)
                | Q(customer__contact_name__icontains=search)
                | Q(customer__company_name__icontains=search)
            )
        status_filter = self.request.query_params.get("status", "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=("post",), permission_classes=(IsAuthenticated, IsOperationalStaff))
    def send(self, request, pk=None):
        with transaction.atomic():
            quote = Quote.objects.select_for_update().get(pk=self.get_object().pk)
            if quote.status != Quote.Status.DRAFT:
                return Response({"error": {"code": "INVALID_STATE", "message": "Only draft quotes can be sent."}}, status=status.HTTP_400_BAD_REQUEST)
            if quote.valid_until < timezone.localdate():
                quote.status = Quote.Status.EXPIRED
                quote.save(update_fields=("status", "updated_at"))
                return Response({"error": {"code": "QUOTE_EXPIRED", "message": "This quote has expired."}}, status=status.HTTP_400_BAD_REQUEST)
            if not quote.lines.exists():
                return Response({"error": {"code": "QUOTE_UNPRICED", "message": "Add at least one priced line before sending."}}, status=status.HTTP_400_BAD_REQUEST)
            quote.status = Quote.Status.QUOTATION
            quote.save(update_fields=("status", "updated_at"))
        payload = QuoteSerializer(quote).data
        payload["deliveryStatus"] = "simulated"
        payload["deliveryMessage"] = "Quotation email delivery is simulated; no email provider is configured."
        return Response(payload)

    @action(detail=True, methods=("post",), permission_classes=(IsAuthenticated, IsOperationalStaff))
    def confirm(self, request, pk=None):
        quote = self.get_object()
        try:
            subscription = convert_quote_to_subscription(quote, request.user)
        except ValueError as exc:
            return Response({"error": {"code": "INVALID_STATE", "message": str(exc)}}, status=status.HTTP_400_BAD_REQUEST)
        quote.refresh_from_db()
        payload = QuoteSerializer(quote).data
        payload["subscriptionId"] = str(subscription.pk)
        return Response(payload)


class SubscriptionApiErrorMixin:
    def handle_exception(self, exc):
        response = exception_handler(exc, self.get_exception_handler_context())
        if response is None:
            return super().handle_exception(exc)
        if response.status_code == status.HTTP_400_BAD_REQUEST:
            code, message = "VALIDATION_ERROR", "Please correct the highlighted fields."
        elif response.status_code == status.HTTP_401_UNAUTHORIZED:
            code, message = "AUTHENTICATION_REQUIRED", "Sign in to continue."
        elif response.status_code == status.HTTP_403_FORBIDDEN:
            code, message = "FORBIDDEN", "You do not have access to this action."
        elif response.status_code == status.HTTP_404_NOT_FOUND:
            code, message = "NOT_FOUND", "The requested subscription was not found."
        else:
            code, message = "API_ERROR", "The request could not be completed."
        return Response({"error": {"code": code, "message": message, "requestId": uuid.uuid4().hex}}, status=response.status_code, headers=response.headers)


class SubscriptionViewSet(SubscriptionApiErrorMixin, ReadOnlyModelViewSet):
    serializer_class = SubscriptionSerializer
    permission_classes = (IsAuthenticated,)
    pagination_class = QuoteCursorPagination
    http_method_names = ("get", "post", "head", "options")

    def get_queryset(self):
        queryset = Subscription.objects.select_related("customer", "plan", "source_quote").prefetch_related("lines", "events")
        user = self.request.user
        if user.role == User.Role.CUSTOMER:
            return queryset.filter(customer__account_user=user)
        if user.role not in (User.Role.ADMIN, User.Role.STAFF):
            return queryset.none()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(number__icontains=search) | Q(customer__contact_name__icontains=search) | Q(customer__company_name__icontains=search))
        state = self.request.query_params.get("status", "").strip()
        if state:
            queryset = queryset.filter(status=state)
        return queryset

    def list(self, request, *args, **kwargs):
        if request.user.role not in (User.Role.ADMIN, User.Role.STAFF, User.Role.CUSTOMER):
            return Response({"error": {"code": "FORBIDDEN", "message": "You do not have access to this action."}}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @action(detail=True, methods=("post",), permission_classes=(IsAuthenticated,))
    def actions(self, request, pk=None):
        action_name = request.data.get("action")
        allowed = {"activate", "pause", "resume", "renew", "close_early", "close_at_period_end"}
        if not isinstance(action_name, str) or action_name not in allowed:
            return Response({"error": {"code": "VALIDATION_ERROR", "message": "Choose a supported subscription action."}}, status=status.HTTP_400_BAD_REQUEST)
        note = request.data.get("note", "")
        if not isinstance(note, str) or len(note) > 500:
            return Response({"error": {"code": "VALIDATION_ERROR", "message": "Note must be 500 characters or fewer."}}, status=status.HTTP_400_BAD_REQUEST)
        is_customer = request.user.role == User.Role.CUSTOMER
        if is_customer and action_name not in {"pause", "resume", "renew"}:
            return Response({"error": {"code": "FORBIDDEN", "message": "Customers can only pause, resume, or renew their own subscriptions."}}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            subscription = Subscription.objects.select_for_update().select_related("plan", "customer").get(pk=self.get_object().pk)
            before = subscription.status
            if action_name == "pause":
                if subscription.status != Subscription.Status.ACTIVE or not (subscription.plan and subscription.plan.allow_pause):
                    return Response({"error": {"code": "INVALID_STATE", "message": "This subscription cannot be paused."}}, status=status.HTTP_400_BAD_REQUEST)
                subscription.status = Subscription.Status.PAUSED
            elif action_name in {"resume", "activate"}:
                if subscription.status not in {Subscription.Status.PAUSED, Subscription.Status.CONFIRMED}:
                    return Response({"error": {"code": "INVALID_STATE", "message": "Only confirmed or paused subscriptions can be activated."}}, status=status.HTTP_400_BAD_REQUEST)
                subscription.status = Subscription.Status.ACTIVE
                if subscription.next_billing_at < timezone.localdate():
                    subscription.next_billing_at = timezone.localdate()
                    subscription.next_period_start = timezone.localdate()
            elif action_name == "renew":
                if not (subscription.plan and subscription.plan.allow_renewal):
                    return Response({"error": {"code": "POLICY_DENIED", "message": "The subscription plan does not allow renewal."}}, status=status.HTTP_400_BAD_REQUEST)
                if subscription.status == Subscription.Status.CLOSED:
                    subscription.status = Subscription.Status.ACTIVE
                    subscription.closed_at = None
                    subscription.start_date = timezone.localdate()
                    subscription.next_billing_at = timezone.localdate()
                    subscription.next_period_start = timezone.localdate()
                elif subscription.status == Subscription.Status.ACTIVE:
                    pass
                else:
                    return Response({"error": {"code": "INVALID_STATE", "message": "Resume a paused subscription before renewing it."}}, status=status.HTTP_400_BAD_REQUEST)
                if subscription.plan.end_policy == "close_at_end":
                    subscription.expiry_date = interval_add(subscription.next_billing_at, subscription.plan) - timedelta(days=1)
                    subscription.close_at_period_end = True
                else:
                    subscription.expiry_date = None
                    subscription.close_at_period_end = False
            elif action_name == "close_early":
                if subscription.status == Subscription.Status.CLOSED:
                    return Response({"error": {"code": "INVALID_STATE", "message": "Subscription is already closed."}}, status=status.HTTP_400_BAD_REQUEST)
                subscription.status = Subscription.Status.CLOSED
                subscription.closed_at = timezone.now()
                subscription.close_at_period_end = False
            elif action_name == "close_at_period_end":
                if subscription.status != Subscription.Status.ACTIVE:
                    return Response({"error": {"code": "INVALID_STATE", "message": "Only active subscriptions can be scheduled to close."}}, status=status.HTTP_400_BAD_REQUEST)
                subscription.close_at_period_end = True
                period_start = subscription.next_period_start
                interval_end = interval_add(period_start, subscription.plan) - timedelta(days=1)
                subscription.expiry_date = interval_end
                if interval_end < timezone.localdate():
                    subscription.status = Subscription.Status.CLOSED
                    subscription.closed_at = timezone.now()
                    subscription.close_at_period_end = False
            subscription.save()
            SubscriptionEvent.objects.create(subscription=subscription, actor=request.user, action=action_name, from_status=before, to_status=subscription.status, note=note)
        return Response(SubscriptionSerializer(subscription).data)


class PortalSubscriptionViewSet(SubscriptionViewSet):
    serializer_class = PortalSubscriptionSerializer
    permission_classes = (IsAuthenticated, IsCustomerAccount)
    http_method_names = ("get", "head", "options")

    def get_queryset(self):
        return Subscription.objects.filter(customer__account_user=self.request.user).select_related("customer", "plan").prefetch_related("lines", "events")
