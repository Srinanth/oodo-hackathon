from urllib.parse import parse_qs, urlparse

from rest_framework.pagination import CursorPagination
from rest_framework.response import Response


class QuoteTemplateCursorPagination(CursorPagination):
    page_size = 25
    page_size_query_param = "limit"
    max_page_size = 100
    cursor_query_param = "cursor"
    ordering = "id"

    def get_paginated_response(self, data):
        next_cursor = None
        next_link = self.get_next_link()
        if next_link:
            next_cursor = parse_qs(urlparse(next_link).query).get(self.cursor_query_param, [None])[0]
        return Response({"items": data, "nextCursor": next_cursor})
