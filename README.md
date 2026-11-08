# 필름 재단 계산기 (film-cutting-app)

인테리어 필름 시공용 재단·배치 계획 앱입니다. 자투리를 먼저 쓰고 부족한 수량만 새 연속 롤에서 계산하며, 모눈 도면, 배치 계획, 견적, 팀 관리 화면을 제공합니다.

- 운영: https://film-cutting-app.pages.dev (Cloudflare Pages + Pages Functions + D1, Google 로그인)
- 로컬 모드: API 주소가 설정되지 않은 빌드(예: GitHub Pages)는 서버 인증 없이 기기 저장소만 사용합니다.

## 구성

| 경로 | 내용 |
|---|---|
| `app/` | Expo Router 화면. `(tabs)`: 프로젝트·재단 계산(input)·모눈 제작(diagrams)·배치 계획(planning)·견적·관리·사용 안내·설정, `(auth)/login` |
| `src/features/` | 재단 계산, 라이브러리 저장소, 인증 세션, 건설매니저 연동 등 기능 로직 |
| `src/ui/icons.ts` | 사용하는 lucide 아이콘만 개별 경로로 가져오는 모음 (패키지 루트에서 가져오면 아이콘 전체가 번들에 포함됨) |
| `functions/api/` | Pages Functions: `auth/*`(Google OAuth), `library`, `admin/members`, `integrations/construction-manager`, `health` |
| `cloudflare/` | D1 스키마·마이그레이션, `wrangler.toml` 예시 |
| `docs/` | 기능별 설계·검증 기록 |
| `scripts/` | PWA 빌드 후처리, Cloudflare 사전 점검, 브라우저 검증 스크립트 |

## 개발

```bash
pnpm install
pnpm dev                 # Expo 웹 개발 서버
pnpm check && pnpm test  # 타입 체크, 단위 테스트
pnpm build:web           # dist/ 정적 빌드 + PWA 후처리
```

Cloudflare 빌드에는 `CF_PAGES=1`, `EXPO_PUBLIC_WEB_BASE_URL=/`, `EXPO_PUBLIC_CLOUDFLARE_API_URL`을 사용합니다(`.github/workflows/cloudflare-pages.yml` 참고). `*.pages.dev`에서 실행되면 API 주소가 없어도 같은 출처의 API를 사용합니다.
