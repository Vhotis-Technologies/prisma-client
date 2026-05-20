"""
Django application configuration for the ``main`` app.

Registers signal handlers when the app is ready so post-save hooks (loyalty, vouchers,
partner metrics, etc.) are connected before requests are served.
"""
from django.apps import AppConfig


class MainConfig(AppConfig):
    """AppConfig for Prisma client domain models, views, and signals."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'main'

    def ready(self):
        """Import signal modules once Django has loaded the app registry."""
        import main.signals  # noqa: F401 — side-effect registration
