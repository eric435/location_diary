"""Small helpers shared across viewsets for parsing query parameters.

These keep list-endpoint filtering robust: a bad value yields a clean 400
instead of an unhandled ValueError -> 500 when the queryset hits the DB.
"""

from rest_framework.exceptions import ValidationError


def int_param(request, name):
    """Return an integer query param, or None when it's absent.

    Raises a 400 ValidationError if the param is present but not an integer,
    so callers can do ``qs.filter(...)`` without risking a 500.
    """
    raw = request.query_params.get(name)
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError({name: "Expected an integer id."})
