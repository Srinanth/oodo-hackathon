import base64
import binascii

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import JsonResponse
from django.utils.encoding import force_bytes, force_str
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.api_errors import api_error_payload
from apps.accounts.serializers import (
    LoginSerializer,
    PasswordResetRequestSerializer,
    PasswordResetSerializer,
    RegistrationSerializer,
)

User = get_user_model()


def _user_payload(user):
    return {
        "id": str(user.pk),
        "email": user.email,
        "name": user.get_full_name().strip() or user.email,
        "role": user.role,
        # Customer association is supplied when the customer domain model lands.
        "customerId": None,
    }


@csrf_protect
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    serializer = RegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    login(request, user)
    return Response({"user": _user_payload(user)}, status=status.HTTP_201_CREATED)


@csrf_protect
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].strip().casefold()
    user = authenticate(request, email=email, password=serializer.validated_data["password"])
    if user is None:
        return Response(
            api_error_payload("INVALID_CREDENTIALS", "Email or password is incorrect."),
            status=status.HTTP_400_BAD_REQUEST,
        )
    login(request, user)
    return Response({"user": _user_payload(user)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({"user": _user_payload(request.user)})


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_cookie(request):
    return JsonResponse({"detail": "CSRF cookie set."})


@csrf_protect
@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_request(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    form = PasswordResetForm({"email": serializer.validated_data["email"].strip().casefold()})
    if form.is_valid():
        form.save(
            request=request,
            use_https=request.is_secure(),
            token_generator=default_token_generator,
            subject_template_name="registration/password_reset_subject.txt",
            email_template_name="registration/password_reset_email.html",
        )
    return Response(
        {"message": "If an account exists for this email, a reset link has been sent."},
        status=status.HTTP_202_ACCEPTED,
    )


@csrf_protect
@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset(request):
    serializer = PasswordResetSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        user_id = force_str(base64.urlsafe_b64decode(force_bytes(serializer.validated_data["uid"])))
        user = User.objects.get(pk=user_id, is_active=True)
    except (ValueError, TypeError, OverflowError, binascii.Error, User.DoesNotExist):
        user = None

    if user is None or not default_token_generator.check_token(user, serializer.validated_data["token"]):
        return Response(
            api_error_payload("INVALID_RESET_TOKEN", "This password reset link is invalid or expired."),
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        from django.contrib.auth.password_validation import validate_password

        validate_password(serializer.validated_data["newPassword"], user=user)
    except DjangoValidationError as exc:
        return Response(
            api_error_payload(
                "VALIDATION_ERROR",
                "Please correct the highlighted fields.",
                {"newPassword": "; ".join(exc.messages)},
            ),
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(serializer.validated_data["newPassword"])
    user.save(update_fields=["password", "updated_at"])
    return Response({"message": "Password updated."})
