from django.contrib.gis.db import models


class Location(models.Model):
    title = models.CharField(max_length=255, blank=True)
    point = models.PointField(geography=True, srid=4326)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title
