from django.db import models
from django.conf import settings


class OwnerProfile(models.Model):
    """점주 계정 — User(카카오/Apple)와 AffiliateRestaurant 연결"""

    TIER_CHOICES = (
        ("FREE", "Free"),
        ("BOOST", "Boost"),
        ("CONTENT", "Content"),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_profile",
        db_constraint=False,
    )
    restaurant = models.OneToOneField(
        "restaurants.AffiliateRestaurant",
        on_delete=models.PROTECT,
        db_column="restaurant_id",
        to_field="restaurant_id",
        related_name="owner_profile",
        db_constraint=False,
    )
    tier = models.CharField(max_length=10, choices=TIER_CHOICES, default="FREE")
    is_active = models.BooleanField(default=True)
    verified_at = models.DateTimeField(auto_now_add=True)  # PIN 인증 완료 시각
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dashboard_owner_profile"

    def __str__(self):
        return f"Owner:{self.user_id} → Restaurant:{self.restaurant_id} ({self.tier})"
