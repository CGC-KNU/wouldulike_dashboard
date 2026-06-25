from django.urls import path
from . import views

urlpatterns = [
    path("restaurants/", views.OwnerRestaurantListView.as_view()),
    path("auth/verify-owner/", views.VerifyOwnerView.as_view()),
    path("auth/app-token/", views.AppTokenView.as_view()),
    path("auth/admin-login/", views.AdminLoginView.as_view()),
    path("stats/", views.DashboardStatsView.as_view()),
]
