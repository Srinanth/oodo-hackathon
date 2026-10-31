from rest_framework import serializers

from .models import QuoteTemplate


class QuoteTemplateSerializer(serializers.ModelSerializer):
    validityDays = serializers.IntegerField(source="validity_days", min_value=1)
    paymentTerms = serializers.CharField(source="payment_terms", required=False, allow_blank=True, max_length=200)
    createdById = serializers.IntegerField(source="created_by_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = QuoteTemplate
        fields = ("id", "name", "validityDays", "paymentTerms", "createdById", "createdAt", "updatedAt")
        read_only_fields = ("id", "createdById", "createdAt", "updatedAt")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A template name is required.")
        return value

    def validate_paymentTerms(self, value):
        return value.strip()
