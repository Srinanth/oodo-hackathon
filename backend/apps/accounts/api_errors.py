import uuid

from rest_framework.views import exception_handler


def api_error_payload(code, message, field_errors=None):
    return {
        "error": {
            "code": code,
            "message": message,
            "fieldErrors": field_errors or {},
            "requestId": str(uuid.uuid4()),
        }
    }


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    if isinstance(detail, dict) and "detail" in detail:
        message = str(detail["detail"])
        code = getattr(detail["detail"], "code", "REQUEST_FAILED")
        field_errors = {}
    elif isinstance(detail, dict):
        message = "Please correct the highlighted fields."
        code = "VALIDATION_ERROR"
        field_errors = {
            field: "; ".join(str(item) for item in errors)
            for field, errors in detail.items()
        }
    else:
        message = "The request could not be completed."
        code = "REQUEST_FAILED"
        field_errors = {}

    response.data = api_error_payload(str(code).upper(), message, field_errors)
    return response
