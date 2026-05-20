"""Unique 8-digit decimal ticket codes for support tickets."""
import secrets


def generate_unique_ticket_code():
    """
    Allocate a random 8-digit ticket code unique in ``Ticket.ticket_code``.

    Retries up to 100 times on collision, then raises ``RuntimeError``.

    Returns:
        str: Zero-padded 8-digit decimal string (e.g. ``"00428193"``).

    Raises:
        RuntimeError: When no unused code could be found after 100 attempts.
    """
    from main.models import Ticket

    for _ in range(100):
        code = f"{secrets.randbelow(100_000_000):08d}"
        if not Ticket.objects.filter(ticket_code=code).exists():
            return code
    raise RuntimeError("Could not allocate a unique ticket code")
