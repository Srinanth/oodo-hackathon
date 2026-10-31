from decimal import Decimal
from rest_framework import serializers

from .models import (
    BillingRun,
    BillingRunItem,
    Invoice,
    InvoiceDiscountLine,
    InvoiceLine,
    InvoiceLineTax,
    Payment,
)


class BillingRunItemSerializer(serializers.ModelSerializer):
    subscriptionId = serializers.UUIDField(source="subscription_id")
    periodStart = serializers.DateField(source="period_start")
    invoiceId = serializers.UUIDField(source="invoice.id", read_only=True, default=None)
    invoiceNumber = serializers.CharField(source="invoice.number", read_only=True, default=None)
    errorMessage = serializers.CharField(source="error_message")
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = BillingRunItem
        fields = (
            "id",
            "subscriptionId",
            "periodStart",
            "invoiceId",
            "invoiceNumber",
            "status",
            "errorMessage",
            "createdAt",
        )


class BillingRunSerializer(serializers.ModelSerializer):
    businessDate = serializers.DateField(source="business_date")
    startedAt = serializers.DateTimeField(source="started_at")
    finishedAt = serializers.DateTimeField(source="finished_at", allow_null=True)
    subscriptionsSeen = serializers.IntegerField(source="subscriptions_seen")
    invoicesCreated = serializers.IntegerField(source="invoices_created")
    errorSummary = serializers.CharField(source="error_summary")
    triggeredByEmail = serializers.EmailField(
        source="triggered_by.email",
        read_only=True,
        default=None,
    )
    items = BillingRunItemSerializer(many=True, read_only=True)

    class Meta:
        model = BillingRun
        fields = (
            "id",
            "businessDate",
            "status",
            "startedAt",
            "finishedAt",
            "subscriptionsSeen",
            "invoicesCreated",
            "failures",
            "errorSummary",
            "triggeredByEmail",
            "items",
        )


class BillingRunCreateSerializer(serializers.Serializer):
    businessDate = serializers.DateField(required=False, default=None)
    dryRun = serializers.BooleanField(required=False, default=False)


# --- INV-01 & PAY-01 Serializers ---

class InvoiceLineTaxSerializer(serializers.ModelSerializer):
    taxRuleId = serializers.UUIDField(source="tax_rule_id", allow_null=True)
    nameSnapshot = serializers.CharField(source="name_snapshot")
    ratePercentSnapshot = serializers.DecimalField(
        source="rate_percent_snapshot", max_digits=7, decimal_places=4
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        model = InvoiceLineTax
        fields = (
            "id",
            "taxRuleId",
            "nameSnapshot",
            "ratePercentSnapshot",
            "amount",
        )


class InvoiceDiscountLineSerializer(serializers.ModelSerializer):
    discountRuleId = serializers.UUIDField(source="discount_rule_id", allow_null=True)
    nameSnapshot = serializers.CharField(source="name_snapshot")
    discountTypeSnapshot = serializers.CharField(source="discount_type_snapshot")
    valueSnapshot = serializers.DecimalField(
        source="value_snapshot", max_digits=14, decimal_places=4
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    currency = serializers.CharField()

    class Meta:
        model = InvoiceDiscountLine
        fields = (
            "id",
            "discountRuleId",
            "nameSnapshot",
            "discountTypeSnapshot",
            "valueSnapshot",
            "amount",
            "currency",
        )


class InvoiceLineSerializer(serializers.ModelSerializer):
    lineType = serializers.CharField(source="line_type")
    productId = serializers.UUIDField(source="product_id", allow_null=True)
    unitPrice = serializers.DecimalField(source="unit_price", max_digits=14, decimal_places=2)
    taxAmount = serializers.DecimalField(source="tax_total", max_digits=14, decimal_places=2)
    discountAmount = serializers.DecimalField(
        source="discount_total", max_digits=14, decimal_places=2
    )
    taxes = InvoiceLineTaxSerializer(many=True, read_only=True)

    class Meta:
        model = InvoiceLine
        fields = (
            "id",
            "lineNumber",
            "lineType",
            "productId",
            "description",
            "quantity",
            "unitPrice",
            "currency",
            "subtotal",
            "taxAmount",
            "discountAmount",
            "total",
            "taxes",
        )
        extra_kwargs = {
            "lineNumber": {"source": "line_number"},
        }


class PaymentSerializer(serializers.ModelSerializer):
    invoiceId = serializers.UUIDField(source="invoice_id", read_only=True)
    recordedByEmail = serializers.EmailField(
        source="recorded_by.email", read_only=True, default=None
    )
    paidAt = serializers.DateTimeField(source="paid_at")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id",
            "invoiceId",
            "method",
            "amount",
            "currency",
            "status",
            "paidAt",
            "note",
            "recordedByEmail",
            "createdAt",
        )


class PaymentCreateSerializer(serializers.Serializer):
    method = serializers.CharField(max_length=40)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    currency = serializers.CharField(max_length=3, required=False, default="USD")
    paidAt = serializers.DateTimeField(required=False)
    note = serializers.CharField(required=False, default="", allow_blank=True)


class InvoiceListSerializer(serializers.ModelSerializer):
    customerId = serializers.UUIDField(source="customer_id")
    subscriptionId = serializers.UUIDField(source="subscription_id")
    billingPeriod = serializers.SerializerMethodField()
    dueDate = serializers.DateField(source="due_date")
    issueDate = serializers.DateField(source="issue_date")
    customerName = serializers.CharField(source="customer_name_snapshot")
    customerEmail = serializers.EmailField(source="customer_email_snapshot")
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2)
    taxTotal = serializers.DecimalField(source="tax_total", max_digits=14, decimal_places=2)
    discountTotal = serializers.DecimalField(source="discount_total", max_digits=14, decimal_places=2)
    total = serializers.DecimalField(max_digits=14, decimal_places=2)
    paidAmount = serializers.SerializerMethodField()
    balanceDue = serializers.SerializerMethodField()
    isOverdue = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = (
            "id",
            "number",
            "customerId",
            "subscriptionId",
            "customerName",
            "customerEmail",
            "billingPeriod",
            "status",
            "issueDate",
            "dueDate",
            "currency",
            "subtotal",
            "taxTotal",
            "discountTotal",
            "total",
            "paidAmount",
            "balanceDue",
            "isOverdue",
            "confirmedAt",
            "createdAt",
        )
        extra_kwargs = {
            "confirmedAt": {"source": "confirmed_at"},
            "createdAt": {"source": "created_at"},
        }

    def get_billingPeriod(self, obj):
        return {
            "start": str(obj.billing_period_start),
            "end": str(obj.billing_period_end),
        }

    def _calc_paid(self, obj):
        if hasattr(obj, "_paid_cache"):
            return obj._paid_cache
        payments = getattr(obj, "payments", None)
        if payments is not None and hasattr(payments, "all"):
            # check if prefetched
            total_paid = sum(
                (p.amount for p in payments.all() if p.status == Payment.Status.POSTED),
                Decimal("0.00"),
            )
        else:
            total_paid = Decimal("0.00")
        obj._paid_cache = total_paid
        return total_paid

    def get_paidAmount(self, obj):
        return f"{self._calc_paid(obj):.2f}"

    def get_balanceDue(self, obj):
        paid = self._calc_paid(obj)
        balance = max(Decimal("0.00"), obj.total - paid)
        return f"{balance:.2f}"

    def get_isOverdue(self, obj):
        from django.utils import timezone
        today = timezone.now().date()
        paid = self._calc_paid(obj)
        balance = max(Decimal("0.00"), obj.total - paid)
        return bool(balance > 0 and obj.due_date < today and obj.status != Invoice.Status.CANCELLED)


class InvoiceDetailSerializer(InvoiceListSerializer):
    billingAddressSnapshot = serializers.CharField(source="billing_address_snapshot")
    lines = InvoiceLineSerializer(many=True, read_only=True)
    discountLines = InvoiceDiscountLineSerializer(
        source="discount_lines", many=True, read_only=True
    )
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta(InvoiceListSerializer.Meta):
        fields = InvoiceListSerializer.Meta.fields + (
            "billingAddressSnapshot",
            "lines",
            "discountLines",
            "payments",
        )


class InvoiceActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["confirm", "cancel", "send", "print"])
    note = serializers.CharField(required=False, default="", allow_blank=True)
