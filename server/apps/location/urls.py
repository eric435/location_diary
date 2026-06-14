from rest_framework.routers import DefaultRouter
from .views import EventLocationViewSet, LocationViewSet

router = DefaultRouter()
router.register(r"locations", LocationViewSet)
router.register(r"event-locations", EventLocationViewSet)

urlpatterns = router.urls
