from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Media


@receiver(post_delete, sender=Media)
def delete_media_file(sender, instance, **kwargs):
    """Remove the underlying file from storage when a Media row is deleted.

    Django stopped auto-deleting FileField files on model delete back in 1.3,
    so without this the GCS object is orphaned. Using post_delete (rather than
    overriding Media.delete) also covers cascade deletes from Event. Pass
    save=False so storage.delete() runs without trying to re-save the row.
    """
    if instance.file:
        instance.file.delete(save=False)
