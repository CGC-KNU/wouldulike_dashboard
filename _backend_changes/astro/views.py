from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Activity, Lead, StoreOps

"""
Astro API.

프론트(Next.js route handler)가 이미 이 경로들을 호출하고 있다 —
`src/app/api/astro/*` 를 보면 백엔드가 200 을 주면 그대로 쓰고, 404/502 면 초안 저장소로 떨어진다.
따라서 이 파일을 올리는 순간 프론트는 코드 수정 없이 실데이터로 갈아탄다.
(화면의 '초안 데이터' 배지가 사라지는 것으로 확인할 수 있다.)

urls.py 에서 `api/astro/` 아래에 붙인다.
"""

OPS_FIELDS = [
    "semester_active", "vacation_active", "kit_delivered",
    "billing", "billing_checked_at", "billing_checked_by",
    "invoice", "quote_sent_at", "contract_returned_at",
    "owner_name", "owner_phone", "biz_no",
    "monthly_fee", "pay_cycle", "contract_started_on", "contract_months",
    "is_test", "memo",
]


def ops_json(o: StoreOps) -> dict:
    return {
        "id": o.restaurant_id,
        **{f: getattr(o, f) for f in OPS_FIELDS},
        "updated_by": o.updated_by,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def store_ops_list(request):
    return Response({"ops": [ops_json(o) for o in StoreOps.objects.all()]})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def store_ops_detail(request, restaurant_id: int):
    obj, _ = StoreOps.objects.get_or_create(restaurant_id=restaurant_id)

    if request.method == "GET":
        return Response({"ops": ops_json(obj)})

    data = request.data
    for f in OPS_FIELDS:
        if f in data:
            setattr(obj, f, data[f])

    # 입금을 '확인'으로 바꾸는 순간, 누가 언제 확인했는지를 같이 못 박는다.
    # 이게 지금 시트가 못 하는 유일한 일이고, 이 모델을 만든 이유다.
    if data.get("billing") == "PAID" and not obj.billing_checked_at:
        obj.billing_checked_at = timezone.localdate()
        obj.billing_checked_by = data.get("updated_by") or request.user.get_username()

    obj.updated_by = data.get("updated_by") or request.user.get_username()
    obj.save()
    return Response({"ops": ops_json(obj)})


def lead_json(l: Lead) -> dict:
    return {
        "id": str(l.id),
        "name": l.name,
        "district": l.district or None,
        "category": l.category or None,
        "stage": l.stage,
        "owner": l.owner or None,
        "contact": l.contact or None,
        "channel": l.channel or None,
        "next_action": l.next_action or None,
        "next_action_on": l.next_action_on,
        "last_touch_at": l.last_touch_at.isoformat() if l.last_touch_at else None,
        "expected_plan": l.expected_plan or None,
        "memo": l.memo or None,
        "created_at": l.created_at.isoformat(),
        "converted_restaurant_id": l.converted_restaurant_id,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def leads(request):
    if request.method == "GET":
        qs = Lead.objects.all().order_by("-created_at")
        return Response({"leads": [lead_json(l) for l in qs]})

    d = request.data
    if not (d.get("name") or "").strip():
        return Response({"detail": "매장명은 필수입니다."}, status=status.HTTP_400_BAD_REQUEST)

    l = Lead.objects.create(
        name=d["name"].strip(),
        district=d.get("district") or "",
        category=d.get("category") or "",
        stage=d.get("stage") or "미컨택",
        owner=d.get("owner") or "",
        contact=d.get("contact") or "",
        channel=d.get("channel") or "",
        next_action=d.get("next_action") or "",
        next_action_on=d.get("next_action_on") or None,
        last_touch_at=timezone.now(),
        expected_plan=d.get("expected_plan") or "",
        memo=d.get("memo") or "",
    )
    return Response({"lead": lead_json(l)}, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def lead_detail(request, lead_id: int):
    try:
        l = Lead.objects.get(pk=lead_id)
    except Lead.DoesNotExist:
        return Response({"detail": "찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        l.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    d = request.data
    # 단계를 옮기는 것 자체가 '접촉'이다 — 방치 감지 기준을 여기서 갱신한다.
    if d.get("stage") and d["stage"] != l.stage:
        l.last_touch_at = timezone.now()

    for f in ["name", "district", "category", "stage", "owner", "contact", "channel",
              "next_action", "next_action_on", "expected_plan", "memo",
              "converted_restaurant_id"]:
        if f in d:
            setattr(l, f, d[f] if d[f] is not None else "")
    l.save()
    return Response({"lead": lead_json(l)})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def activities(request):
    if request.method == "GET":
        qs = Activity.objects.all()
        t, i = request.query_params.get("target_type"), request.query_params.get("target_id")
        if t and i:
            qs = qs.filter(target_type=t, target_id=i)
        qs = qs.order_by("-created_at")[:100]
        return Response({"activities": [
            {
                "id": str(a.id), "target_type": a.target_type, "target_id": a.target_id,
                "kind": a.kind, "body": a.body, "author": a.author,
                "created_at": a.created_at.isoformat(),
            } for a in qs
        ]})

    d = request.data
    if not (d.get("body") or "").strip() or not d.get("target_id"):
        return Response({"detail": "내용과 대상이 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)

    a = Activity.objects.create(
        target_type=d.get("target_type") or "store",
        target_id=str(d["target_id"]),
        kind=d.get("kind") or "메모",
        body=d["body"].strip(),
        author=d.get("author") or request.user.get_username(),
    )
    # 후보에 기록을 남기면 그것도 '접촉'이다 — 방치 카운터를 되돌린다.
    if a.target_type == "lead":
        Lead.objects.filter(pk=a.target_id).update(last_touch_at=timezone.now())

    return Response({"activity": {
        "id": str(a.id), "target_type": a.target_type, "target_id": a.target_id,
        "kind": a.kind, "body": a.body, "author": a.author,
        "created_at": a.created_at.isoformat(),
    }}, status=status.HTTP_201_CREATED)
