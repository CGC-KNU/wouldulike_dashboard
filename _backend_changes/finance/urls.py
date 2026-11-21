from django.urls import path

from . import views

# wouldulike_backend/urls.py 에 추가:
#   path("api/finance/", include("finance.urls")),
urlpatterns = [
    path("items/", views.items),
    path("items/<int:item_id>/", views.item_detail),
    path("entries/", views.entries),
    path("entries/<int:entry_id>/", views.entry_detail),
]
