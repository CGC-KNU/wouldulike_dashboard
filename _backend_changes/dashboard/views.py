from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from coupons.models import MerchantPin
from restaurants.models import AffiliateRestaurant
from .models import OwnerProfile


class VerifyOwnerView(APIView):
    """
    점주 첫 인증: PIN 검증 후 OwnerProfile 생성
    POST /api/dashboard/auth/verify-owner/
    Body: { restaurant_id, pin }
    Header: Authorization: Bearer <pending_token>
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        restaurant_id = request.data.get("restaurant_id")
        pin = request.data.get("pin")

        if not restaurant_id or not pin:
            return Response(
                {"success": False, "message": "restaurant_id와 pin이 필요합니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 이미 점주 등록된 계정이면 재인증 불필요
        if hasattr(request.user, "owner_profile"):
            owner = request.user.owner_profile
            refresh = RefreshToken.for_user(request.user)
            return Response({
                "success": True,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "restaurant_id": owner.restaurant_id,
                "tier": owner.tier,
            })

        # PIN 검증
        try:
            merchant_pin = MerchantPin.objects.get(restaurant_id=restaurant_id)
        except MerchantPin.DoesNotExist:
            return Response(
                {"success": False, "message": "등록된 매장을 찾을 수 없습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if merchant_pin.secret != pin:
            return Response(
                {"success": False, "message": "PIN이 올바르지 않습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 해당 restaurant에 이미 다른 점주가 등록되어 있는지 확인
        if OwnerProfile.objects.filter(restaurant_id=restaurant_id).exists():
            return Response(
                {"success": False, "message": "이미 등록된 점주 계정이 있습니다. 관리자에게 문의하세요."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # OwnerProfile 생성
        try:
            restaurant = AffiliateRestaurant.objects.get(restaurant_id=restaurant_id)
        except AffiliateRestaurant.DoesNotExist:
            return Response(
                {"success": False, "message": "매장 정보를 찾을 수 없습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        owner = OwnerProfile.objects.create(
            user=request.user,
            restaurant=restaurant,
            tier="FREE",
        )

        # 새 JWT 발급 (is_owner 클레임 포함)
        refresh = RefreshToken.for_user(request.user)
        refresh["is_owner"] = True
        refresh["restaurant_id"] = owner.restaurant_id

        return Response({
            "success": True,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "restaurant_id": owner.restaurant_id,
            "tier": owner.tier,
        })


class AppTokenView(APIView):
    """
    앱 → 웹뷰 자동 로그인
    POST /api/dashboard/auth/app-token/
    Body: { token: <app_jwt> }
    """

    def post(self, request):
        from rest_framework_simplejwt.tokens import AccessToken
        from rest_framework_simplejwt.exceptions import TokenError

        token_str = request.data.get("token")
        if not token_str:
            return Response({"is_owner": False}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = AccessToken(token_str)
            user_id = token["user_id"]
        except TokenError:
            return Response({"is_owner": False}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            from accounts.models import User
            user = User.objects.get(pk=user_id)
            owner = user.owner_profile
        except (User.DoesNotExist, OwnerProfile.DoesNotExist):
            return Response({"is_owner": False}, status=status.HTTP_401_UNAUTHORIZED)

        if not owner.is_active:
            return Response({"is_owner": False}, status=status.HTTP_403_FORBIDDEN)

        # 새 토큰 발급
        refresh = RefreshToken.for_user(user)
        refresh["is_owner"] = True
        refresh["restaurant_id"] = owner.restaurant_id

        return Response({
            "is_owner": True,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "restaurant_id": owner.restaurant_id,
            "tier": owner.tier,
        })


class DashboardStatsView(APIView):
    """
    홈 핵심 지표 (P0)
    GET /api/dashboard/stats/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            owner = request.user.owner_profile
        except OwnerProfile.DoesNotExist:
            return Response({"detail": "점주 계정이 아닙니다."}, status=status.HTTP_403_FORBIDDEN)

        restaurant_id = owner.restaurant_id
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        from coupons.models import Coupon, StampEvent

        # 이번 달 쿠폰 처리 건수
        coupon_count = Coupon.objects.filter(
            restaurant_id=restaurant_id,
            status="REDEEMED",
            redeemed_at__gte=month_start,
        ).count()

        # 이번 달 스탬프 적립 건수
        stamp_count = StampEvent.objects.filter(
            restaurant_id=restaurant_id,
            delta__gt=0,
            created_at__gte=month_start,
        ).count()

        # 이번 달 재방문 (같은 달에 2회 이상 스탬프 적립한 유저 수)
        from django.db.models import Count
        revisit_count = (
            StampEvent.objects.filter(
                restaurant_id=restaurant_id,
                delta__gt=0,
                created_at__gte=month_start,
            )
            .values("user_id")
            .annotate(visits=Count("id"))
            .filter(visits__gte=2)
            .count()
        )

        # 누적 단골 (전체 기간 3회 이상 방문)
        loyal_count = (
            StampEvent.objects.filter(
                restaurant_id=restaurant_id,
                delta__gt=0,
            )
            .values("user_id")
            .annotate(visits=Count("id"))
            .filter(visits__gte=3)
            .count()
        )

        return Response({
            "restaurant_id": restaurant_id,
            "restaurant_name": owner.restaurant.name,
            "tier": owner.tier,
            "month": now.strftime("%Y-%m"),
            "stats": {
                "revisit_this_month": revisit_count,
                "loyal_total": loyal_count,
                "coupon_redeemed_this_month": coupon_count,
                "stamp_earned_this_month": stamp_count,
            },
        })
