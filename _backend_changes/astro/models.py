from django.db import models
from django.conf import settings


class StoreOps(models.Model):
    """
    Astro 가 소유하는 '매장 운영' 값들.

    계약 조건(플랜·쿠폰·스탬프)은 이미 restaurants / dashboard 쪽에 있으므로 여기에 복제하지 않는다.
    여기 있는 건 **영업이 손으로 확인해서 넣는 값**뿐이다 — 입금, 학기/방학 이용 여부, 비치물 전달.

    왜 자동 판정하지 않나: 2026-08-12 팀 합의. 점주마다 방학에 플랜을 쉬고 싶은 곳도, 오히려
    방학에 필요해하는 곳도 있다. 시스템이 추측해서 채우면 틀렸을 때 영업이 그 값을 못 믿게 되고,
    결국 다시 구글 시트로 돌아간다.

    `updated_by` / `billing_checked_by` 를 남기는 게 이 모델의 핵심이다.
    지금은 시트 셀에 빨간색을 칠하는 방식이라 **누가 언제 확인했는지가 남지 않는다.**
    """

    BILLING = (
        ("UNKNOWN", "미확인"),
        ("PENDING", "입금 대기"),
        ("PAID", "입금 확인"),
        ("EXEMPT", "해당 없음"),
    )
    INVOICE = (
        ("NONE", "미발송"),
        ("SENT", "발송함"),
        ("NO_REPLY", "미회신"),
        ("ISSUED", "발행 완료"),
    )
    PAY_CYCLE = (("MONTHLY", "월납"), ("LUMP", "일시납"))

    restaurant = models.OneToOneField(
        "restaurants.AffiliateRestaurant",
        on_delete=models.CASCADE,
        db_column="restaurant_id",
        to_field="restaurant_id",
        related_name="astro_ops",
        db_constraint=False,
    )

    # 운영 — null 은 '아직 아무도 확인하지 않음'이다. False(쉰다)와 다르다.
    semester_active = models.BooleanField(null=True, blank=True)
    vacation_active = models.BooleanField(null=True, blank=True)
    kit_delivered = models.BooleanField(default=False)  # 포스터·QR 스티커 등 비치물

    # 이행 — 수금과 세금계산서는 별개 상태머신이다. 섞으면
    # "계산서는 나갔는데 돈은 안 들어온" 칸이 어디에도 안 잡힌다.
    billing = models.CharField(max_length=10, choices=BILLING, default="UNKNOWN")
    billing_checked_at = models.DateField(null=True, blank=True)
    billing_checked_by = models.CharField(max_length=50, blank=True)
    invoice = models.CharField(max_length=10, choices=INVOICE, default="NONE")
    quote_sent_at = models.DateField(null=True, blank=True)
    contract_returned_at = models.DateField(null=True, blank=True)

    # 계약 사실관계 — 시트에서 옮겨올 때 채운다. 없으면 비워 둔다.
    owner_name = models.CharField(max_length=50, blank=True)
    owner_phone = models.CharField(max_length=30, blank=True)
    biz_no = models.CharField(max_length=20, blank=True)
    monthly_fee = models.PositiveIntegerField(null=True, blank=True)
    pay_cycle = models.CharField(max_length=10, choices=PAY_CYCLE, blank=True)
    contract_started_on = models.DateField(null=True, blank=True)
    contract_months = models.PositiveSmallIntegerField(null=True, blank=True)

    # 시트 '계약 세부사항' 열 1:1 — 툴이 시트를 대체하므로 전부 편집 가능 (2026-09-10 민열).
    CAMPUS = [("경북대", "경북대"), ("영남대", "영남대"), ("계명대", "계명대")]
    campus = models.CharField(max_length=10, choices=CAMPUS, default="경북대")  # 캠퍼스 (0911 1차 축)
    district = models.CharField(max_length=30, blank=True)  # 상권
    contract_signed_on = models.DateField(null=True, blank=True)  # 계약일
    contract_ends_on = models.DateField(null=True, blank=True)  # 전체 계약기간 끝
    coupon_basic = models.TextField(blank=True)  # 기본 쿠폰 (상시)
    coupon_limited = models.TextField(blank=True)  # 한정 쿠폰
    stamp_count = models.CharField(max_length=40, blank=True)  # "5 / 10 / 20"
    stamp_reward = models.TextField(blank=True)
    exclusions = models.TextField(blank=True)  # 식사권 제외 메뉴·시간대
    extra_quote = models.TextField(blank=True)  # 별도 견적 항목
    kit_note = models.CharField(max_length=40, blank=True)  # 홍보물 수령 "2장/10장"
    pin = models.CharField(max_length=10, blank=True)
    contract_original = models.CharField(max_length=100, blank=True)  # 계약서 원본 보관
    sheet_owner = models.CharField(max_length=50, blank=True)  # 담당자
    sheet_synced_at = models.DateTimeField(null=True, blank=True)

    # 테스트·시드 매장 플래그. KPI 집계에서 뺀다.
    # ADIT 콘솔이 파트너 79곳 중 49곳이 preseed 더미라 지표가 부풀려졌던 걸 반면교사 삼는다.
    is_test = models.BooleanField(default=False)

    memo = models.TextField(blank=True)
    updated_by = models.CharField(max_length=50, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "astro_store_ops"

    def __str__(self):
        return f"StoreOps:{self.restaurant_id} ({self.billing})"


class Lead(models.Model):
    """
    입점 후보(신규 컨택).

    단계가 '계약'에서 끝나지 않고 '입점완료'까지 가는 게 설계의 핵심이다 (ADIT Pitchr 차용).
    영업이 자기가 딴 건이 실제로 굴러갔는지 툴을 갈아타지 않고 본다.

    `last_touch_at` 은 방치 감지의 기준이다. 단계를 옮기거나 활동을 기록하면 갱신된다.
    """

    STAGE = (
        ("미컨택", "미컨택"),
        ("컨택", "컨택"),
        ("미팅조율", "미팅조율"),
        ("미팅", "미팅"),
        ("제안·견적", "제안·견적"),
        ("계약", "계약"),
        ("입점완료", "입점완료"),
        ("거절", "거절"),
    )

    # 열은 팀 시트(매장 현황 · 신규 컨택 · 후보 실측)의 합집합. 시트를 대체하려면 열을 잃으면 안 된다.
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=10, blank=True)  # 기존 파트너 / 신규
    campus = models.CharField(max_length=10, default="경북대")  # 캠퍼스
    district = models.CharField(max_length=50, blank=True)  # 상권
    category = models.CharField(max_length=50, blank=True)
    stage = models.CharField(max_length=12, choices=STAGE, default="미컨택")
    owner = models.CharField(max_length=50, blank=True)  # 담당자
    intent = models.CharField(max_length=1, blank=True)  # 유료화 의향 A~D
    owner_name = models.CharField(max_length=50, blank=True)  # 대표자
    phone = models.CharField(max_length=30, blank=True)  # 매장 전화
    contact = models.CharField(max_length=50, blank=True)  # 대표 연락처
    link = models.URLField(blank=True)  # 네이버 플레이스
    insta = models.CharField(max_length=60, blank=True)
    channel = models.CharField(max_length=20, blank=True)  # 방문/전화/인스타DM/소개/폼
    contacted_at = models.CharField(max_length=40, blank=True)  # 시트 원문 그대로 ("8/6")
    meeting_at = models.CharField(max_length=40, blank=True)
    attendees = models.CharField(max_length=100, blank=True)
    proposed_plan = models.CharField(max_length=40, blank=True)  # "Boost 3만"
    next_action = models.CharField(max_length=200, blank=True)
    due = models.CharField(max_length=40, blank=True)
    last_touch_at = models.DateTimeField(null=True, blank=True)
    grade = models.CharField(max_length=1, blank=True)  # 후보 실측 등급 A/B/C
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    angle = models.TextField(blank=True)  # 공략 포인트
    memo = models.TextField(blank=True)
    source = models.CharField(max_length=20, default="manual")  # manual / sheet:현황 / sheet:신규 / sheet:후보
    # 계약으로 넘어가면 실제 매장 레코드와 이어 붙인다. 파이프라인은 여기서 끝나지 않는다.
    converted_restaurant_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "astro_lead"
        indexes = [models.Index(fields=["stage", "last_touch_at"])]

    def __str__(self):
        return f"{self.name} ({self.stage})"


class Activity(models.Model):
    """
    활동 기록 — 메모/전화/카톡/미팅/방문.

    제휴 매장 소통이 전부 카톡이라 자동 수집이 안 된다(2026-09-09 확인).
    자동화 대신 **수기 입력의 마찰을 0에 가깝게** 만드는 쪽을 택했다.
    종류를 자유 텍스트가 아니라 고정 enum 으로 둔 이유는, 나중에
    "이 매장 몇 번 방문했지"를 셀 수 있어야 하기 때문이다.
    """

    KIND = (("메모", "메모"), ("전화", "전화"), ("카톡", "카톡"), ("미팅", "미팅"), ("방문", "방문"))
    TARGET = (("lead", "입점 후보"), ("store", "매장"))

    target_type = models.CharField(max_length=10, choices=TARGET)
    target_id = models.CharField(max_length=40)
    kind = models.CharField(max_length=6, choices=KIND, default="메모")
    body = models.TextField()
    author = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "astro_activity"
        indexes = [models.Index(fields=["target_type", "target_id", "-created_at"])]


class SalesDoc(models.Model):
    """
    자료실 — 계약서·제안서·견적서·안내문·전단.
    파일 본체는 드라이브/S3 에 두고 링크만 갖는다. 공개 레포·DB 어디에도 계약서 바이너리를 넣지 않는다.
    """

    KIND = (("계약서", "계약서"), ("제안서", "제안서"), ("소개서", "소개서"), ("견적서", "견적서"), ("안내문", "안내문"), ("전단", "전단"), ("포스터", "포스터"), ("기타", "기타"))

    kind = models.CharField(max_length=6, choices=KIND, default="기타")
    title = models.CharField(max_length=120)
    version = models.CharField(max_length=20, blank=True)
    url = models.URLField(blank=True)
    when = models.CharField(max_length=60, blank=True)  # 언제 쓰나 (영업 단계)
    note = models.TextField(blank=True)
    updated_by = models.CharField(max_length=50, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "astro_sales_doc"


class Issuer(models.Model):
    """발행 주체 — 우주라이크는 하나(개인사업자 코끼리). 볼타 고객 키와 공동인증서 만료일을 갖는다."""

    name = models.CharField(max_length=60)
    biz_no = models.CharField(max_length=20)
    ceo = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    bolta_customer_key = models.CharField(max_length=80, blank=True)
    cert_expires_at = models.DateField(null=True, blank=True)
    item_template = models.CharField(max_length=100, default="우주라이크 파트너 플랜 {period}분")
    approver = models.CharField(max_length=30, blank=True)
    slack_channel = models.CharField(max_length=40, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "astro_issuer"


class TaxInvoice(models.Model):
    """
    전자세금계산서 — 애딧 세발 상태머신 그대로.
    국세청 발행은 되돌리기 어려운 외부 부작용이라 승인 단계를 두고, 볼타 응답이 애매하면 RESULT_UNKNOWN 으로 멈춘다.
    """

    STATUS = (("PENDING", "품의"), ("APPROVED", "승인"), ("ISSUING", "발행 중"), ("ISSUED", "발행 완료"),
              ("FAILED", "발행 실패"), ("RESULT_UNKNOWN", "결과 불명"), ("REJECTED", "반려"), ("CANCELED", "취소"))

    restaurant_id = models.IntegerField()
    name = models.CharField(max_length=100)
    title = models.CharField(max_length=120)
    period = models.CharField(max_length=7)  # YYYY-MM
    supply = models.PositiveIntegerField()
    tax = models.PositiveIntegerField()
    total = models.PositiveIntegerField()
    tax_type = models.CharField(max_length=10, default="TAXABLE")
    receipt_type = models.CharField(max_length=10, default="CLAIM")
    write_date = models.DateField()
    counterparty = models.JSONField(default=dict)  # {biz_no, ceo, email, phone}
    status = models.CharField(max_length=16, choices=STATUS, default="PENDING")
    requested_by = models.CharField(max_length=30)
    requested_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.CharField(max_length=30, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    nts_no = models.CharField(max_length=40, blank=True)  # 국세청 승인번호
    bolta_key = models.CharField(max_length=80, blank=True)
    url = models.URLField(blank=True)
    fail_code = models.CharField(max_length=40, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    reject_reason = models.TextField(blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    memo = models.TextField(blank=True)

    class Meta:
        db_table = "astro_tax_invoice"
        indexes = [models.Index(fields=["period", "status"])]
        constraints = [models.UniqueConstraint(fields=["restaurant_id", "period"], condition=models.Q(status__in=["PENDING", "APPROVED", "ISSUING", "ISSUED"]), name="one_open_invoice_per_store_period")]
