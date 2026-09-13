from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import QualitySnapshot

"""
Probe API.

지금은 프론트(`src/app/api/probe/overview`)가 매장마다 `/api/dashboard/stats/` 를 호출해
34번 왕복한다. 화면을 먼저 세우려고 그렇게 뒀지만, **여기가 제자리다** — 한 번의 집계 쿼리로
끝날 일이다. 아래 `overview` 를 올리면 프론트는 그대로 두고 왕복만 1번으로 줄어든다.

`_summarize` 의 쿼리는 실제 쿠폰/스탬프 모델 이름에 맞게 채워야 한다 —
이 저장소에는 그 모델이 없어서 시그니처와 반환 형태만 맞춰 뒀다.
"""


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def overview(request):
    """
    반환 형태는 프론트 `StoreMetric` 과 1:1 이다.

    ⚠️ 지표를 못 읽은 매장은 0 이 아니라 `unavailable: true` 로 내려야 한다.
    0(진짜 없음)과 모름을 섞으면 "이 매장 죽었네" 같은 오판이 난다.
    """
    stores = _summarize()
    live = [s for s in stores if not s.get("unavailable")]
    return Response({
        "stores": stores,
        "totals": {
            "stores": len(stores),
            "affiliate": sum(1 for s in stores if s["is_affiliate"]),
            "paid": sum(1 for s in stores if s["tier"] in ("BOOST", "CONTENT")),
            "coupon_redeemed": sum(s["coupon_redeemed_this_month"] for s in live),
            "stamp_earned": sum(s["stamp_earned_this_month"] for s in live),
            "loyal_total": sum(s["loyal_total"] for s in live),
            "revisit_this_month": sum(s["revisit_this_month"] for s in live),
            "unavailable": len(stores) - len(live),
            # 총합보다 이 숫자가 먼저다 — 영업이 다음 주에 전화 돌릴 목록이다.
            "silent": sum(
                1 for s in live
                if s["is_affiliate"]
                and s["coupon_redeemed_this_month"] == 0
                and s["stamp_earned_this_month"] == 0
            ),
        },
    })


def _summarize() -> list[dict]:
    """
    TODO(민찬): 실제 쿠폰/스탬프 모델로 채운다. 한 번의 annotate 로 끝나야 한다.

        from restaurants.models import AffiliateRestaurant
        qs = AffiliateRestaurant.objects.annotate(
            coupon_redeemed_this_month=Count("coupons", filter=Q(coupons__used_at__gte=month_start)),
            stamp_earned_this_month=Count("stamps", filter=Q(stamps__created_at__gte=month_start)),
        )

    지표 조회 자체가 실패한 매장은 키를 빼지 말고 `unavailable=True` 로 표시할 것.
    """
    return []


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def quality_history(request):
    """최근 점검 이력. 슬랙 알림에서 '새로 생긴 것만' 고르는 데 쓴다."""
    snaps = QualitySnapshot.objects.all()[:30]
    return Response({"snapshots": [
        {
            "ran_at": s.ran_at.isoformat(),
            "high": s.high, "medium": s.medium, "low": s.low,
            "backend_reachable": s.backend_reachable,
        } for s in snaps
    ]})
