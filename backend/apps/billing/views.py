import uuid

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView, exception_handler
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import BillingRun
from .permissions import IsBillingStaff
from .serializers import BillingRunCreateSerializer, BillingRunSerializer
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
            code, message, field_errors = "FORBIDDEN", "Only staff and administrators can perform billing runs.", {}
        elif response.status_code == status.HTTP_404_NOT_FOUND:
            code, message, field_errors = "NOT_FOUND", "The requested billing run was not found.", {}
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
