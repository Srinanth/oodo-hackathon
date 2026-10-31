import re

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
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
