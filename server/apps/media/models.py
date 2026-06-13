from django.db import models
from apps.events.models import Event
from apps.location.models import Location


def media_upload_path(instance, filename):
    return f"media/event_{instance.event_id}/{filename}"


class Media(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "img", "Image"
        TEXT = "txt", "Text"

    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    location = models.ForeignKey(
        Location, on_delete=models.SET_NULL, null=True, blank=True
    )

    note = models.TextField(blank=True)
    file = models.FileField(upload_to=media_upload_path)
    mime_type = models.CharField(max_length=100, blank=True)
    media_type = models.CharField(max_length=3, choices=MediaType)
    # Timestamp stores the moment of the media creation (e.g. when was photo taken)
    timestamp = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        label = self.MediaType(self.media_type).label
        if self.timestamp:
            return f"{label} - {self.timestamp}"
        return self.media_type
