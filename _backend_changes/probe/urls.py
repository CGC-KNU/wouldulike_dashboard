from django.urls import path

from . import views

# path("api/probe/", include("probe.urls")),
urlpatterns = [
    path("overview/", views.overview),
    path("quality/history/", views.quality_history),
]
