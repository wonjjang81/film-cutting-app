const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// react-native-css-interop 캐시 디렉토리를 watchFolders에 추가
// CI 환경에서 web.css 캐시 파일 누락으로 인한 SHA-1 오류 방지
const cssInteropCacheDir = path.resolve(
  __dirname,
  "node_modules/react-native-css-interop/.cache"
);
if (!fs.existsSync(cssInteropCacheDir)) {
  fs.mkdirSync(cssInteropCacheDir, { recursive: true });
}
if (!fs.existsSync(path.join(cssInteropCacheDir, "web.css"))) {
  fs.writeFileSync(path.join(cssInteropCacheDir, "web.css"), "");
}

config.watchFolders = [
  ...(config.watchFolders || []),
  cssInteropCacheDir,
];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
