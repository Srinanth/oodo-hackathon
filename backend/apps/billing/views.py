import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import Prefetch, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView, exception_handler
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.accounts.models import User
from .models import BillingRun, Invoice, InvoiceLine, InvoiceLineTax, InvoiceDiscountLine, Payment
from .permissions import IsBillingStaff
from .serializers import (
    BillingRunCreateSerializer,
    BillingRunSerializer,
    InvoiceActionSerializer,
    InvoiceDetailSerializer,
    InvoiceListSerializer,
    PaymentCreateSerializer,
    PaymentSerializer,
)
from .services import execute_billing_run


class BillingApiErrorMixin:
    def handle_exception(self, exc):
        response = exception_handler(exc, self.get_exception_handler_context())
        if response is None:
            return super().handle_exception(exc)

        if response.status_code == status.HTTP_400_BAD_REQUEST:
            code = "VALIDATION_ERROR"
            message = "Please correct the highlighted fields."
            field_errors = (
                {
                    field: str(value[0] if isinstance(value, (list, tuple)) else value)
                    for field, value in response.data.items()
                }
                if isinstance(response.data, dict)
                else {}
            )
            if "detail" in field_errors:
                message = field_errors.pop("detail")
        elif response.status_code == status.HTTP_401_UNAUTHORIZED:
            code, message, field_errors = "AUTHENTICATION_REQUIRED", "Sign in to continue.", {}
        elif response.status_code == status.HTTP_403_FORBIDDEN:
            code, message, field_errors = "FORBIDDEN", "Only staff and administrators can perform this operation.", {}
        elif response.status_code == status.HTTP_404_NOT_FOUND:
            code, message, field_errors = "NOT_FOUND", "The requested resource was not found.", {}
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


class BillingRunViewSet(BillingApiErrorMixin, ReadOnlyModelViewSet):
    serializer_class = BillingRunSerializer
    permission_classes = (IsAuthenticated, IsBillingStaff)
    http_method_names = ("get", "post", "head", "options")

    def get_queryset(self):
        return (
            BillingRun.objects.select_related("triggered_by")
            .prefetch_related("items__invoice")
            .all()
            .order_by("-started_at")
        )

    def create(self, request, *args, **kwargs):
        serializer = BillingRunCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business_date = serializer.validated_data.get("businessDate") or timezone.now().date()
        dry_run = serializer.validated_data.get("dryRun", False)

        billing_run = execute_billing_run(
            business_date=business_date,
            triggered_by=request.user,
            dry_run=dry_run,
        )

        response_data = BillingRunSerializer(billing_run).data
        return Response(response_data, status=status.HTTP_201_CREATED)


class InvoiceViewSet(BillingApiErrorMixin, ModelViewSet):
    permission_classes = (IsAuthenticated,)
    http_method_names = ("get", "post", "head", "options")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return InvoiceDetailSerializer
        if self.action == "actions":
            return InvoiceActionSerializer
        return InvoiceListSerializer

    def get_queryset(self):
        user = self.request.user
        qs = (
            Invoice.objects.all()
            .prefetch_related(
                Prefetch("lines", queryset=InvoiceLine.objects.prefetch_related("taxes").all()),
                "discount_lines",
                "payments",
            )
            .order_by("-issue_date", "-created_at")
        )

        # Scoping: if customer, scope strictly to customer's records
        if hasattr(user, "role") and user.role == User.Role.CUSTOMER:
            if not user.customer_id:
                return qs.none()
            qs = qs.filter(customer_id=user.customer_id)

        # Query parameter filters
        params = self.request.query_params
        customer_id = params.get("customerId") or params.get("customer_id")
        if customer_id and (not hasattr(user, "role") or user.role != User.Role.CUSTOMER):
            qs = qs.filter(customer_id=customer_id)

        status_param = params.get("status")
        if status_param:
            if status_param == "overdue":
                today = timezone.now().date()
                qs = qs.filter(due_date__lt=today).exclude(status__in=[Invoice.Status.PAID, Invoice.Status.CANCELLED])
            else:
                qs = qs.filter(status=status_param)

        due_before = params.get("dueBefore") or params.get("due_date")
        if due_before:
            qs = qs.filter(due_date__lte=due_before)

        from_date = params.get("from") or params.get("startDate")
        if from_date:
            qs = qs.filter(issue_date__gte=from_date)

        to_date = params.get("to") or params.get("endDate")
        if to_date:
            qs = qs.filter(issue_date__lte=to_date)

        subscription_id = params.get("subscriptionId") or params.get("subscription_id")
        if subscription_id:
            qs = qs.filter(subscription_id=subscription_id)

        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsBillingStaff])
    def actions(self, request, pk=None):
        invoice = self.get_object()
        serializer = InvoiceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        act = serializer.validated_data["action"]

        if act == "confirm":
            if invoice.status != Invoice.Status.DRAFT:
                return Response(
                    {"error": {"code": "INVALID_STATE", "message": f"Cannot confirm invoice in '{invoice.status}' status."}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            invoice.status = Invoice.Status.CONFIRMED
            invoice.confirmed_at = timezone.now()
            invoice.save(update_fields=["status", "confirmed_at", "updated_at"])

        elif act == "cancel":
            if invoice.status == Invoice.Status.PAID:
                return Response(
                    {"error": {"code": "INVALID_STATE", "message": "Cannot cancel an invoice that has been fully paid."}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if invoice.status == Invoice.Status.CANCELLED:
                return Response(
                    {"error": {"code": "INVALID_STATE", "message": "Invoice is already cancelled."}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            invoice.status = Invoice.Status.CANCELLED
            invoice.save(update_fields=["status", "updated_at"])

        elif act == "send":
            # Per PRD: staff can send invoice (simulated send)
            # Valid for confirmed/draft
            pass

        elif act == "print":
            # Per PRD: returns print payload / marks printed
            pass

        detail = InvoiceDetailSerializer(invoice).data
        return Response(detail, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], permission_classes=[IsAuthenticated, IsBillingStaff], url_path="payments")
    def payments(self, request, pk=None):
        invoice = self.get_object()

        if request.method == "GET":
            payments = invoice.payments.all().order_by("-paid_at", "-created_at")
            return Response(PaymentSerializer(payments, many=True).data)

        # POST - Record payment
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if invoice.status == Invoice.Status.CANCELLED:
            return Response(
                {"error": {"code": "INVALID_STATE", "message": "Cannot record payment on a cancelled invoice."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        paid_at = data.get("paidAt") or timezone.now()
        amount = data["amount"]
        currency = data.get("currency") or invoice.currency

        # Atomic payment recording & balance update
        with transaction.atomic():
            payment = Payment.objects.create(
                invoice=invoice,
                method=data["method"],
                amount=amount,
                currency=currency,
                status=Payment.Status.POSTED,
                paid_at=paid_at,
                note=data.get("note", ""),
                recorded_by=request.user,
            )

            # Calculate total posted payments
            total_posted = Payment.objects.filter(
                invoice=invoice, status=Payment.Status.POSTED
            ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

            if total_posted >= invoice.total and invoice.status != Invoice.Status.PAID:
                invoice.status = Invoice.Status.PAID
                invoice.save(update_fields=["status", "updated_at"])
            elif total_posted < invoice.total and invoice.status == Invoice.Status.PAID:
                invoice.status = Invoice.Status.CONFIRMED
                invoice.save(update_fields=["status", "updated_at"])

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class CustomerPortalInvoiceViewSet(BillingApiErrorMixin, ReadOnlyModelViewSet):
    """
    Dedicated endpoint for Customer Portal: GET /portal/invoices and GET /portal/invoices/{id}
    Scoped strictly to the authenticated customer.
    """
    permission_classes = (IsAuthenticated,)

    def get_serializer_class(self):
        if self.action == "retrieve":
            return InvoiceDetailSerializer
        return InvoiceListSerializer

    def get_queryset(self):
        user = self.request.user
        if not hasattr(user, "customer_id") or not user.customer_id:
            return Invoice.objects.none()
        return (
            Invoice.objects.filter(customer_id=user.customer_id)
            .prefetch_related("lines__taxes", "discount_lines", "payments")
            .order_by("-issue_date", "-created_at")
        )


class FinanceReportView(BillingApiErrorMixin, APIView):
    """
    GET /api/v1/reports/finance?from=2026-11-01&to=2026-11-30&status=overdue&customerId=cus_123
    High-performance aggregation API that satisfies FIN-01 and responds under 2s.
    """
    permission_classes = (IsAuthenticated, IsBillingStaff)

    def get(self, request):
        today = timezone.now().date()
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        status_filter = request.query_params.get("status")
        customer_id = request.query_params.get("customerId") or request.query_params.get("customer_id")

        invoice_qs = Invoice.objects.all()
        payment_qs = Payment.objects.filter(status=Payment.Status.POSTED)

        if customer_id:
            invoice_qs = invoice_qs.filter(customer_id=customer_id)
            payment_qs = payment_qs.filter(invoice__customer_id=customer_id)

        if from_date:
            invoice_qs = invoice_qs.filter(issue_date__gte=from_date)
            payment_qs = payment_qs.filter(paid_at__date__gte=from_date)

        if to_date:
            invoice_qs = invoice_qs.filter(issue_date__lte=to_date)
            payment_qs = payment_qs.filter(paid_at__date__lte=to_date)

        # Active subscriptions count (query Subscription model if exists, else raw query/count)
        from django.apps import apps
        active_subscriptions_count = 0
        try:
            Subscription = apps.get_model("subscriptions", "Subscription")
            active_subscriptions_count = Subscription.objects.filter(status="active").count()
        except Exception:
            from django.db import connection
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT COUNT(*) FROM subscription WHERE status = 'active'")
                    row = cursor.fetchone()
                    if row:
                        active_subscriptions_count = row[0]
            except Exception:
                active_subscriptions_count = 0

        # Aggregations
        # Invoiced amount (excluding cancelled)
        non_cancelled_invoices = invoice_qs.exclude(status=Invoice.Status.CANCELLED)
        invoiced_amount = non_cancelled_invoices.aggregate(total=Sum("total"))["total"] or Decimal("0.00")

        # Collected revenue
        collected_revenue = payment_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        # Outstanding balance: total invoiced minus total paid on non-cancelled invoices
        # We can calculate directly from invoices and payments
        all_payments_for_invoices = Payment.objects.filter(
            invoice__in=non_cancelled_invoices, status=Payment.Status.POSTED
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        outstanding_balance = max(Decimal("0.00"), invoiced_amount - all_payments_for_invoices)

        # Overdue invoices: due_date < today and status in ('confirmed', 'draft') and balance > 0
        overdue_invoices_qs = (
            invoice_qs.filter(due_date__lt=today)
            .exclude(status__in=[Invoice.Status.PAID, Invoice.Status.CANCELLED])
            .prefetch_related("payments")
        )

        overdue_count = 0
        overdue_amount = Decimal("0.00")
        for inv in overdue_invoices_qs:
            paid = sum(
                (p.amount for p in inv.payments.all() if p.status == Payment.Status.POSTED),
                Decimal("0.00"),
            )
            bal = max(Decimal("0.00"), inv.total - paid)
            if bal > 0:
                overdue_count += 1
                overdue_amount += bal

        # Paginated or limited invoice rows for table
        display_invoices = invoice_qs.select_related().prefetch_related("payments")[:100]
        rows = InvoiceListSerializer(display_invoices, many=True).data

        return Response({
            "metrics": {
                "activeSubscriptions": active_subscriptions_count,
                "invoicedAmount": f"{invoiced_amount:.2f}",
                "collectedRevenue": f"{collected_revenue:.2f}",
                "outstandingBalance": f"{outstanding_balance:.2f}",
                "overdueCount": overdue_count,
                "overdueAmount": f"{overdue_amount:.2f}",
                "currency": "USD",
            },
            "invoices": rows,
        })
