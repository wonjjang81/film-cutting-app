# Cloudflare 배포 준비

이 디렉터리는 Cloudflare Pages Functions + D1 구성을 담습니다.

1. Cloudflare Pages 프로젝트를 GitHub 저장소에 연결하고 빌드 명령을 `pnpm build:web`, 출력 디렉터리를 `dist`로 설정합니다. Pages Functions는 저장소 루트의 `functions` 디렉터리에서 함께 감지됩니다.
2. D1 데이터베이스를 만든 뒤 `schema.sql`을 원격에 적용합니다.
3. `wrangler.toml.example`을 기준으로 Pages 환경 변수와 D1 바인딩을 설정합니다. `ALLOWED_ORIGIN`은 앱이 실제로 제공되는 정확한 Origin으로 지정해야 하며, 서버 저장소 요청은 Cloudflare Access 쿠키를 포함합니다.
4. Cloudflare Access 애플리케이션을 만든 뒤 `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`를 설정합니다.
5. Pages Functions의 `/api/health`, `/api/library`를 배포합니다.

`.github/workflows/cloudflare-pages.yml`은 `main` 푸시 또는 수동 실행 시 `cloudflare/wrangler-action@v3`로 Pages를 배포합니다. GitHub 저장소에 다음 Actions secrets를 등록해야 합니다: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME`.

`/api/library`는 Access의 `Cf-Access-Jwt-Assertion`을 검증한 뒤 JWT subject별로 문서를 분리합니다. `If-Match`와 D1의 `updated_at` 조건을 함께 사용해 다른 기기의 덮어쓰기를 차단합니다.

현재 GitHub Pages는 계속 사용할 수 있습니다. Cloudflare API를 연결할 때는 `EXPO_PUBLIC_CLOUDFLARE_API_URL`을 설정해야 하며, 미설정 시 앱은 기존 AsyncStorage 저장소를 사용합니다.
