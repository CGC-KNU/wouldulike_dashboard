from django.db import models

"""
Castor 저장 모델.

핵심은 `Graph` 와 `Override` 를 **분리**하는 것이다.
코드는 계속 바뀌고 파서는 배포마다 새 그래프를 밀어 넣는다. 매번 전체를 덮으면
사람이 손으로 그려 넣은 조건부 이동·가안 화면이 사라진다.
→ `Graph` 는 갈아끼우고, `Override` 는 누적한다. 이 규칙이 없으면 아무도 보정을 안 하게 된다.
"""


class Graph(models.Model):
    """파서가 밀어 넣는 스냅샷. 최신 것만 쓰지만 이력을 남겨 커밋 간 비교가 가능하게 한다."""

    commit = models.CharField(max_length=40, blank=True)
    repo = models.CharField(max_length=100, blank=True)
    framework = models.CharField(max_length=40, default="next@app-router")
    screens = models.JSONField(default=list)
    edges = models.JSONField(default=list)
    guards = models.JSONField(default=list)
    # 정적 분석으로 못 잡은 이동 수. 숨기지 않고 화면에 그대로 띄운다 —
    # 숨기면 사람이 지도를 100% 믿어버리고, 틀렸다는 걸 한참 뒤에 안다.
    unresolved = models.PositiveIntegerField(default=0)
    parsed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "castor_graph"
        ordering = ["-parsed_at"]


class Override(models.Model):
    """사람이 보정한 것. 재파싱해도 살아남는다."""

    TYPE = (("edge", "이동"), ("screen", "화면"), ("note", "메모"))

    type = models.CharField(max_length=10, choices=TYPE)
    payload = models.JSONField(default=dict)
    author = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "castor_override"


class Experiment(models.Model):
    """
    A/B 후보 정의. 앱과 Probe 가 `key` 로 같은 실험을 가리킨다.

    필수 필드를 모델 단에서도 강제한다 — 화면에서만 막으면 API 로 우회된다.
      · hypothesis  가설 없는 A/B 는 낭비다
      · metric_primary  승패를 가를 단 하나의 숫자
      · period_from / period_days  "좋아 보일 때 멈추기"를 막는 유일한 장치
    """

    STATUS = (("draft", "초안"), ("running", "진행"), ("done", "종료"), ("abandoned", "중단"))

    key = models.CharField(max_length=60, unique=True)
    hypothesis = models.TextField()
    target_screen = models.CharField(max_length=100, blank=True)
    target_audience = models.CharField(max_length=40, default="all")
    variants = models.JSONField(default=list)  # [{key,name,weight,blocks[]}]
    metric_primary = models.CharField(max_length=200)
    metric_guard = models.JSONField(default=list)
    period_from = models.DateField()
    period_days = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=STATUS, default="draft")
    source_commit = models.CharField(max_length=40, blank=True)
    created_by = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "castor_experiment"
        ordering = ["-created_at"]
