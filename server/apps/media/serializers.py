from collections import namedtuple
from datetime import datetime, timedelta, timezone as dt_timezone

from django.contrib.gis.geos import Point
from django.utils import timezone
from PIL import ExifTags, Image, UnidentifiedImageError
from rest_framework import serializers

from .models import Media

# What we pull out of an image's EXIF in a single pass. Either field may be None.
ExifMeta = namedtuple("ExifMeta", ["timestamp", "point"])


def extract_exif_meta(upload):
    """Read capture time and GPS location from an image's EXIF metadata.

    Returns an ``ExifMeta(timestamp, point)`` — each field is None if the file
    isn't an image we can read or doesn't carry that tag. Opens the file once
    and leaves the upload's read pointer where it found it so the subsequent
    save still streams the whole file.
    """
    pos = upload.tell() if hasattr(upload, "tell") else None
    try:
        with Image.open(upload) as img:
            exif = img.getexif()
            return ExifMeta(
                timestamp=_capture_timestamp(exif),
                point=_capture_point(exif),
            )
    except (UnidentifiedImageError, OSError):
        return ExifMeta(None, None)
    finally:
        if pos is not None:
            upload.seek(pos)


def _capture_timestamp(exif):
    """Original capture time from EXIF, as a tz-aware datetime, or None."""
    # DateTimeOriginal (when the shot was taken) lives in the Exif IFD;
    # fall back to DateTimeDigitized, then the top-level DateTime.
    ifd = exif.get_ifd(ExifTags.IFD.Exif)
    raw = (
        ifd.get(ExifTags.Base.DateTimeOriginal.value)
        or ifd.get(ExifTags.Base.DateTimeDigitized.value)
        or exif.get(ExifTags.Base.DateTime.value)
    )
    if not raw:
        return None
    try:
        naive = datetime.strptime(raw, "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None

    # EXIF dates are local-to-the-camera with the zone stored separately
    # (OffsetTimeOriginal, e.g. "-04:00"). Use it when present; otherwise
    # interpret the time in the server's configured timezone.
    offset = ifd.get(ExifTags.Base.OffsetTimeOriginal.value) or ifd.get(
        ExifTags.Base.OffsetTime.value
    )
    tz = _parse_exif_offset(offset)
    if tz is not None:
        return naive.replace(tzinfo=tz)
    return timezone.make_aware(naive)


def _capture_point(exif):
    """GPS location from EXIF as a WGS84 Point(lng, lat), or None.

    EXIF stores each coordinate as a (degrees, minutes, seconds) triple of
    rationals plus a hemisphere ref (N/S, E/W); we fold that into a signed
    decimal degree. Anything missing or malformed yields None rather than a
    bogus (0, 0) point.
    """
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    if not gps:
        return None
    lat = _decimal_degrees(
        gps.get(ExifTags.GPS.GPSLatitude.value),
        gps.get(ExifTags.GPS.GPSLatitudeRef.value),
        negative_refs=("S",),
    )
    lng = _decimal_degrees(
        gps.get(ExifTags.GPS.GPSLongitude.value),
        gps.get(ExifTags.GPS.GPSLongitudeRef.value),
        negative_refs=("W",),
    )
    if lat is None or lng is None:
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return Point(lng, lat, srid=4326)


def _decimal_degrees(dms, ref, negative_refs):
    """Convert an EXIF (deg, min, sec) triple + hemisphere ref to signed float."""
    if not dms or len(dms) != 3 or not ref:
        return None
    try:
        degrees, minutes, seconds = (float(v) for v in dms)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    value = degrees + minutes / 60 + seconds / 3600
    if ref.strip().upper() in negative_refs:
        value = -value
    return value


def _parse_exif_offset(offset):
    """Turn an EXIF offset string like "-04:00" into a tzinfo, or None."""
    if not offset:
        return None
    try:
        sign = 1 if offset[0] != "-" else -1
        hours, minutes = offset.lstrip("+-").split(":")
        return dt_timezone(sign * timedelta(hours=int(hours), minutes=int(minutes)))
    except (ValueError, IndexError):
        return None


class MediaSerializer(serializers.ModelSerializer):
    # Clients upload through `file` but never read the raw storage path back...
    file = serializers.FileField(write_only=True)
    # ...they read `file_url`, a short-lived signed GCS URL instead.
    file_url = serializers.SerializerMethodField()
    # Convenience read fields mirroring LocationSerializer so map clients get the
    # photo's EXIF coordinates without parsing the WKT `point`.
    lat = serializers.SerializerMethodField()
    lng = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = [
            "id",
            "event",
            "location",
            "note",
            "file",
            "file_url",
            "mime_type",
            "media_type",
            "timestamp",
            "point",
            "lat",
            "lng",
            "created_at",
        ]
        # mime_type / media_type are derived from the upload, not client-supplied.
        # `point` is set from EXIF GPS only — clients edit `location`, never the
        # photo's own coordinates.
        read_only_fields = [
            "id",
            "created_at",
            "mime_type",
            "media_type",
            "point",
        ]

    def get_lat(self, obj):
        return obj.point.y if obj.point else None

    def get_lng(self, obj):
        return obj.point.x if obj.point else None

    def create(self, validated_data):
        upload = validated_data["file"]
        mime = getattr(upload, "content_type", "") or ""
        validated_data["mime_type"] = mime
        is_image = mime.startswith("image/")
        validated_data["media_type"] = (
            Media.MediaType.IMAGE if is_image else Media.MediaType.TEXT
        )
        if is_image:
            meta = extract_exif_meta(upload)
            # Autofill capture time from EXIF unless the client gave one explicitly.
            if meta.timestamp is not None and not validated_data.get("timestamp"):
                validated_data["timestamp"] = meta.timestamp
            # `point` comes only from EXIF GPS (read-only to clients).
            if meta.point is not None:
                validated_data["point"] = meta.point
        return super().create(validated_data)

    def get_file_url(self, obj):
        # With the GCS backend + GS_QUERYSTRING_AUTH, .url is already a signed,
        # expiring URL. Ownership is enforced upstream: the client only reaches
        # this object through the user-scoped queryset.
        return obj.file.url if obj.file else None

    # Prevent attaching media to an event the requester doesn't own.
    def validate_event(self, event):
        if event.user_id != self.context["request"].user.pk:
            raise serializers.ValidationError("You do not own this event.")
        return event

    # Location is optional; only validate ownership when one is supplied.
    def validate_location(self, location):
        if location is not None and location.user_id != self.context["request"].user.pk:
            raise serializers.ValidationError("You do not own this location.")
        return location
