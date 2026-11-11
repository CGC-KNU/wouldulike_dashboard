# Flutter 파트너 모드 BFF

- 앱 경로: `src/app/api/app/owner/[...operation]/route.ts`. catch-all을 사용하지만 `lib/owner/routes.ts`의 정확한 경로·메서드만 허용한다. 기존 웹 쿠키는 앱 경로의 인증 수단이 아니다.
- 인증: 앱 Bearer를 기존 Django app-token으로 요청마다 교환한다. 점주 access는 해당 요청 문맥에서만 사용하며 refresh는 버린다. 요청 매장·교환 매장·업무 응답 매장을 비교한다. 교환 401/403은 기존 partner/me로 세션 만료와 점주 권한 해제를 구분한다.
- 허용 업무: 조회, 매장 정보 PATCH, restaurant 사진 presign, PIN 변경, 혜택 변경 신청. 직접 혜택/스탬프 수정·임의 upstream URL은 제공하지 않는다.
- 공유 처리: `owner/benefitRequests.ts`의 저장 후 Slack 알림, `owner/plans.ts` 카탈로그, `owner/presentation.ts` 청구 공개·리포트 준비 상태. 웹 신청도 같은 함수를 사용한다. Slack 실패·5초 초과는 이미 저장한 신청을 실패로 바꾸지 않는다.
- 리포트: 기존 Probe 공개 목록 → 현재 by-token 공개 상태를 확인 → canonical `/r/<40자리 hex>` 반환. 앱 응답에 snapshot, 점주 토큰, 내부 열람 집계를 넣지 않는다.
- 장애: JSON 오류와 `Cache-Control: private, no-store`. 앱 경로에는 초안 파일 fallback·웹 로그인 redirect·쿠키 발급이 없다. 원본 Django의 기존 정책 문제는 별도 후속 과제다.

## 설정

| 이름 | 소비 서버·목적 | 기본값·미설정 | 비밀 여부 | 배포·롤백 |
| --- | --- | --- | --- | --- |
| `APP_OWNER_MODE_ENABLED` | Next.js 앱 BFF config/guard, 단계적 활성화 | false. 정확히 `true`/`1`만 활성 | 아니오, 서버 전용 | 통합 검증 후 true로 설정하고 재배포. 중단은 false로 바꾸고 재배포 |

기존 `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, Slack 봇·채널 설정을 유지한다. 실제 `.env`는 수정하지 않았다. 신규 npm 의존성은 없다.

config는 설정이 false여도 실제 점주 인증 후 `{enabled:false}`를 반환한다. 업무 경로는 인증 후 503 `owner_mode_disabled`를 반환한다. 환경변수 변경은 즉시 전파되는 원격 스위치가 아니며 배포 반영 확인이 필요하다.

## 검증

- `npm test`: 390개 통과. 요청별 인증, 동시 계정 격리, 정확한 middleware 경로, 쿠키 단독 거부, JSON/no-store, 초안 금액 제거, 입력 필드 제한, 사진 용도 강제, 신청 저장/알림 실패, 문자열 report ID/회수/타 매장/공개 상태를 포함한다.
- `npx tsc --noEmit --incremental false`: 통과.
- `npm run build`: 통과.
- 테스트 계정의 실제 Django 교환, 사진 PUT, 신청 저장/Slack, 운영 공개 리포트 열기는 아직 검증하지 않았다. 배포·운영 설정 활성화·커밋은 수행하지 않았다.
