from pathlib import Path

from django.conf import settings
from django.http import HttpResponse


def frontend_app(_request):
    entrypoint = Path(settings.BASE_DIR) / "static" / "frontend" / "index.html"
    if not entrypoint.is_file():
        return HttpResponse(
            "Frontend build not found. Run `npm run build` from the frontend folder.",
            status=503,
            content_type="text/plain; charset=utf-8",
        )
    return HttpResponse(entrypoint.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")
