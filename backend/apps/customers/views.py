import uuid

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView, exception_handler
from rest_framework.viewsets import ModelViewSet

from .models import Customer
from .pagination import CustomerCursorPagination
from .permissions import IsCustomerAccount, IsOperationalStaff
from .serializers import CustomerSerializer


class CustomerApiErrorMixin:
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
            code, message, field_errors = "NOT_FOUND", "The requested customer was not found.", {}
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


class CustomerViewSet(CustomerApiErrorMixin, ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = (IsAuthenticated, IsOperationalStaff)
    pagination_class = CustomerCursorPagination
    http_method_names = ("get", "post", "patch", "head", "options")

    def get_queryset(self):
        queryset = Customer.objects.select_related("account_user").all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(contact_name__icontains=search)
                | Q(company_name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
            )
        return queryset


class PortalCustomerView(CustomerApiErrorMixin, APIView):
    permission_classes = (IsAuthenticated, IsCustomerAccount)

    def get(self, request):
        customer = get_object_or_404(Customer, account_user=request.user)
        return Response(CustomerSerializer(customer).data)
