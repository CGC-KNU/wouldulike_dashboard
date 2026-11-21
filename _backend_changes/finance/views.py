import re
from datetime import date, datetime, timedelta, timezone

from django.conf import settings
from django.db import IntegrityError
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from .models import FinanceEntry, FinanceItem

"""
Finance API — 재무(출금 장부).

프론트(Next route handler `src/app/api/finance/*`)가 이미 이 경로들을 부른다. 올리는 순간 초안 저장소 대신 이 DB 가 원본이 된다.
입금은 여기 없다 — 입금은 astro 앱(세금계산서·스팟 제작)이 원본이고, 재무 화면이 그걸 읽기만 한다.

urls.py 에서 `api/finance/` 아래에 붙인다.

권한: **민열 · 재민 두 사람만.** 부서 권한이 아니라 계정 아이디로 막는다(프론트·Next 라우트도 같은 규칙).
기본값은 아래 상수고, settings.FINANCE_VIEWERS 로 덮어쓸 수 있다.
"""

DEFAULT_VIEWERS = ("minyeol", "jaemin")
PERIOD = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
CATEGORIES = {"식사권", "인프라", "도구·구독", "마케팅·협찬", "제작", "인건비", "세금·수수료", "기타"}
MAX_AMOUNT = 10_000_000_000


class IsFinanceViewer(BasePermission):
    message = "재무는 대표만 볼 수 있습니다."

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        allowed = {a.lower() for a in getattr(settings, "FINANCE_VIEWERS", DEFAULT_VIEWERS)}
        return u.get_username().lower() in allowed


def today_kst() -> date:
    """한국 날짜 — 서버 시간대(UTC 일 수 있다)와 무관하게. 프론트의 '오늘'과 같은 기준이어야 새벽에 어긋나지 않는다."""
    return datetime.now(timezone(timedelta(hours=9))).date()


def err(detail, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": detail}, status=code)


def money(v, allow_null):
    """0 이상 정수. None(모름)은 allow_null 일 때만. 잘못된 값은 ValueError."""
    if v is None or v == "":
        if allow_null:
            return None
        raise ValueError("금액을 입력하세요.")
    if isinstance(v, bool) or not isinstance(v, int):
        raise ValueError("금액은 정수여야 합니다.")
    if v < 0 or v > MAX_AMOUNT:
        raise ValueError("금액 범위가 올바르지 않습니다.")
    return v


def category(v):
    return v if v in CATEGORIES else "기타"


def actor(request, data):
    return data.get("updated_by") or data.get("created_by") or request.user.get_username()


# ── 항목 ───────────────────────────────────────────────

def item_json(i: FinanceItem) -> dict:
    return {
        "id": str(i.id), "key": i.key, "name": i.name, "category": i.category, "method": i.method, "amount": i.amount,
        "cycle": i.cycle, "pay_day": i.pay_day, "start_period": i.start_period,
        "end_period": i.end_period or None, "active": i.active, "is_default": i.is_default,
        "memo": i.memo or None, "updated_by": i.updated_by or None,
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


ITEM_FIELDS = ["name", "category", "method", "amount", "cycle", "pay_day", "start_period", "end_period", "active", "memo"]


def apply_item(obj: FinanceItem, d: dict):
    """온 칸만 반영한다. 검사에 걸리면 ValueError."""
    if "name" in d:
        name = (d["name"] or "").strip()
        if not name or len(name) > 60:
            raise ValueError("항목 이름은 1~60자여야 합니다.")
        obj.name = name
    if "category" in d:
        obj.category = category(d["category"])
    if "method" in d:
        if d["method"] not in ("FIXED", "PER_PAID_STORE"):
            raise ValueError("출금 방식은 고정 금액 · 유료 식당 수 × 단가 중 하나입니다.")
        obj.method = d["method"]
    if "amount" in d:
        obj.amount = money(d["amount"], True)
    if "cycle" in d:
        if d["cycle"] not in ("MONTHLY", "YEARLY"):
            raise ValueError("주기는 매월 · 매년 중 하나입니다.")
        obj.cycle = d["cycle"]
    if "pay_day" in d:
        v = d["pay_day"]
        if v in (None, ""):
            obj.pay_day = None
        elif isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 31:
            obj.pay_day = v
        else:
            raise ValueError("지급일은 1~31 사이 숫자입니다.")
    if "start_period" in d:
        if not PERIOD.match(str(d["start_period"])):
            raise ValueError("시작 월은 YYYY-MM 형식이어야 합니다.")
        obj.start_period = d["start_period"]
    if "end_period" in d:
        v = d["end_period"]
        if v in (None, ""):
            obj.end_period = ""
        elif PERIOD.match(str(v)):
            obj.end_period = v
        else:
            raise ValueError("종료 월은 YYYY-MM 형식이어야 합니다.")
    if "active" in d:
        obj.active = bool(d["active"])
    if "memo" in d:
        memo = (d["memo"] or "").strip()
        if len(memo) > 300:
            raise ValueError("메모는 300자 이하여야 합니다.")
        obj.memo = memo
    if obj.end_period and obj.start_period and obj.end_period < obj.start_period:
        raise ValueError("종료 월이 시작 월보다 앞입니다.")


@api_view(["GET", "POST"])
@permission_classes([IsFinanceViewer])
def items(request):
    if request.method == "GET":
        return Response({"items": [item_json(i) for i in FinanceItem.objects.all()]})

    d = request.data
    key = d.get("key") or None
    # 기본 항목은 key 로 멱등 — 이미 있으면 그대로 돌려준다(두 사람이 동시에 열어도 두 번 깔리지 않는다)
    if key:
        existing = FinanceItem.objects.filter(key=key).first()
        if existing:
            return Response({"item": item_json(existing)})
    obj = FinanceItem(key=key, is_default=bool(d.get("is_default")), updated_by=actor(request, d))
    try:
        apply_item(obj, d)
    except ValueError as e:
        return err(str(e))
    if not obj.start_period:
        return err("시작 월을 입력하세요.")
    try:
        obj.save()
    except IntegrityError:  # key 가 동시에 두 번 들어온 경우
        return Response({"item": item_json(FinanceItem.objects.get(key=key))})
    return Response({"item": item_json(obj)}, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsFinanceViewer])
def item_detail(request, item_id: int):
    try:
        obj = FinanceItem.objects.get(pk=item_id)
    except FinanceItem.DoesNotExist:
        return err("찾을 수 없습니다.", status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        if obj.is_default:
            return err("기본 항목은 지울 수 없습니다. 쉬게 하세요.", status.HTTP_409_CONFLICT)
        try:
            obj.delete()
        except ProtectedError:
            return err("지급 기록이 있는 항목은 지울 수 없습니다. 쉬게 하세요.", status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)

    try:
        apply_item(obj, request.data)
    except ValueError as e:
        return err(str(e))
    obj.updated_by = actor(request, request.data)
    obj.save()
    return Response({"item": item_json(obj)})


# ── 출금 기록 ──────────────────────────────────────────

def entry_json(e: FinanceEntry) -> dict:
    return {
        "id": str(e.id), "item_id": str(e.item_id) if e.item_id else None,
        "paid_on": e.paid_on.isoformat(), "period": e.period, "name": e.name, "category": e.category,
        "amount": e.amount, "memo": e.memo or None, "created_by": e.created_by or None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def apply_entry(obj: FinanceEntry, d: dict):
    if "paid_on" in d:
        try:
            paid = date.fromisoformat(str(d["paid_on"]))
        except ValueError:
            raise ValueError("나간 날은 YYYY-MM-DD 형식이어야 합니다.")
        if paid > today_kst():
            raise ValueError("나간 날은 오늘 이후가 될 수 없습니다.")
        obj.paid_on = paid
    if "period" in d:
        if not PERIOD.match(str(d["period"])):
            raise ValueError("귀속 월은 YYYY-MM 형식이어야 합니다.")
        obj.period = d["period"]
    if "name" in d:
        name = (d["name"] or "").strip()
        if not name or len(name) > 80:
            raise ValueError("내용은 1~80자여야 합니다.")
        obj.name = name
    if "category" in d:
        obj.category = category(d["category"])
    if "amount" in d:
        v = money(d["amount"], False)
        if not v:
            raise ValueError("금액은 0원보다 커야 합니다.")
        obj.amount = v
    if "item_id" in d:
        if d["item_id"] in (None, ""):
            obj.item = None
        else:
            try:
                obj.item = FinanceItem.objects.get(pk=int(d["item_id"]))
            except (FinanceItem.DoesNotExist, ValueError, TypeError):
                raise ValueError("연결한 항목을 찾을 수 없습니다.")
    if "memo" in d:
        memo = (d["memo"] or "").strip()
        if len(memo) > 300:
            raise ValueError("메모는 300자 이하여야 합니다.")
        obj.memo = memo


@api_view(["GET", "POST"])
@permission_classes([IsFinanceViewer])
def entries(request):
    if request.method == "GET":
        qs = FinanceEntry.objects.all()
        p = request.query_params.get("period")
        if p:
            qs = qs.filter(paid_on__startswith=p)
        return Response({"entries": [entry_json(e) for e in qs]})

    d = request.data
    obj = FinanceEntry(created_by=d.get("created_by") or request.user.get_username())
    try:
        apply_entry(obj, d)
    except ValueError as e:
        return err(str(e))
    if not obj.paid_on or not obj.name or not obj.amount:
        return err("나간 날 · 내용 · 금액은 필수입니다.")
    if not obj.period:
        obj.period = obj.paid_on.strftime("%Y-%m")
    try:
        obj.save()
    except IntegrityError:
        return err("이 항목의 같은 달 지급은 이미 기록돼 있습니다.", status.HTTP_409_CONFLICT)
    return Response({"entry": entry_json(obj)}, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsFinanceViewer])
def entry_detail(request, entry_id: int):
    try:
        obj = FinanceEntry.objects.get(pk=entry_id)
    except FinanceEntry.DoesNotExist:
        return err("찾을 수 없습니다.", status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    try:
        apply_entry(obj, request.data)
        obj.save()
    except ValueError as e:
        return err(str(e))
    except IntegrityError:
        return err("이 항목의 같은 달 지급은 이미 기록돼 있습니다.", status.HTTP_409_CONFLICT)
    return Response({"entry": entry_json(obj)})
