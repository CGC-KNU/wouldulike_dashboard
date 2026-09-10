from django.urls import path

from . import views

# wouldulike_backend/urls.py 에 추가:
#   path("api/astro/", include("astro.urls")),
urlpatterns = [
    path("stores/ops/", views.store_ops_list),
    path("stores/<int:restaurant_id>/", views.store_ops_detail),
    path("leads/", views.leads),
    path("leads/<int:lead_id>/", views.lead_detail),
    path("activities/", views.activities),
]
