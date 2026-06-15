from django.apps import AppConfig


class MediaConfig(AppConfig):
    name = "apps.media"

    def ready(self):
        from . import signals  # noqa: F401
