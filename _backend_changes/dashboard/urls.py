from django.urls import path
from . import views

urlpatterns = [
    # 인증
    path("auth/verify-owner/", views.VerifyOwnerView.as_view()),
    path("auth/app-token/", views.AppTokenView.as_view()),
    # 홈 지표
    path("stats/", views.DashboardStatsView.as_view()),
]
