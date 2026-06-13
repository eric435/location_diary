import pytest
from django.contrib.gis.geos import Point
from apps.location.models import Location
from django.contrib.gis.measure import D


@pytest.fixture
def locations(db):
    yvr = Location.objects.create(title="YVR", point=Point(-123.175, 49.193))
    pearson = Location.objects.create(title="YYZ", point=Point(-79.631, 43.677))
    squamish = Location.objects.create(title="Squamish", point=Point(-123.156, 49.698))
    langley = Location.objects.create(title="Langley", point=Point(-122.660, 49.104))
    return {"yvr": yvr, "pearson": pearson, "squamish": squamish, "langley": langley}


@pytest.mark.django_db
def test_location_stores_point():
    loc = Location.objects.create(title="YVR", point=Point(-123.175, 49.193))
    assert loc.point.x == -123.175
    assert loc.point.y == 49.193


def test_dwithin_finds_nearby_points(locations):
    # Vancouver
    origin = Point(-123.116, 49.246)
    nearby = Location.objects.filter(point__dwithin=(origin, D(km=150)))
    assert locations["yvr"] in nearby
    assert locations["pearson"] not in nearby
    assert locations["squamish"] in nearby
    assert locations["langley"] in nearby
