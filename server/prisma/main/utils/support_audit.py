"""Resolve support staff identity for audit trails on internal APIs."""

SUPPORT_ACTOR_HEADER = "X-Support-Actor-Email"


def get_support_actor_email(request) -> str:
    """
    Email of the support user who performed the action.

    Only trusted when the request passed ``has_support_permission`` (internal key).
    Client-supplied ``support_user_email`` in JSON is ignored to prevent spoofing.

    Args:
        request: Django ``HttpRequest``.

    Returns:
        str: Trimmed value of ``X-Support-Actor-Email``, or empty string when absent.
    """
    return (request.headers.get(SUPPORT_ACTOR_HEADER) or "").strip()
