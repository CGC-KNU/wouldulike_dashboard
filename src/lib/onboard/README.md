# 점주 온보딩 (`/onboard/{token}`)

카톡 링크 하나로 **계약(약관 동의) → PIN → 혜택(스탬프 필수) → 입금 안내 → 웰컴 키트 → 완료**.
설계 원문·결정: `CGC/04_사내툴_개발/0921_점주_온보딩_설계/점주_온보딩_플로우.html`

## 왜 이렇게 생겼나 (백엔드를 안 건드린 이유)
- 백엔드에 온보딩 테이블이 없고, 이 레포 초안 저장소는 재배포에 날아간다 → **링크 토큰은 무상태 HMAC 서명**(`token.ts`).
- 새 매장 첫 로그인은 백엔드가 "카카오 + 매장 PIN" 으로만 허용한다 → 발급 시 **임시 PIN** 을 심고(`api/onboard/issue`),
  세션 라우트가 대신 넣어 `verify-owner` 를 통과시킨 뒤(`[token]/session`), [0]단계에서 점주가 PIN 을 갈아엎는다(`[token]/pin`). 그 순간 링크는 1회성으로 닫힌다.
- 동의 기록은 **세 곳**에 쓴다 — 백엔드 `astro/activities`(점주 토큰이면 403 가능) + 구글 시트 + 드라이브(계약서 사본 HTML·JSON). 하나도 못 남기면 실패로 돌려준다(`records.ts`).
- 서버가 순서를 강제한다: `[2]` 동의 → `ob_consent_{rid}` 서명 쿠키, `[6]` 완료는 그 쿠키 + **스탬프 규칙 존재** 를 확인한다(`[token]/complete`).

## 환경변수 (`.env.local.example` 참고)
`ONBOARD_SECRET`(필수) · `ONBOARD_GSHEET_URL/TOKEN/ID/TAB` · `ONBOARD_DRIVE_URL/TOKEN` · `ONBOARD_SMS_PROVIDER`(미구현, 비우면 번호 입력만) · `ONBOARD_GUIDE_URL`

## 백엔드 소스로 확인한 것 (wouldulike_backend main 45bd6e7 · 0921)
| 가정 | 결과 | 반영 |
|---|---|---|
| 관리자 매장 PATCH 가 `pin` 을 받는다 | **아니다** — `is_affiliate`·`tier` 만 | `issue` 는 `GET restaurant/?restaurant_id=` 로 현재 PIN 을 읽고 `POST auth/change-pin/?restaurant_id=` 로 심는다 (PIN 없으면 new_pin 만, 있으면 current_pin 동봉) |
| `verify-owner` 가 임시 PIN 으로 세션을 준다 | 된다 — 단 **`OwnerProfile.user` 가 OneToOne** 이라, 이미 다른 매장 점주인 카카오 계정은 `restaurant_id` 를 무시하고 그 매장 토큰을 준다 | `session` 이 응답 `restaurant_id !== rid` 면 409 로 막는다. **한 카카오 계정 = 매장 하나** (낼름+카츠D9 같은 다점포 사장님은 계정을 나눠야 함) |
| `change-pin` 이 `{current_pin, new_pin}` | 된다 (점주는 owner_profile 로 매장 결정, PIN 있으면 current_pin 필수) | 그대로 |
| 스탬프 PATCH `{rule_type, config_json, active}` / coupon-types 배열 | 된다 | 그대로 |
| 점주 토큰으로 `astro/activities`·`astro/leads` 쓰기 | **403** (전부 `_is_admin`) | 활동기록은 안 남고, 후보 단계 자동 전환도 안 된다 → **시트·드라이브 env 가 사실상 필수**, 단계 전환은 슬랙 문장을 리브라가 읽거나 수동 |

## 백엔드에 나중에 붙이면 좋은 것
1. `POST /api/astro/onboarding/consents/` — `records.ts` 의 `ConsentRecord` 그대로. 붙으면 시트·드라이브는 사본으로 강등.
2. `verify-owner` 에 "발급 토큰" 경로 — 임시 PIN 우회를 없앨 수 있다.
3. `astro/leads/{id}` PATCH 를 점주 토큰에도 허용(단계만) — 완료 시 '계약 완료' 자동 전환이 100% 된다.
