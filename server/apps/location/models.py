from django.contrib.gis.db import models
from apps.events.models import Event
from apps.users.models import User


class Location(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    events = models.ManyToManyField(
        Event, through="EventLocation", related_name="locations"
    )

    title = models.CharField(max_length=255, blank=True)
    point = models.PointField(geography=True, srid=4326)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


# Ties Locations to events
# One location could be re-used across various events (e.g. Location: NYC, Events: several...)
# One event could have various locations (e.g. Road trip across Canada)
class EventLocation(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    location = models.ForeignKey(Location, on_delete=models.CASCADE)

    arrival = models.DateTimeField(null=True, blank=True)
    departure = models.DateTimeField(null=True, blank=True)

    class Meta:
        # Arrival order makes a sensible default for rendering an event's stops;
        # nulls last so undated links don't crowd the top. Also gives pagination
        # a stable ordering.
        ordering = [models.F("arrival").asc(nulls_last=True), "id"]
