"""
Django app config for main. Imports signals on ready() so signal handlers are registered.
"""
from django.apps import AppConfig


class MainConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'main'

    def ready(self):
        import main.signals
