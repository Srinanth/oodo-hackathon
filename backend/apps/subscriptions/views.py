import uuid

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import exception_handler
from rest_framework.viewsets import ModelViewSet

from .models import QuoteTemplate
from .pagination import QuoteTemplateCursorPagination
from .permissions import CanManageQuoteTemplates
from .serializers import QuoteTemplateSerializer


class QuoteTemplateViewSet(ModelViewSet):
    serializer_class = QuoteTemplateSerializer
    permission_classes = (IsAuthenticated, CanManageQuoteTemplates)
    pagination_class = QuoteTemplateCursorPagination
    http_method_names = ("get", "post", "patch", "head", "options")

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
            code, message, field_errors = "NOT_FOUND", "The requested template was not found.", {}
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

    def get_queryset(self):
        queryset = QuoteTemplate.objects.select_related("created_by").all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(payment_terms__icontains=search))
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
