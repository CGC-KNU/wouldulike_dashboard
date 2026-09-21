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

## 백엔드에 나중에 붙이면 좋은 것
1. `POST /api/astro/onboarding/consents/` — `records.ts` 의 `ConsentRecord` 그대로. 붙으면 시트·드라이브는 사본으로 강등.
2. `verify-owner` 에 "발급 토큰" 경로 — 임시 PIN 우회를 없앨 수 있다.
3. `astro/leads/{id}` PATCH 를 점주 토큰에도 허용(단계만) — 완료 시 '계약 완료' 자동 전환이 100% 된다.
