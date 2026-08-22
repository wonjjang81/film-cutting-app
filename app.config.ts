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
const configuredWebBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim();
const webBaseUrl = configuredWebBaseUrl || (process.env.CF_PAGES === "1" ? "/" : "/film-cutting-app");

const env = {
  appName: "필름 재단 계산기",
  appSlug: "film-cutting-app",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
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
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
  },
  web: {
    bundler: "metro",
    output: "static",
    // GitHub Pages uses a project subpath; Cloudflare Pages serves at the root.
    baseUrl: webBaseUrl
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
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    // Keep the base path in experiments for Expo versions that read it there.
    baseUrl: webBaseUrl,
  },
  extra: {
    eas: {
      projectId: "c0eda26d-a287-42b0-8134-4e48d9ae62bd",
    },
  },
};

export default config;
