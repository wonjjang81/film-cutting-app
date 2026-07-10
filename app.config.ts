// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const rawBundleId = "space.manus.film.cutting.app.t20260508072837";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => {
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";

const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  appName: "필름 재단 계산기",
  appSlug: "film-cutting-app",
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663621166093/czacS5zrJGM3kokLMdaXgF/icon-N44ZVk8AaKmssN48Lds56C.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
    // ⚠️ 중요: GitHub Pages 하위 경로 설정을 위해 baseUrl 추가
    baseUrl: "/film-cutting-app"
  },
  plugins: [
    "expo-router",
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
  ],
  router: {
    // GitHub Pages에서 가장 안정적인 해시 기반 라우팅 사용
    origin: "https://wonjjang81.github.io/film-cutting-app/",
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    // experiments 내부에도 baseUrl 유지 (일부 버전 대응)
    baseUrl: "/film-cutting-app",
  },
  extra: {
    eas: {
      projectId: "c0eda26d-a287-42b0-8134-4e48d9ae62bd",
    },
  },
};

export default config;
