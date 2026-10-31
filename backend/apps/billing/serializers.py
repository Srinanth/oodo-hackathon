from rest_framework import serializers

from .models import BillingRun, BillingRunItem


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
