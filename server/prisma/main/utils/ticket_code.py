"""Unique 8-digit decimal ticket codes for support tickets."""
import secrets


def generate_unique_ticket_code():
    """Return an 8-digit string (zero-padded) unique among Ticket.ticket_code."""
    from main.models import Ticket

    for _ in range(100):
        code = f"{secrets.randbelow(100_000_000):08d}"
        if not Ticket.objects.filter(ticket_code=code).exists():
            return code
    raise RuntimeError("Could not allocate a unique ticket code")
