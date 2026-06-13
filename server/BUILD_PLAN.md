# Location Diary Build Plan

Quick DRF + Vue3 app to show off skills. Backend architecture planning lives here.

Big picture: A multi-tenant app that allows users to:

- Upload media/docs (photos, videos, notes) with specific geotags.
- Write 'blog posts' with a geotag. Key feature: geotag array so we can capture passages, not just moments in one place.
- Idea is to be able to document by linking geography to notes and media.

## Data plan:

### Events

Events are the top-level container that hold images, notes, geotags, etc.

- Title / description
- Created at, etc.
- Media, location, dates handled by relevant tables.

### Media

Photos, images, blogs, etc.

- Event (FK)
- GCS URI
- metadata (mime type, location if available in photo metadata, etc.)
- Location (optional, FK)

### Location

Geospatial point, reusable across various Events

- lat/lng
- title (optional)

### Event Location

Many-to-many intermediate table linking locations to events

- Event (FK)
- Location (FK)
- Start Date
- End Date (optional)
