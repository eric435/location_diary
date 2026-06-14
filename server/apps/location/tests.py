"""Location app: GIS model + EventLocation through-table (passing) and the
owner-scoped CRUD viewset at /api/locations/ with a `near` query (TODO).
"""

import pytest
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D

from apps.location.models import EventLocation, Location

LOCATIONS_URL = "/api/locations/"
EVENTLOCATIONS_URL = "/api/event-locations/"


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
    assert event in location.events.all()
    assert link.arrival is None and link.departure is None


def test_location_reusable_across_events(event, other_event, location):
    # Same location can belong to multiple events (its whole point).
    EventLocation.objects.create(event=event, location=location)
    EventLocation.objects.create(event=other_event, location=location)
    assert location.events.count() == 2


# --- auth ------------------------------------------------------------


def test_unauthenticated_request_is_rejected(api_client, db):
    assert api_client.get(LOCATIONS_URL).status_code == 403


# --- ownership scoping -----------------------------------------------


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
    assert created.user_id == user.id  # pyright: ignore


def test_cannot_retrieve_another_users_location(auth_client, other_location):
    resp = auth_client.get(f"{LOCATIONS_URL}{other_location.id}/")
    assert resp.status_code == 404


# --- nearby search ---------------------------------------------------


def test_near_query_filters_by_distance(auth_client, locations):
    # ?near=lng,lat,km — Vancouver within 150km excludes Toronto (pearson).
    resp = auth_client.get(f"{LOCATIONS_URL}?near=-123.116,49.246,150")
    assert resp.status_code == 200
    titles = {row["title"] for row in resp.data["results"]}
    assert "YVR" in titles
    assert "YYZ" not in titles


def test_near_with_nonnumeric_coords_is_a_400(auth_client, location):
    # Right number of parts, but not numbers -> clean 400, not a 500.
    resp = auth_client.get(f"{LOCATIONS_URL}?near=a,b,c")
    assert resp.status_code == 400


# --- lat/lng convenience fields --------------------------------------


def test_location_exposes_lat_lng(auth_client, location):
    resp = auth_client.get(f"{LOCATIONS_URL}{location.id}/")
    assert resp.status_code == 200
    assert resp.data["lng"] == -123.175
    assert resp.data["lat"] == 49.193


# --- ?event= filter --------------------------------------------------


def test_list_can_filter_locations_by_event(auth_client, event, locations):
    EventLocation.objects.create(event=event, location=locations["yvr"])
    resp = auth_client.get(f"{LOCATIONS_URL}?event={event.id}")
    assert resp.status_code == 200
    titles = {row["title"] for row in resp.data["results"]}
    assert titles == {"YVR"}


def test_bad_filter_value_is_a_400_not_a_500(auth_client, location):
    resp = auth_client.get(f"{LOCATIONS_URL}?event=notanumber")
    assert resp.status_code == 400


# --- EventLocation endpoint (event<->location links) -----------------


def test_unauthenticated_eventlocation_request_is_rejected(api_client, db):
    assert api_client.get(EVENTLOCATIONS_URL).status_code == 403


def test_create_link_with_arrival_departure(auth_client, event, location):
    resp = auth_client.post(
        EVENTLOCATIONS_URL,
        {
            "event": event.id,
            "location": location.id,
            "arrival": "2026-06-01T10:00:00Z",
            "departure": "2026-06-01T18:00:00Z",
        },
        format="json",
    )
    assert resp.status_code == 201
    link = EventLocation.objects.get(id=resp.data["id"])
    assert link.event_id == event.id  # pyright: ignore
    assert link.location_id == location.id  # pyright: ignore
    assert link.arrival is not None and link.departure is not None
    # Nested read exposes the location for one-request rendering.
    assert resp.data["location_detail"]["title"] == "YVR"


def test_can_update_link_times(auth_client, event, location):
    link = EventLocation.objects.create(event=event, location=location)
    resp = auth_client.patch(
        f"{EVENTLOCATIONS_URL}{link.pk}/",
        {"departure": "2026-06-02T09:00:00Z"},
        format="json",
    )
    assert resp.status_code == 200
    link.refresh_from_db()
    assert link.departure is not None


def test_cannot_link_to_another_users_event(auth_client, other_event, location):
    resp = auth_client.post(
        EVENTLOCATIONS_URL,
        {"event": other_event.id, "location": location.id},
        format="json",
    )
    assert resp.status_code == 400
    assert "event" in resp.data


def test_cannot_link_to_another_users_location(auth_client, event, other_location):
    resp = auth_client.post(
        EVENTLOCATIONS_URL,
        {"event": event.id, "location": other_location.id},
        format="json",
    )
    assert resp.status_code == 400
    assert "location" in resp.data


def test_link_list_scoped_to_own_events(
    auth_client, event, other_event, location, other_location
):
    mine = EventLocation.objects.create(event=event, location=location)
    EventLocation.objects.create(event=other_event, location=other_location)
    resp = auth_client.get(EVENTLOCATIONS_URL)
    assert resp.status_code == 200
    returned_ids = [row["id"] for row in resp.data["results"]]
    assert returned_ids == [mine.pk]


def test_cannot_retrieve_another_users_link(auth_client, other_event, other_location):
    theirs = EventLocation.objects.create(event=other_event, location=other_location)
    resp = auth_client.get(f"{EVENTLOCATIONS_URL}{theirs.pk}/")
    assert resp.status_code == 404


def test_links_filterable_by_event(auth_client, event, location):
    from apps.events.models import Event

    second = Event.objects.create(user=location.user, title="Second")
    keep = EventLocation.objects.create(event=event, location=location)
    EventLocation.objects.create(event=second, location=location)
    resp = auth_client.get(f"{EVENTLOCATIONS_URL}?event={event.id}")
    assert resp.status_code == 200
    returned_ids = [row["id"] for row in resp.data["results"]]
    assert returned_ids == [keep.pk]
