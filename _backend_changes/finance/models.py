from django.db import models


class FinanceItem(models.Model):
    """
    고정 비용 항목 — 「어떤 비용이 나가는가」의 목록.

    계좌가 연결돼 있지 않아 출금은 사람이 적는다. 이 표는 그 장부의 '항목' 쪽이다:
    처음부터 깔린 기본 항목(is_default, key 로 구분)과 대표가 추가한 항목이 같이 들어 있다.

    amount 가 NULL 이면 「아직 모름」이다. 0 은 「무료」라서 다르다 — 모르는 금액을 0 으로 채우면
    합계가 조용히 틀린다.
    """

    CYCLE = (("MONTHLY", "매월"), ("YEARLY", "매년"))
    # 출금 방식 — FIXED: amount 가 나가는 금액 / PER_PAID_STORE: amount 는 식당 1곳당 단가, 나가는 돈 = 단가 × 그 달 유료 식당 수
    # (곱하는 계산은 프론트가 한다. 유료 식당 수는 매장 DB 의 지금 상태에서 오고, 기록(FinanceEntry)에는 계산된 금액이 박힌다.)
    METHOD = (("FIXED", "고정 금액"), ("PER_PAID_STORE", "유료 식당 수 × 단가"))

    # 기본 항목의 고정 이름표("default:infra"). 같은 기본 항목이 두 번 깔리지 않게 하는 열쇠 — 직접 추가한 항목은 NULL.
    key = models.CharField(max_length=40, unique=True, null=True, blank=True)
    name = models.CharField(max_length=60)
    category = models.CharField(max_length=20, default="기타")
    method = models.CharField(max_length=16, choices=METHOD, default="FIXED")
    amount = models.PositiveBigIntegerField(null=True, blank=True)  # FIXED=금액 · PER_PAID_STORE=곳당 단가
    cycle = models.CharField(max_length=8, choices=CYCLE, default="MONTHLY")
    pay_day = models.PositiveSmallIntegerField(null=True, blank=True)  # 1~31
    start_period = models.CharField(max_length=7)  # YYYY-MM
    end_period = models.CharField(max_length=7, blank=True)  # 빈 값 = 계속
    active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    memo = models.TextField(blank=True)
    updated_by = models.CharField(max_length=50, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "finance_item"
        ordering = ["-is_default", "id"]


class FinanceEntry(models.Model):
    """
    출금 한 건 — 실제로 나간 돈의 기록.

    item 이 있으면 고정 비용 항목의 그 달 지급이고, 없으면 한 번 나간 비용이다.
    period 는 '어느 달 몫인가'(귀속 월), paid_on 은 '돈이 나간 날'이다 — 현금 흐름은 paid_on 으로 센다.
    항목을 지우려 해도 기록이 달려 있으면 PROTECT 로 막는다: 지난 달 장부의 항목 이름이 사라지면 안 된다.
    """

    item = models.ForeignKey(FinanceItem, null=True, blank=True, on_delete=models.PROTECT, related_name="entries")
    paid_on = models.DateField()
    period = models.CharField(max_length=7)  # YYYY-MM
    name = models.CharField(max_length=80)
    category = models.CharField(max_length=20, default="기타")
    amount = models.PositiveBigIntegerField()
    memo = models.TextField(blank=True)
    created_by = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "finance_entry"
        ordering = ["-paid_on", "-id"]
        indexes = [models.Index(fields=["paid_on"])]
        constraints = [
            # 한 항목의 같은 달 지급은 한 번만 — 같은 달을 두 번 눌러 이중으로 기록되는 걸 막는다
            models.UniqueConstraint(fields=["item", "period"], condition=models.Q(item__isnull=False), name="one_entry_per_item_period"),
        ]
