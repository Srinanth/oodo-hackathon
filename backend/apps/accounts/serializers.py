import re

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers

from apps.accounts.models import User


class RegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    name = serializers.CharField(max_length=300)

    def validate_email(self, value):
        normalized = value.strip().casefold()
        if User.objects.filter(email_normalized=normalized).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return normalized

    def validate_password(self, value):
        if len(value) < 9:
            raise serializers.ValidationError("Password must be at least 9 characters.")
        if not re.search(r"[A-Z]", value):
            raise serializers.ValidationError("Password must contain an uppercase letter.")
        if not re.search(r"[a-z]", value):
            raise serializers.ValidationError("Password must contain a lowercase letter.")
        if not re.search(r"[^A-Za-z0-9]", value):
            raise serializers.ValidationError("Password must contain a special character.")
        return value

    def create(self, validated_data):
        name = " ".join(validated_data.pop("name").split())
        first_name, _, last_name = name.partition(" ")
        user = User(email=validated_data["email"], first_name=first_name, last_name=last_name)
        try:
            validate_password(validated_data["password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        user.set_password(validated_data["password"])
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    newPassword = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_newPassword(self, value):
        RegistrationSerializer().validate_password(value)
        return value


class StaffAccountSerializer(serializers.ModelSerializer):
    name = serializers.CharField(write_only=True, max_length=300, required=False)
    password = serializers.CharField(write_only=True, trim_whitespace=False, required=False)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = User
        fields = ("id", "email", "name", "password", "role", "is_active", "createdAt")
        read_only_fields = ("id", "role", "is_active", "createdAt")

    def validate_email(self, value):
        normalized = value.strip().casefold()
        if User.objects.filter(email_normalized=normalized).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return normalized

    def validate_password(self, value):
        RegistrationSerializer().validate_password(value)
        return value

    def validate(self, attrs):
        if self.instance is None:
            missing = [field for field in ("name", "password") if not attrs.get(field)]
            if missing:
                raise serializers.ValidationError(
                    {field: "This field is required." for field in missing}
                )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        name = " ".join(validated_data.pop("name").split())
        if not name:
            raise serializers.ValidationError({"name": "Enter a staff member's name."})
        first_name, _, last_name = name.partition(" ")
        request = self.context["request"]
        user = User(
            email=validated_data["email"],
            first_name=first_name,
            last_name=last_name,
            role=User.Role.STAFF,
            is_staff=False,
            created_by=request.user,
        )
        try:
            validate_password(validated_data["password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        user.set_password(validated_data["password"])
        try:
            user.save()
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"email": "An account with this email already exists."}
            ) from exc
        return user

    def to_representation(self, instance):
        return {
            "id": str(instance.pk),
            "email": instance.email,
            "name": instance.get_full_name().strip() or instance.email,
            "role": instance.role,
            "isActive": instance.is_active,
            "createdAt": instance.created_at,
        }
