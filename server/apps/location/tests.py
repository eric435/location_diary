"""Location app: GIS model + EventLocation through-table (passing) and the
owner-scoped CRUD viewset at /api/locations/ with a `near` query (TODO).
"""

import pytest
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D

from apps.location.models import EventLocation, Location

LOCATIONS_URL = "/api/locations/"


@pytest.fixture
def locations(user):
    """A spread of points around BC/ON, all owned by `user`."""
    return {
        "yvr": Location.objects.create(
            user=user, title="YVR", point=Point(-123.175, 49.193)
        ),
        "pearson": Location.objects.create(
            user=user, title="YYZ", point=Point(-79.631, 43.677)
        ),
        "squamish": Location.objects.create(
            user=user, title="Squamish", point=Point(-123.156, 49.698)
        ),
        "langley": Location.objects.create(
            user=user, title="Langley", point=Point(-122.660, 49.104)
        ),
    }


# --- model + GIS (implemented) ----------------------------------------------


def test_location_stores_point(location):
    assert location.point.x == -123.175
    assert location.point.y == 49.193


def test_dwithin_finds_nearby_points(locations):
    origin = Point(-123.116, 49.246)  # Vancouver
    nearby = Location.objects.filter(point__dwithin=(origin, D(km=150)))
    assert locations["yvr"] in nearby
    assert locations["squamish"] in nearby
    assert locations["langley"] in nearby
    assert locations["pearson"] not in nearby  # Toronto, ~3300km away


# --- EventLocation through-model (implemented) ------------------------------


def test_eventlocation_links_event_and_location(event, location):
    link = EventLocation.objects.create(event=event, location=location)
    # The M2M is navigable from both ends via the through table.
    assert location in event.locations.all()
    assert event in location.event.all()
    assert link.arrival is None and link.departure is None


def test_location_reusable_across_events(event, other_event, location):
    # Same location can belong to multiple events (its whole point).
    EventLocation.objects.create(event=event, location=location)
    EventLocation.objects.create(event=other_event, location=location)
    assert location.event.count() == 2


# --- auth (TODO) ------------------------------------------------------------


def test_unauthenticated_request_is_rejected(api_client, db):
    assert api_client.get(LOCATIONS_URL).status_code == 403


# --- ownership scoping (TODO) -----------------------------------------------


def test_list_returns_only_own_locations(auth_client, location, other_location):
    resp = auth_client.get(LOCATIONS_URL)
    assert resp.status_code == 200
    returned_ids = [row["id"] for row in resp.data["results"]]
    assert returned_ids == [location.id]


def test_create_assigns_owner_from_request_user(auth_client, user):
    resp = auth_client.post(
        LOCATIONS_URL,
        {"title": "Home", "point": "POINT(-123.1 49.2)"},
        format="json",
    )
    assert resp.status_code == 201
    created = Location.objects.get(id=resp.data["id"])
    assert created.user_id == user.id


def test_cannot_retrieve_another_users_location(auth_client, other_location):
    resp = auth_client.get(f"{LOCATIONS_URL}{other_location.id}/")
    assert resp.status_code == 404


# --- nearby search (TODO) ---------------------------------------------------


def test_near_query_filters_by_distance(auth_client, locations):
    # ?near=lng,lat,km — Vancouver within 150km excludes Toronto (pearson).
    resp = auth_client.get(f"{LOCATIONS_URL}?near=-123.116,49.246,150")
    assert resp.status_code == 200
    titles = {row["title"] for row in resp.data["results"]}
    assert "YVR" in titles
    assert "YYZ" not in titles
