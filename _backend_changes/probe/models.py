from django.db import models

"""
Probe 는 대부분 **저장하지 않는다** — 매장 지표도 정합성 점검도 다른 테이블을 읽어 계산한 결과다.
계산 결과를 테이블로 만들면 원본과 어긋나는 순간 Probe 자신이 정합성 문제의 원인이 된다.

딱 하나 저장하는 게 점검 이력이다. "언제부터 이 문제가 있었나", "고쳤는데 다시 생겼나"는
계산으로 알 수 없고, 슬랙 알림을 '새로 생긴 것만' 보내려면 어제 상태를 알아야 하기 때문이다.
"""


class QualitySnapshot(models.Model):
    """하루 한 번 점검 결과를 통째로 남긴다. 알림은 '어제 없다가 오늘 생긴 것'만 보낸다."""

    ran_at = models.DateTimeField(auto_now_add=True)
    high = models.PositiveIntegerField(default=0)
    medium = models.PositiveIntegerField(default=0)
    low = models.PositiveIntegerField(default=0)
    # [{rule, severity, subject, title}, ...] — 규칙+대상 조합이 키다
    issues = models.JSONField(default=list)
    backend_reachable = models.BooleanField(default=True)

    class Meta:
        db_table = "probe_quality_snapshot"
        ordering = ["-ran_at"]

    def keys(self) -> set:
        return {f"{i['rule']}:{i['subject']}" for i in self.issues}
