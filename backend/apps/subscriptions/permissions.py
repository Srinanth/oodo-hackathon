from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import User


class CanManageQuoteTemplates(BasePermission):
    message = "Only administrators can create quotation templates."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role not in (User.Role.ADMIN, User.Role.STAFF):
            return False
        return request.method in SAFE_METHODS or user.role == User.Role.ADMIN
