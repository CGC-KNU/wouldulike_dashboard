# 백엔드 인계 — astro · probe · castor

프론트는 이미 이 경로들을 호출하고 있습니다. 백엔드가 404/502 를 주면 초안 저장소로 떨어지고,
200 을 주면 그대로 씁니다. **프론트를 고칠 필요가 없습니다** — 앱을 올리면 화면의
`초안 데이터` 배지가 사라지는 것으로 전환을 확인합니다.

## 붙이는 순서

1. `astro/` `probe/` `castor/` 폴더를 `wouldulike_backend/` 루트에 복사

2. `settings.py`
   ```python
   INSTALLED_APPS = [
       ...
       "astro",
       "probe",
       "castor",
   ]
   ```

3. `wouldulike_backend/urls.py`
   ```python
   path("api/astro/",  include("astro.urls")),
   path("api/probe/",  include("probe.urls")),
   path("api/castor/", include("castor.urls")),
   ```

4. 마이그레이션
   ```bash
   python manage.py makemigrations astro probe castor
   python manage.py migrate
   ```

5. CI 에서 Castor 파서를 쓰려면 환경변수 `CASTOR_INGEST_TOKEN` 을 넣고,
   배포 워크플로에 한 줄:
   ```yaml
   - run: node scripts/castor-parse.mjs
   - run: curl -X POST "$CASTOR_INGEST" -H "X-Castor-Token: $CASTOR_INGEST_TOKEN" -d @graph.json
   ```

## 프론트가 기대하는 응답 형태

| 프론트 경로 | 백엔드 경로 | 응답 |
|---|---|---|
| `GET /api/astro/stores` | `GET /api/astro/stores/ops/` | `{ops: StoreOps[]}` — 프론트가 매장 목록과 합침 |
| `GET/PATCH /api/astro/stores/[id]` | `/api/astro/stores/<id>/` | `{ops: StoreOps}` |
| `GET/POST /api/astro/leads` | `/api/astro/leads/` | `{leads: Lead[]}` / `{lead: Lead}` |
| `PATCH/DELETE /api/astro/leads/[id]` | `/api/astro/leads/<id>/` | `{lead: Lead}` / 204 |
| `GET/POST /api/astro/activities` | `/api/astro/activities/` | `{activities: Activity[]}` |
| `GET/POST/PATCH/DELETE /api/astro/docs` | `/api/astro/docs/` | `{docs: SalesDoc[]}` — 링크만, 파일 본체 없음 |
| `GET/POST /api/astro/import` | (프론트에서 시트 CSV 직접 읽음) | 백엔드로 옮기면 크론 1일 1회 |
| `GET /api/astro/export?tab=후보\|계약` | (프론트) | 시트와 같은 열 순서의 CSV |
| `POST /api/astro/convert` | `restaurants/create/` 재사용 | 후보 → 매장 생성 + 운영 필드 이관 |
| `GET /api/probe/overview` | `/api/probe/overview/` | `{stores: StoreMetric[], totals: {...}}` |
| `GET /api/castor/graph` | `/api/castor/graph/` | `{graph, overrides, parsed}` |
| `POST /api/castor/graph` | `/api/castor/graph/ingest/` | `{graph_id, screens, edges}` |
| `GET/POST/PATCH /api/castor/experiments` | `/api/castor/experiments/` | `{experiments}` / `{experiment}` |

타입 정의는 `src/lib/draft/types.ts` 가 원본입니다. 모델 필드명을 그대로 맞춰 뒀습니다.

## 남은 일

- `probe/views.py` 의 `_summarize()` — 실제 쿠폰/스탬프 모델로 채우기 (민찬)
  지금 프론트가 매장마다 `/api/dashboard/stats/` 를 34번 호출합니다. 한 번의 annotate 로 끝날 일입니다.
- 정합성 점검(`/api/probe/quality`)은 아직 프론트에서 계산합니다. 크론으로 돌려 슬랙에
  '새로 생긴 높음'만 보내려면 백엔드로 옮기고 `QualitySnapshot` 에 이력을 남겨야 합니다.
- `astro.Lead.converted_restaurant_id` 는 지금 그냥 IntegerField 입니다.
  실제 매장 FK 로 바꿀지는 매장 생성 흐름을 보고 정하면 됩니다.

## 지울 것

백엔드가 다 붙으면 프론트에서 아래를 통째로 지웁니다.

```
src/lib/draft/store.ts
src/lib/draft/seed.ts
src/lib/draft/previewStores.ts
src/app/auth/preview/route.ts
```

`toolProxy.ts` 는 draftFn 인자만 빼고 남겨도 됩니다 — 상태 코드 보존 프록시라 쓸모가 있습니다.
`types.ts` 는 계속 씁니다.

## 0911 추가 — 연계 · Probe 운영 화면

프론트가 새로 부르는 경로. 지금은 전부 Next 쪽에서 기존 API 를 조합하거나 초안 저장소를 쓰므로 **백엔드 작업 없이도 동작**한다.
아래는 "제대로 붙이려면" 필요한 것.

| 프론트 경로 | 지금 | 제대로 하려면 |
| --- | --- | --- |
| `GET /api/astro/link?id&name` | `/api/satellite/plans/`(최근 3개월) + `/api/dashboard/stats/` 를 **매장 이름 매칭** | `Sponsorship.restaurant`, `ContentPlan.restaurant` FK 추가 → 이름 매칭 제거 |
| `GET /api/probe/insights` | 발행된 기획의 topic 에 제휴 매장 이름 → `/plans/{id}/performance` | 같은 FK + `PostPerformance` 에 `non_follower_ratio`(비팔로워 노출 비중), 성장세(전 7일 대비) 추가 (아윤 지표셋) |
| `GET/PATCH /api/probe/mileage` | 초안 저장소 `probe_mileage` (회차·응모풀·결과) | `MileageRound` 모델 + **앱 DB 응모풀 → 회차 스냅샷 자동 적재**(재민). 이게 붙어야 9/2·9/4·9/9 식 보류가 끝난다 |
| `StoreOps.campus` | 초안 필드 (경북대·영남대·계명대) | `astro/models.py` StoreOps 에 `campus = CharField(choices=…)` — 이미 반영 |
