from rest_framework import serializers

from apps.accounts.models import User
from .models import Customer


class CustomerAccountEmailField(serializers.SlugRelatedField):
    def to_internal_value(self, data):
        if isinstance(data, str):
            data = data.strip().casefold()
        return super().to_internal_value(data)


class CustomerSerializer(serializers.ModelSerializer):
    accountUserId = serializers.IntegerField(source="account_user_id", read_only=True, allow_null=True)
    accountUserEmail = CustomerAccountEmailField(
        source="account_user",
        slug_field="email",
        queryset=User.objects.filter(role=User.Role.CUSTOMER),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Customer
        fields = (
            "id",
            "accountUserId",
            "accountUserEmail",
            "companyName",
            "contactName",
            "email",
            "phone",
            "billingAddress",
            "createdAt",
            "updatedAt",
        )
        read_only_fields = ("id", "createdAt", "updatedAt")

    companyName = serializers.CharField(source="company_name", required=False, allow_blank=True, max_length=200)
    contactName = serializers.CharField(source="contact_name", max_length=200)
    billingAddress = serializers.CharField(source="billing_address", required=False, allow_blank=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    def validate_contactName(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A contact name is required.")
        return value

    def validate_companyName(self, value):
        return value.strip()

    def validate_email(self, value):
        return value.strip().casefold()

    def validate_phone(self, value):
        return value.strip()

    def validate_billingAddress(self, value):
        return value.strip()

    def validate_accountUserEmail(self, user):
        if user is not None:
            existing = Customer.objects.filter(account_user=user).exclude(pk=self.instance.pk if self.instance else None)
            if existing.exists():
                raise serializers.ValidationError("This portal account is already linked to a customer.")
        return user
