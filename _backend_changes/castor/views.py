from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Experiment, Graph, Override

"""
Castor API.

`ingest` 는 CI 에서 호출한다 (`node scripts/castor-parse.mjs --post`).
사용자 토큰이 없으므로 별도 시크릿(`CASTOR_INGEST_TOKEN`)으로 막는다 —
AllowAny 로 두고 헤더를 직접 확인하는 이유다.
"""


def graph_json(g: Graph) -> dict:
    return {
        "version": g.parsed_at.isoformat(),
        "source": {"repo": g.repo, "commit": g.commit, "framework": g.framework},
        "generated_at": g.parsed_at.isoformat(),
        "screens": g.screens,
        "edges": g.edges,
        "guards": g.guards,
        "unresolved": g.unresolved,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def graph(request):
    g = Graph.objects.first()
    if not g:
        return Response({"graph": None, "overrides": [], "parsed": False})

    overrides = [
        {"id": str(o.id), "type": o.type, "payload": o.payload}
        for o in Override.objects.all()
    ]
    data = graph_json(g)
    # 보정분은 파싱 결과와 섞어서 내려주되 kind 로 구분한다 — 화면에서 배지가 달라진다.
    data["edges"] = data["edges"] + [
        {**o["payload"], "kind": "manual"} for o in overrides if o["type"] == "edge"
    ]
    return Response({"graph": data, "overrides": overrides, "parsed": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def ingest(request):
    import os

    expected = os.environ.get("CASTOR_INGEST_TOKEN")
    if not expected or request.headers.get("X-Castor-Token") != expected:
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    d = request.data
    if not isinstance(d.get("screens"), list):
        return Response({"detail": "screens 배열이 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)

    src = d.get("source") or {}
    g = Graph.objects.create(
        commit=src.get("commit", ""),
        repo=src.get("repo", ""),
        framework=src.get("framework", "next@app-router"),
        screens=d["screens"],
        edges=d.get("edges", []),
        guards=d.get("guards", []),
        unresolved=d.get("unresolved", 0),
    )
    # 이력은 30개만 남긴다. 그래프는 커서 방치하면 금방 쌓인다.
    old = Graph.objects.values_list("id", flat=True)[30:]
    Graph.objects.filter(id__in=list(old)).delete()
    return Response({"graph_id": g.id, "screens": len(g.screens), "edges": len(g.edges)})


def exp_json(e: Experiment) -> dict:
    return {
        "id": e.key,
        "hypothesis": e.hypothesis,
        "target": {"screen": e.target_screen, "audience": e.target_audience},
        "variants": e.variants,
        "metric": {"primary": e.metric_primary, "guard": e.metric_guard},
        "period": {"from": e.period_from.isoformat(), "days": e.period_days},
        "status": e.status,
        "source": {"commit": e.source_commit},
        "created_by": e.created_by,
        "created_at": e.created_at.isoformat(),
    }


@api_view(["GET", "POST", "PATCH"])
@permission_classes([IsAuthenticated])
def experiments(request):
    if request.method == "GET":
        return Response({"experiments": [exp_json(e) for e in Experiment.objects.all()]})

    d = request.data

    if request.method == "PATCH":
        try:
            e = Experiment.objects.get(key=d["id"])
        except (KeyError, Experiment.DoesNotExist):
            return Response({"detail": "찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        if "status" in d:
            e.status = d["status"]
        e.save()
        return Response({"experiment": exp_json(e)})

    missing = []
    if not (d.get("hypothesis") or "").strip():
        missing.append("가설(hypothesis)")
    if not ((d.get("metric") or {}).get("primary") or "").strip():
        missing.append("주요 지표(metric.primary)")
    period = d.get("period") or {}
    if not period.get("from") or not period.get("days"):
        missing.append("기간(period)")
    if len(d.get("variants") or []) < 2:
        missing.append("후보안 2개 이상")
    if missing:
        return Response(
            {"detail": f"{' · '.join(missing)} 이(가) 없으면 실험을 만들 수 없습니다."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    e = Experiment.objects.create(
        key=d.get("id") or f"exp-{int(__import__('time').time())}",
        hypothesis=d["hypothesis"].strip(),
        target_screen=(d.get("target") or {}).get("screen", ""),
        target_audience=(d.get("target") or {}).get("audience", "all"),
        variants=d["variants"],
        metric_primary=d["metric"]["primary"],
        metric_guard=d["metric"].get("guard", []),
        period_from=period["from"],
        period_days=period["days"],
        source_commit=(d.get("source") or {}).get("commit", ""),
        created_by=d.get("created_by") or request.user.get_username(),
    )
    return Response({"experiment": exp_json(e)}, status=status.HTTP_201_CREATED)
