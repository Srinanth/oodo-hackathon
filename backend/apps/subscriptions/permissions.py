from rest_framework.permissions import BasePermission

from apps.accounts.models import User


class CanManageQuoteTemplates(BasePermission):
    message = "Only staff and administrators can manage quotation templates."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role not in (User.Role.ADMIN, User.Role.STAFF):
            return False
        return True
