from django.urls import path

from . import views

# path("api/castor/", include("castor.urls")),
urlpatterns = [
    path("graph/", views.graph),
    path("graph/ingest/", views.ingest),
    path("experiments/", views.experiments),
]
