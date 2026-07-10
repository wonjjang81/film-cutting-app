# GitHub 저장소 코드 분석 보고서: film-cutting-app

## 1. 프로젝트 개요

이 프로젝트는 `film-cutting-app`이라는 이름의 모바일 애플리케이션으로, `Expo` 프레임워크를 사용하여 개발되었습니다. 주요 기능은 비디오 편집, 특히 비디오 자르기(cutting)와 관련된 것으로 보입니다. 다양한 미디어 처리 및 UI 관련 라이브러리를 포함하고 있어, 복잡한 비디오 처리 기능을 제공할 것으로 예상됩니다.

## 2. 기술 스택

### 2.1. 핵심 프레임워크 및 라이브러리

*   **Expo**: 모바일 앱 개발을 위한 프레임워크로, `React Native` 기반 위에 빌드되어 빠른 개발 및 배포를 지원합니다.
*   **React Native**: 크로스 플랫폼 모바일 앱 개발을 위한 자바스크립트 프레임워크입니다.
*   **React**: UI 개발을 위한 자바스크립트 라이브러리입니다.
*   **TypeScript**: 자바스크립트의 상위 집합으로, 타입 안정성을 제공하여 대규모 애플리케이션 개발에 용이합니다.

### 2.2. 주요 기능 관련 라이브러리

이 애플리케이션은 비디오 처리 및 미디어 관리를 위해 다음과 같은 핵심 라이브러리들을 활용합니다.

*   **`expo-av`**: 오디오 및 비디오 재생을 위한 Expo 모듈입니다.
*   **`expo-media-library`**: 기기의 미디어 라이브러리에 접근하고 관리하는 기능을 제공합니다.
*   **`expo-camera`**: 카메라 기능에 접근하여 사진 및 비디오를 촬영할 수 있도록 합니다.
*   **`expo-image-picker`**: 기기의 갤러리에서 이미지나 비디오를 선택할 수 있도록 합니다.
*   **`expo-video`**: 비디오 재생 및 처리를 위한 추가적인 기능을 제공합니다.
*   **`expo-file-system`**: 파일 시스템에 접근하여 파일을 읽고 쓰는 기능을 제공합니다.
*   **`expo-sharing`**: 파일 공유 기능을 제공합니다.
*   **`expo-image-manipulator`**: 이미지 조작(자르기, 회전 등) 기능을 제공합니다.
*   **`expo-video-thumbnails`**: 비디오 썸네일을 생성하는 기능을 제공합니다.
*   **`react-native-ffmpeg`**: 강력한 비디오 및 오디오 처리 라이브러리인 FFmpeg를 React Native에서 사용할 수 있도록 하는 모듈입니다. 비디오 자르기, 병합, 변환 등 복잡한 비디오 편집의 핵심 역할을 할 것으로 예상됩니다.
*   **`react-native-vision-camera`**: 고급 카메라 기능을 제공하는 라이브러리로, 실시간 비디오 처리나 커스텀 카메라 UI 구현에 사용될 수 있습니다.
*   **`react-native-image-crop-picker`**: 이미지 및 비디오를 선택하고 자르는 기능을 제공합니다.
*   **`react-native-image-resizer`**: 이미지 크기를 조절하는 기능을 제공합니다.

### 2.3. UI 및 내비게이션

*   **`@react-navigation/native`**, **`@react-navigation/native-stack`**: 앱 내 화면 간 이동 및 내비게이션을 관리합니다.
*   **`react-native-safe-area-context`**, **`react-native-screens`**: iOS 및 Android 기기의 안전 영역을 고려한 UI 렌더링 및 화면 관리를 돕습니다.
*   **`react-native-gesture-handler`**, **`react-native-reanimated`**: 복잡한 제스처 처리 및 애니메이션 구현을 위한 라이브러리입니다.
*   **`react-native-svg`**: SVG 이미지를 React Native 앱에서 사용할 수 있도록 합니다.

## 3. `app.config.ts` 분석

`app.config.ts` 파일은 Expo 애플리케이션의 설정 파일입니다. 이 파일을 통해 앱의 이름, 버전, 아이콘, 스플래시 화면, 권한 설정 등을 정의합니다.

*   **`name`**: `film-cutting-app`
*   **`slug`**: `film-cutting-app`
*   **`version`**: `1.0.0`
*   **`orientation`**: `portrait` (세로 모드 고정)
*   **`icon`**: `./assets/icon.png`
*   **`userInterfaceStyle`**: `light` (라이트 모드 고정)
*   **`splash`**: 스플래시 화면 설정 (`./assets/splash.png` 이미지 사용, 배경색 `#ffffff`)
*   **`assetBundlePatterns`**: `**/*` (모든 에셋 번들링)
*   **`ios`**: iOS 관련 설정
    *   `supportsTablet`: `true` (iPad 지원)
    *   `bundleIdentifier`: `com.wonjjang81.filmcuttingapp`
*   **`android`**: Android 관련 설정
    *   `adaptiveIcon`:
        *   `foregroundImage`: `./assets/adaptive-icon.png`
        *   `backgroundColor`: `#ffffff`
    *   `package`: `com.wonjjang81.filmcuttingapp`
*   **`web`**: 웹 관련 설정
    *   `favicon`: `./assets/favicon.png`
*   **`plugins`**: 사용된 Expo 플러그인 목록
    *   `expo-router` (파일 기반 라우팅)
    *   `expo-image-picker` (갤러리 접근)
    * `expo-camera` (카메라 접근)
    * `expo-media-library` (미디어 라이브러리 접근)
    * `expo-av` (오디오/비디오 재생)
    * `expo-video` (비디오 재생)
    * `expo-file-system` (파일 시스템 접근)
    * `expo-sharing` (파일 공유)
    * `expo-asset` (에셋 관리)
    * `expo-image-manipulator` (이미지 조작)
    * `expo-gl` (OpenGL ES)
    * `expo-permissions` (권한 관리)
    * `expo-video-thumbnails` (비디오 썸네일)

이 설정 파일을 통해 앱이 다양한 미디어 관련 권한을 요청하고 있으며, iOS 및 Android 플랫폼 모두를 지원함을 알 수 있습니다. 특히 `expo-router` 플러그인을 사용하여 파일 시스템 기반 라우팅을 구현했음을 확인할 수 있습니다.

## 4. 코드 구조 (예상)

`expo-router`를 사용하고 있으므로, 앱의 주요 화면 및 로직은 `app/` 디렉토리 내에 파일 기반으로 구성되어 있을 것으로 예상됩니다. `components/` 디렉토리에는 재사용 가능한 UI 컴포넌트들이, `hooks/` 또는 `utils/` 디렉토리에는 공통 로직이나 유틸리티 함수들이 포함될 수 있습니다.

## 5. 결론 및 다음 단계

`film-cutting-app`은 `Expo`와 `React Native`를 기반으로 하는 비디오 편집 애플리케이션으로, `react-native-ffmpeg`과 같은 강력한 라이브러리를 통해 비디오 자르기 및 기타 편집 기능을 구현할 것으로 보입니다. 다음 개발 단계에서는 이 분석 보고서를 바탕으로 구체적인 기능 구현 또는 개선 작업을 진행할 수 있습니다. 추가적인 코드 분석이 필요하거나 특정 기능 개발을 원하시면 말씀해주세요.
