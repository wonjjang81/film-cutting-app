# Film Cutting App - 개발 로그

## 2024년 개발 진행 상황

### 주요 수정 사항 (Latest Update)

#### 1. 로그인 탭 미표시 문제 해결
**문제점:**
- 초기 화면에서 로그인 탭이 보이지 않는 현상
- 비로그인 상태에서 다른 탭들이 비활성화되었지만 로그인 탭도 함께 숨겨짐

**원인 분석:**
- `app/(tabs)/_layout.tsx`에서 `initialRouteName="login"`으로 설정되어 있었으나, 탭바 구성에서 로그인 탭의 가시성이 명확하지 않음
- 로딩 상태에서 전체 UI가 숨겨져 로그인 화면에 접근할 수 없는 상황 발생

**해결 방법:**
1. **탭 레이아웃 개선**
   - `initialRouteName`을 로그인 상태에 따라 동적으로 설정
   - 로그인 탭의 `href` 속성을 명확히 설정하여 항상 접근 가능하도록 함
   - 로그인 후 탭바에서 로그인 탭을 숨기도록 설정

2. **탭바 가시성 관리**
   - 로그인 상태에 따라 탭바의 `display` 속성을 제어
   - 비로그인 상태에서는 로그인 탭만 표시되도록 함

3. **네비게이션 경로 수정**
   - `app/(tabs)/index.tsx`의 리다이렉트 경로를 `/(tabs)/login`으로 명확히 설정

#### 2. 로그아웃 기능 추가
**구현 내용:**
- `app/(tabs)/settings.tsx`에 로그아웃 기능 추가
- 게스트 세션과 인증 토큰을 모두 제거하는 로직 구현
- 로그아웃 후 로그인 화면으로 자동 리다이렉트

**코드 변경:**
```typescript
const handleLogout = useCallback(() => {
  const doLogout = async () => {
    guestLogout();
    await authLogout();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace("/(tabs)/login");
  };
  // 플랫폼별 확인 대화상자 표시
}, [guestLogout, authLogout]);
```

---

## 프로젝트 구조 및 기술 스택

### 핵심 기술
- **프레임워크**: Expo SDK 54 + React Native
- **네비게이션**: Expo Router (탭 기반)
- **상태 관리**: React Context + useReducer + AsyncStorage
- **스타일링**: NativeWind (TailwindCSS) + StyleSheet
- **인증**: 게스트 기반 + OAuth 지원
- **데이터 저장**: AsyncStorage (로컬)

### 주요 파일 구조
```
app/
├── (tabs)/
│   ├── _layout.tsx          # 탭 네비게이션 레이아웃
│   ├── index.tsx            # 홈 화면
│   ├── login.tsx            # 로그인 화면
│   ├── input.tsx            # 조각 입력 화면
│   ├── cutting.tsx          # 재단 결과 화면
│   ├── estimate.tsx         # 견적 화면
│   ├── settings.tsx         # 설정 화면
│   └── guide.tsx            # 사용 가이드
├── contexts/
│   └── AuthContext.tsx      # 인증 상태 관리
└── oauth/
    └── callback.tsx         # OAuth 콜백

lib/
├── filmContext.tsx          # 필름 상태 관리
├── filmCutting.ts           # 핵심 재단 알고리즘
├── projectExport.ts         # 프로젝트 내보내기/불러오기
├── pdfGenerator.ts          # PDF 생성
└── theme-provider.tsx       # 테마 관리

hooks/
├── use-auth.ts              # 인증 훅
└── use-colors.ts            # 색상 훅
```

---

## 기능 상세 설명

### 1. 인증 시스템 (AuthContext)
- **게스트 로그인**: 접속코드 기반의 임시 세션
- **세션 관리**: 선택 가능한 유효 기간 (1시간 ~ 7일)
- **토큰 관리**: accessToken, refreshToken 저장
- **자동 만료**: 기간 만료 시 자동 데이터 삭제

### 2. 필름 재단 알고리즘 (filmCutting.ts)
- **고정 너비**: 1,220mm 기준
- **최적화 배치**: 4가지 정렬 휴리스틱 적용
- **그룹 관리**: 그룹별 브랜드/필름/가격 설정
- **패턴 고정**: 특정 패턴의 회전 방지 옵션

### 3. 사용자 인터페이스

#### 홈 화면 (index.tsx)
- 현재 프로젝트 요약
- 저장된 프로젝트 목록
- 프로젝트 관리 (저장, 불러오기, 삭제)
- 파일 내보내기/불러오기

#### 입력 화면 (input.tsx)
- 그룹별 조각 입력
- 치수 관리 (가로, 세로, 수량)
- 브랜드 및 필름명 설정
- 그룹 병합 기능

#### 재단 화면 (cutting.tsx)
- SVG 기반 시각화
- 조각 드래그 이동
- 회전 및 수동 조정
- 체크리스트 기능

#### 견적 화면 (estimate.tsx)
- 자재비 및 시공비 설정
- 할인율 적용
- 최종 견적 계산
- PDF/텍스트 공유

#### 설정 화면 (settings.tsx)
- 업체 정보 관리
- APK 다운로드 (Android)
- 사용 가이드
- **로그아웃** (신규 추가)

---

## 향후 개발 계획

### 단기 (1-2주)
- [ ] 로그인 탭 UI/UX 테스트 및 피드백 수집
- [ ] 로그아웃 기능 통합 테스트
- [ ] 에러 핸들링 강화
- [ ] 모바일 반응형 디자인 최적화

### 중기 (1개월)
- [ ] 클라우드 동기화 기능 (백엔드 연동)
- [ ] 사용자 계정 시스템 개선
- [ ] 고급 재단 옵션 추가
- [ ] 다국어 지원 (i18n)

### 장기 (3개월+)
- [ ] 팀 협업 기능
- [ ] 실시간 데이터 동기화
- [ ] 고급 분석 및 리포팅
- [ ] 모바일 앱 스토어 배포

---

## 테스트 현황

### 완료된 테스트
- ✅ 필름 재단 알고리즘 (32개 테스트 통과)
- ✅ 상태 관리 및 영속성
- ✅ 프로젝트 저장/불러오기
- ✅ PDF 생성 및 공유

### 진행 중인 테스트
- 🔄 로그인/로그아웃 플로우
- 🔄 탭 네비게이션 가시성
- 🔄 다양한 기기 해상도 테스트

### 예정된 테스트
- ⏳ 클라우드 동기화
- ⏳ 에러 복구 시나리오
- ⏳ 성능 최적화 검증

---

## 알려진 이슈 및 해결 방법

### 이슈 1: 로그인 탭 미표시 (해결됨)
**상태**: ✅ RESOLVED
**해결 방법**: 탭 레이아웃 개선 및 가시성 관리

### 이슈 2: 로그아웃 기능 부재 (해결됨)
**상태**: ✅ RESOLVED
**해결 방법**: 설정 화면에 로그아웃 버튼 추가

### 이슈 3: 네비게이션 경로 불일치
**상태**: ⚠️ FIXED
**설명**: `/login` vs `/(tabs)/login` 경로 불일치
**해결 방법**: 모든 리다이렉트를 `/(tabs)/login`으로 통일

---

## 커밋 메시지 가이드

```
[타입] 제목

본문 (선택사항)

- 로그인 탭 가시성 개선
- 로그아웃 기능 추가
- 네비게이션 경로 통일
```

**타입:**
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링
- `docs`: 문서 업데이트
- `test`: 테스트 추가/수정

---

## 참고 자료

### 관련 문서
- [분석 보고서](./FilmCuttingApp개발분석보고서.md)
- [설계 가이드](./design.md)
- [TODO 목록](./todo.md)

### 외부 참고
- [Expo Router 문서](https://docs.expo.dev/routing/introduction/)
- [React Native 공식 문서](https://reactnative.dev/)
- [NativeWind 문서](https://www.nativewind.dev/)

---

**마지막 업데이트**: 2024년
**작성자**: Manus AI
**상태**: 진행 중
