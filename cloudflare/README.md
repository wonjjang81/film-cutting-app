# Cloudflare 배포 준비

이 디렉터리는 Cloudflare Pages Functions + D1 구성을 담습니다.

1. Cloudflare Pages 프로젝트를 GitHub 저장소에 연결하고 빌드 명령을 `pnpm build:web`, 출력 디렉터리를 `dist`로 설정합니다. Pages Functions는 저장소 루트의 `functions` 디렉터리에서 함께 감지됩니다.
2. D1 데이터베이스를 만든 뒤 `schema.sql`을 원격에 적용합니다.
3. 기존 Construction Manager Google OAuth 웹 클라이언트에 정확한 승인된 리디렉션 URI `https://film-cutting-app.pages.dev/api/auth/callback`을 추가합니다. 기존 리디렉션 URI는 삭제하지 않습니다.
4. `wrangler.toml.example`을 기준으로 Pages 환경 변수와 D1 바인딩을 설정합니다. `ALLOWED_ORIGIN`과 `AUTH_REDIRECT_URI`는 배포 환경의 정확한 HTTPS 주소를 사용합니다.
5. Pages 환경 변수에 `GOOGLE_OAUTH_CLIENT_ID`, `AUTH_REDIRECT_URI`, `AUTH_OWNER_EMAIL=tubebluemoon@gmail.com`을 설정하고 `GOOGLE_OAUTH_CLIENT_SECRET`은 암호화된 Secret으로만 등록합니다.
6. 마이그레이션과 Pages Functions를 먼저 preview 환경에 배포해 실제 Google 로그인, 로그아웃, 미등록 사용자 거부, 관리자 회원 승인을 검증합니다.
7. 검증 및 백업이 끝난 뒤에만 기존 Cloudflare Access 로그인을 해제합니다. 롤백 중에는 Access 설정을 즉시 복구할 수 있도록 유지합니다.

`.github/workflows/cloudflare-pages.yml`은 `main` 푸시 또는 수동 실행 시 설정 preflight를 통과한 뒤 `cloudflare/wrangler-action@v3`로 Pages를 배포합니다. GitHub 저장소에 다음 Actions secrets를 등록해야 합니다: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME`. 앱의 서버 저장 모드를 활성화하려면 Repository variable `CLOUDFLARE_API_URL`도 등록해야 합니다. 누락 시 배포를 의도적으로 중단합니다.

`/api/library`는 서버 세션과 tenant membership을 확인한 뒤 내부 사용자 ID별로 문서를 분리합니다. Google `sub`는 로그인 시 계정 연결에만 사용하며 클라이언트 응답에는 노출하지 않습니다. `If-Match`와 D1의 `updated_at` 조건을 함께 사용해 다른 기기의 덮어쓰기를 차단합니다.

세션은 서버에 해시만 저장하며 브라우저에는 `Secure`, `HttpOnly`, `SameSite=Lax` 쿠키를 사용합니다. 절대 만료는 7일, 유휴 만료는 24시간입니다. 최초 소유자만 `AUTH_OWNER_EMAIL`과 정확히 일치할 때 생성되고 이후 사용자는 소유자가 먼저 이메일을 등록·승인해야 합니다.

현재 GitHub Pages는 계속 사용할 수 있습니다. Cloudflare API를 연결할 때는 `EXPO_PUBLIC_CLOUDFLARE_API_URL`을 설정해야 하며, 미설정 시 앱은 기존 AsyncStorage 저장소를 사용합니다.
