# 필름 재단 계산기 코드 분석 및 고도화 보고서

- 분석일: 2026-08-15 (KST)
- 분석 대상: [배포 사이트](https://wonjjang81.github.io/film-cutting-app/), [GitHub 저장소](https://github.com/wonjjang81/film-cutting-app)
- 기준 리비전: [`df581897f7f820d2c297242a2bb6be5552a2df64`](https://github.com/wonjjang81/film-cutting-app/tree/df581897f7f820d2c297242a2bb6be5552a2df64)
- 분석 방법: 기준 리비전 전체 트리 정적 분석, Git 이력·객체 크기 확인, 배포 URL HTTP/HTML 실측, Expo·GitHub·W3C·React Native 공식 문서 대조

## 1. 요약

현재 저장소는 **제품 소스의 완전한 기준점(single source of truth)이 아니며, 인증·비밀정보 관리 구조 때문에 공개 운영에 부적합한 상태**다. 화면 코드 두 개에서 의도한 기능은 로그인, 게스트 코드 발급·공유, GitHub 정적 JSON을 이용한 승인 코드 동기화로 파악된다. 그러나 저장소만으로는 빌드할 수 없고 핵심 계산 화면도 존재하지 않는다.

가장 먼저 해야 할 일은 기능 추가가 아니라 다음 네 가지다.

1. 노출된 GitHub 토큰을 즉시 폐기하고 Git 이력에서 제거한다.
2. 인증과 게스트 코드 검증·발급을 신뢰 가능한 서버로 이동한다.
3. 실제 배포에 사용된 완전한 소스를 복원하고 재현 가능한 CI/CD를 만든다.
4. 그 다음에 계산 도메인 모델, 테스트, 접근성, 오프라인 UX를 고도화한다.

### 종합 진단

| 영역 | 상태 | 핵심 판단 |
|---|---:|---|
| 기능 완성도 | 심각 | 핵심 `input` 화면과 계산 로직이 기준 리비전에 없음 |
| 보안 | 심각 | 인증 우회, 하드코딩 자격증명, 공개 게스트 코드, 클라이언트 토큰 |
| 빌드 재현성 | 심각 | 필수 파일 누락, `node_modules` 추적, CI 없음 |
| 아키텍처 | 미흡 | UI·인증·GitHub 저장소 접근이 화면 컴포넌트에 결합 |
| UX | 미흡 | 실패 복구·만료 상태·폼 의미·관리 흐름이 불완전 |
| 접근성 | 미흡 | 접근성 이름·역할·상태와 입력 의미가 명시되지 않음 |
| 성능/운영 | 미흡 | 매 로그인 캐시 우회, 전체 JSON 갱신, 관측성과 배포 게이트 없음 |

## 2. 현재 구현과 범위

### 확인된 기능

- 회원 로그인 UI와 게스트 코드 로그인 UI
- 관리자/일반 사용자/게스트 역할 문자열의 로컬 저장
- 관리자의 임시 코드 생성, 복사, 공유
- GitHub Contents API로 `guest_codes.json` 읽기·갱신
- Expo Router 기반 정적 웹 출력 및 GitHub Pages 하위 경로 설정 의도

### 저장소에서 확인되지 않은 기능

- 앱 진입점인 `app/_layout.tsx`
- 로그인 코드가 가져오는 `app/contexts/AuthContext.tsx`
- 로그인 후 이동하는 `app/(tabs)/input.tsx`
- 앱 설정이 참조하는 `assets/images/*`
- `dev`/`build` 스크립트가 참조하는 `server/_core/index.ts`
- `qr` 스크립트가 참조하는 `scripts/generate_qr.mjs`
- 필름 재단 계산식, 입력 검증, 결과 화면, 도메인 테스트

따라서 프로젝트 이름과 배포 화면만으로 “필름 재단 계산”의 정확성이나 계산 UX를 검증할 수 없다. 저장소의 기존 `analysis_report.md`는 실제 의존성에 없는 `expo-av`, `expo-camera`, `react-native-ffmpeg` 등을 사용한다고 서술하므로 현재 코드의 근거 문서로 신뢰하기 어렵다.

## 3. 상세 분석

### 3.1 보안과 인증

#### P0 — 즉시 대응: GitHub 토큰 노출 가능성

루트 `.env`가 커밋되어 있고 `EXPO_PUBLIC_GITHUB_TOKEN`이 정의되어 있다. 관리자 화면은 이 값을 브라우저에서 GitHub Contents API의 Bearer 토큰으로 사용한다. Expo 공식 문서는 `EXPO_PUBLIC_` 변수가 번들에 평문으로 포함되므로 비밀정보를 넣지 말라고 명시한다. 또한 `.env`를 `.gitignore`에 추가하도록 권고한다. [Expo 환경변수 가이드](https://docs.expo.dev/guides/environment-variables/), [Expo EAS FAQ](https://docs.expo.dev/eas/environment-variables/faq/)

조치:

1. 해당 토큰을 GitHub에서 즉시 폐기한다. 유효성 확인을 위해 토큰을 사용해서는 안 된다.
2. 새 토큰을 클라이언트에 발급하지 않는다.
3. `.env*`를 무시하고 `.env.example`에는 변수명만 둔다.
4. `git-filter-repo` 또는 BFG로 `.env`와 불필요한 바이너리를 모든 이력에서 제거한 뒤 강제 푸시와 협업자 재클론 절차를 수행한다.
5. 저장소 쓰기는 서버 함수에서만 수행하고 최소 권한·짧은 수명의 자격증명을 적용한다.

GitHub도 노출된 비밀은 먼저 폐기·교체한 뒤 이력에서 제거하도록 안내한다. [GitHub 민감정보 제거 가이드](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

#### P0 — 인증이 인증 역할을 하지 못함

`handleLogin`은 이메일과 비밀번호가 비어 있지 않으면, 관리자 문자열 조합이 아닌 경우에도 곧바로 `USER`로 인증한다. 관리자 자격증명도 소스에 하드코딩되어 있다. 게스트 인증은 공개된 정적 JSON 배열을 내려받아 브라우저에서 검사하며, 공개된 마스터 코드는 네트워크 오류 때도 통과한다. 이 방식에서는 사용자가 번들·네트워크·AsyncStorage 값을 수정해 어떤 역할이든 가장할 수 있다.

조치:

- 서버가 비밀번호 해시 검증과 세션 발급을 담당한다.
- 서버가 권한을 판정하고, 모든 관리자 API에서 역할을 다시 검사한다.
- 웹은 `HttpOnly`, `Secure`, `SameSite` 쿠키 기반 세션을 우선 검토한다.
- 게스트 코드는 원문 대신 해시를 저장하고, `expiresAt`, `maxUses`, `usedCount`, `revokedAt`, `createdBy`를 서버에서 원자적으로 검증한다.
- 로그인 시도 제한, 감사 로그, 세션 만료·로그아웃·권한 변경 반영을 추가한다.

#### P0 — 승인 코드가 공개 데이터

[`guest_codes.json`](https://github.com/wonjjang81/film-cutting-app/blob/df581897f7f820d2c297242a2bb6be5552a2df64/guest_codes.json)은 승인 코드 원문 배열이다. GitHub Pages와 공개 저장소에서 누구나 읽을 수 있으므로 접근 통제 수단이 아니다. 관리 화면의 `expiryHours`도 표시용 문자열일 뿐 JSON에 저장되거나 로그인 때 검사되지 않아 실제 만료가 없다.

#### P1 — 코드 생성과 동시성

게스트 코드는 `Math.random()`으로 생성되어 보안 토큰에 적합하지 않다. 또한 파일의 SHA를 읽고 전체 배열을 다시 쓰는 방식은 관리자가 동시에 발급하면 한 요청이 `409 Conflict`로 실패할 수 있다. GitHub Contents API의 파일 갱신은 현재 blob의 `sha`와 Contents 쓰기 권한을 요구한다. [GitHub Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)

서버에서 암호학적 난수를 사용하고 DB의 고유 제약·트랜잭션으로 발급해야 한다. 동기화 실패 시 현재 UI는 로컬 목록에 코드를 남기므로 “발급됨”과 “서버 승인됨” 상태도 분리해야 한다.

### 3.2 저장소와 빌드 재현성

- 공개 트리의 75,279개 파일 중 75,263개가 `node_modules` 아래에 있다. 저장소 HEAD에는 77,177개의 packed object와 약 151.42 MiB의 pack이 있으며, 추적된 `node_modules` blob의 합계는 약 584 MB다.
- `.gitignore`는 사실상 `expo-env.d.ts`만 무시한다. `.env`, `.expo`, `node_modules`, 로그, 빌드 산출물 규칙이 없다.
- `package.json`의 `dev`, `build`, `qr` 스크립트가 존재하지 않는 파일을 참조한다.
- 화면 파일은 존재하지 않는 컨텍스트와 라우트로 import/이동한다.
- `app.config.ts`는 존재하지 않는 아이콘·favicon 파일을 참조한다.
- 테스트 파일, ESLint/Prettier 프로젝트 설정, GitHub Actions, README, 라이선스가 없다.
- `tsconfig.json`의 프로젝트별 엄격도·경로 규칙이 비어 있다.

이 상태에서는 새 개발자가 “clone → install → check → test → build”를 재현할 수 없다. 우선 실제 배포 소스를 복원하고 다음 CI 게이트를 만든다.

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm check
pnpm test --run
pnpm build:web
접근성/핵심 사용자 여정 E2E
GitHub Pages 배포
```

GitHub는 별도 빌드가 필요한 정적 사이트에 GitHub Actions 배포를 권장하며, 빌드 결과를 Pages artifact로 업로드해 배포하는 흐름을 제공한다. [GitHub Pages 게시 소스 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

### 3.3 아키텍처

현재 `login.tsx`와 `admin.tsx`가 UI, 상태, 저장소, 인증, 인프라 API 호출, 인코딩, 알림을 모두 담당한다. 다음 경계로 나누는 것이 적절하다.

```text
화면/컴포넌트
  → 유스케이스: signIn, issueGuestCode, revokeGuestCode
    → 도메인: UserRole, GuestCodePolicy, FilmCutCalculation
      → 포트: AuthRepository, GuestCodeRepository
        → 어댑터: 서버 API, 로컬 캐시
```

권장 구조 예:

```text
app/                     # 라우트와 얇은 화면 조합
src/features/auth/       # 폼, 세션 훅, 유스케이스
src/features/guest-code/ # 발급/만료/폐기 정책
src/features/cutting/    # 단위, 재단 계산, 검증, 결과
src/shared/              # 공용 UI, 오류, 로깅
server/                  # 신뢰 경계: 인증·권한·DB 접근
tests/                   # 단위/통합/E2E
```

특히 필름 재단 계산은 UI에서 분리된 순수 함수로 만들고, 단위(mm/cm/m), 롤 폭·길이, 칼날 여유, 회전 허용, 수율, 잔재, 반올림 정책을 명시적인 타입으로 모델링해야 한다.

### 3.4 기능·UX

현재 로그인 폼은 “이메일”이라고 표시하지만 관리자 판정 문자열은 이메일 형식이 아니다. 일반 로그인은 실제 검증 없이 성공해 사용자 기대와 동작이 다르다. 관리자의 “가입 승인” 탭은 선택할 수 있지만 본문이 없다. 만료 시간 입력은 실제 만료와 연결되지 않고, 발급 코드 삭제·폐기·검색·상태 필터도 없다.

권장 사용자 여정:

- 계산: 필름 규격 선택 → 재단 치수/수량 입력 → 실시간 검증 → 배치 미리보기 → 수율·폐기율·필요 원단 결과 → 저장/공유
- 작업 이력: 조건과 결과를 로컬/계정에 저장, 복제·재계산, CSV/PDF 내보내기
- 게스트: 코드 입력 → 서버 검증 → 남은 유효기간과 권한 표시 → 만료 시 재인증
- 관리자: 코드 발급 → 대상·기간·횟수 지정 → 전달 → 사용/만료/폐기 상태 조회 → 감사 이력

오류 메시지는 내부 상태코드나 입력한 승인 코드를 그대로 노출하지 말고 사용자가 할 수 있는 다음 행동을 제시한다. 네트워크 실패, 동기화 충돌, 오프라인, 만료, 권한 없음 상태를 구분한다.

### 3.5 접근성

현재 `TouchableOpacity`, `TextInput`에 명시적인 `accessibilityRole`, `accessibilityLabel`, `accessibilityState`, `textContentType`/`autoComplete`가 없다. 탭 전환과 로딩 상태도 보조기술에 충분히 전달되지 않는다. React Native는 접근 가능한 이름·역할·상태 속성을 제공한다. [React Native Accessibility](https://reactnative.dev/docs/accessibility)

개선 기준:

- 버튼과 탭에 역할, 이름, 선택/비활성 상태를 지정한다.
- 입력 라벨을 시각적 텍스트뿐 아니라 입력과 프로그램적으로 연결한다.
- 로그인 실패·동기화 완료를 스크린리더에 공지한다.
- 최소 터치 영역 44×44pt, 키보드 탐색, 포커스 이동, 200% 글자 확대를 검증한다.
- 색상만으로 선택/오류를 표현하지 않고 대비를 WCAG 2.2 AA 수준으로 검사한다.
- 이모지를 장식으로 쓸 경우 중복 낭독되지 않게 처리한다.

### 3.6 성능과 운영

- 게스트 로그인마다 타임스탬프 쿼리와 `no-cache` 헤더로 전체 JSON을 다시 가져온다. 규모가 커질수록 대역폭과 지연이 선형 증가한다.
- 코드를 발급할 때마다 GitHub 파일 전체를 Base64 디코딩·파싱·재인코딩·커밋한다.
- `generatedCodes.map`은 무제한 렌더링하며 `key={index}`를 사용한다.
- 패키지에는 현재 소스에서 쓰이지 않는 서버·DB·미디어 의존성이 다수 있어 설치·감사·업데이트 비용이 커진다.
- 오류 추적, 사용자 영향 지표, 성능 예산, 릴리스 롤백 절차가 없다.

서버 API는 단일 코드 조회/발급 단위로 설계하고, 목록은 페이지네이션한다. React Native 목록은 `FlatList`와 안정적인 코드 ID를 사용한다. 의존성은 실제 기능 기준으로 제거하고 웹 번들 분석 후 초기 JS 예산을 정한다. 운영 지표는 로그인 성공률, 계산 완료율, 검증 오류율, API p95, 배포 실패율을 최소 세트로 둔다.

### 3.7 배포 사이트와 웹 전달 품질

2026-08-15 실측에서 배포 URL은 HTTP 200, HTML 18,679 bytes로 응답했다. GitHub Pages를 통해 제공되고 HTTPS/HSTS(`max-age=31556952`)가 적용되어 있으며 HTML 캐시는 `max-age=600`, `Last-Modified`는 2026-07-10 12:29:43 GMT였다.

그러나 초기 HTML은 `<html lang="en">`이고 `<title>`이 비어 있으며 한국어 앱 본문이 없다. 초기 화면은 단일 JavaScript 번들(`/film-cutting-app/_expo/static/js/web/entry-6670a79241fec878bfbd71e003507b31.js`)과 CSS에 의존한다. 그 결과 다음 문제가 있다.

- 한국어 페이지인데 문서 언어가 영어로 선언되어 스크린리더 발음 규칙이 잘못 적용될 수 있다.
- 제목이 없어 브라우저 탭, 방문 기록, 검색 결과, 북마크의 식별성이 낮다.
- JavaScript 로드/실행 실패나 저성능 환경에서는 의미 있는 콘텐츠와 오류 안내가 없다.
- 검색·링크 미리보기용 설명, Open Graph, theme color 등 문서 메타데이터가 확인되지 않는다.

`app.config.ts`/웹 템플릿에서 `lang="ko"`, 고유한 제목과 설명을 지정하고, 로딩·오류 폴백을 제공한다. 가능하면 핵심 안내는 정적 HTML에 포함하고, 배포 CI에서 HTML 메타데이터·경로·자산 404를 smoke test한다.

## 4. 고도화 로드맵

### 0단계 — 사고 대응과 기준선 복구 (1~2일)

- 토큰 폐기, GitHub 감사 로그 확인, 이력 정리
- 실제 배포 소스·에셋·라우트 복원
- `node_modules`, `.env`, `.expo`, 로그 제거 및 `.gitignore` 정비
- 현재 배포를 보존할 태그와 롤백 절차 마련

완료 조건: 저장소에 비밀이 없고, 깨끗한 환경에서 정적 웹 빌드가 성공한다.

### 1단계 — 신뢰 경계 재설계 (3~5일)

- 서버 측 인증·세션·역할 검증
- 게스트 코드 DB 스키마와 발급/검증/폐기 API
- 관리자 API 감사 로그와 속도 제한
- 클라이언트의 GitHub 토큰 및 Contents API 직접 호출 제거

완료 조건: 브라우저 변조로 관리자 권한이나 게스트 승인을 얻을 수 없고 만료·폐기가 서버에서 강제된다.

### 2단계 — 계산 도메인과 품질 게이트 (3~7일)

- 계산 규칙을 제품 담당자와 명세화
- 순수 계산 모듈과 경계값·속성 기반 테스트
- 인증/게스트 코드 통합 테스트, 핵심 E2E
- lint/typecheck/test/build를 PR 필수 체크로 설정

완료 조건: 대표 샘플과 경계 조건의 기대값이 자동 검증되고 모든 PR에서 빌드가 재현된다.

### 3단계 — UX·접근성·관측성 (3~5일)

- 계산 입력/결과 흐름, 단위 도움말, 오류 복구, 작업 이력
- WCAG 2.2 AA 및 키보드/스크린리더 테스트
- 구조화 로그, 오류 추적, Web Vitals/사용자 여정 지표
- preview → production 승격과 롤백 자동화

완료 조건: 핵심 계산 여정의 접근성 테스트를 통과하고 운영 장애를 배포 버전과 사용자 영향으로 추적할 수 있다.

## 5. 우선순위 백로그

| 우선순위 | 작업 | 효과 | 난이도 |
|---|---|---:|---:|
| P0 | 노출 토큰 폐기·이력 제거 | 계정/저장소 탈취 위험 제거 | 중 |
| P0 | 서버 인증과 권한 검사 | 인증 우회 제거 | 상 |
| P0 | 완전한 소스 복원 및 빌드 성공 | 개발·배포 기준선 확보 | 중 |
| P0 | 공개 JSON 승인 코드 폐기 | 무단 접근 제거 | 중 |
| P1 | 게스트 코드 만료·폐기·횟수 정책 | 운영 통제 강화 | 중 |
| P1 | 계산 규칙 도메인화와 테스트 | 계산 정확성·변경 안전성 | 중 |
| P1 | GitHub Actions 품질·배포 파이프라인 | 재현성과 장애 예방 | 중 |
| P1 | 접근성 이름·역할·상태 및 키보드 흐름 | 사용 가능 범위 확대 | 중 |
| P2 | 작업 저장·복제·내보내기 | 반복 업무 생산성 | 중 |
| P2 | 목록 페이지네이션·캐시·번들 다이어트 | 성능·운영비 개선 | 중 |
| P2 | 관측성·SLO·롤백 | 장애 대응력 향상 | 중 |

## 6. 권장 수용 기준

- 새 클론에서 문서화된 단일 명령으로 설치·검사·테스트·웹 빌드가 성공한다.
- Git 저장소와 배포 번들에 자격증명·토큰·승인 코드 원문이 없다.
- 비인증 사용자가 로컬 저장값이나 요청을 변조해 관리자 API를 호출할 수 없다.
- 게스트 코드는 만료·폐기·사용 횟수가 서버 시간 기준으로 강제된다.
- 계산기는 명세된 대표값, 0/음수/초과값, 단위 변환, 반올림 경계를 자동 테스트한다.
- 로그인→계산→결과 저장의 키보드 및 스크린리더 E2E가 통과한다.
- `main` 배포에는 리뷰와 CI 성공이 필요하고 이전 정상 버전으로 롤백할 수 있다.

## 7. 분석 한계

이 보고서는 공개 기준 리비전과 배포 URL의 HTTP/초기 HTML을 근거로 작성했다. 연결 가능한 대화형 브라우저가 없어 화면 클릭과 시각 회귀 검증은 수행하지 못했다. 또한 저장소가 실제 배포물의 전체 소스를 포함하지 않으므로 필름 계산식의 정확성, 완성 화면 전체, 실제 프로덕션 번들의 런타임 성능을 확정할 수 없다. 복원된 전체 소스와 제품 계산 명세를 확보한 뒤 Lighthouse/axe, 화면 크기별 수동 검증, 실제 브라우저 네트워크 프로파일, 서버 보안 테스트를 추가해야 한다.

## 8. 근거 링크

- 프로젝트: [저장소](https://github.com/wonjjang81/film-cutting-app), [배포 사이트](https://wonjjang81.github.io/film-cutting-app/)
- 코드: [`login.tsx`](https://github.com/wonjjang81/film-cutting-app/blob/df581897f7f820d2c297242a2bb6be5552a2df64/app/%28auth%29/login.tsx), [`admin.tsx`](https://github.com/wonjjang81/film-cutting-app/blob/df581897f7f820d2c297242a2bb6be5552a2df64/app/%28tabs%29/admin.tsx), [`app.config.ts`](https://github.com/wonjjang81/film-cutting-app/blob/df581897f7f820d2c297242a2bb6be5552a2df64/app.config.ts), [`package.json`](https://github.com/wonjjang81/film-cutting-app/blob/df581897f7f820d2c297242a2bb6be5552a2df64/package.json)
- Expo: [환경변수](https://docs.expo.dev/guides/environment-variables/), [EAS 환경변수](https://docs.expo.dev/eas/environment-variables/), [Router API Routes](https://docs.expo.dev/router/web/api-routes/)
- GitHub: [Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents), [Pages 게시 소스](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- React Native: [Accessibility](https://reactnative.dev/docs/accessibility)
- W3C: [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
