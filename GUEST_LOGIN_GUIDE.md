# 접속코드 기반 게스트 로그인 및 관리자 대시보드 구현 가이드

## 📋 개요

이 문서는 `film-cutting-app`에 추가된 **접속코드 기반 게스트 로그인** 및 **관리자 대시보드** 기능에 대한 완전한 가이드입니다.

## 🏗️ 시스템 아키텍처

### 데이터베이스 스키마

프로젝트에는 다음과 같은 테이블들이 포함되어 있습니다:

| 테이블 | 설명 | 주요 필드 |
|--------|------|---------|
| `users` | 사용자 계정 | `id`, `openId`, `name`, `email`, `role` (user/admin), `createdAt`, `updatedAt`, `lastSignedIn` |
| `guest_accounts` | 게스트 계정 | `id`, `guestToken`, `expiresAt`, `createdAt`, `userId` |
| `sessions` | 활성 세션 | `id`, `userId`, `guestAccountId`, `deviceId`, `accessTokenJti`, `refreshTokenJti`, `expiresAt`, `isActive` |
| `access_codes` | 접속코드 | `id`, `code`, `isActive`, `usageLimit`, `usageCount`, `expiresAt`, `createdAt`, `createdBy`, `notes` |

### 인증 흐름

```
사용자
  ↓
[1] 접속코드 입력 (accesscode.tsx)
  ↓
[2] 서버에서 코드 검증 (auth.validateAccessCode)
  ↓
[3] 게스트 로그인 (login.tsx → auth.guestLogin)
  ↓
[4] 토큰 발급 (accessToken, refreshToken)
  ↓
[5] 앱 기능 사용 (input.tsx, cutting.tsx, estimate.tsx)
```

## 🔧 서버 구현

### 1. 라우터 수정 (`server/routers.ts`)

#### 게스트 로그인 관련 프로시저

**`auth.validateAccessCode`** - 접속코드 검증
```typescript
입력: { code: string }
출력: { 
  valid: boolean, 
  message: string, 
  codeId?: number 
}
```

검증 로직:
- 코드 존재 여부 확인
- 활성 상태 확인
- 만료 시간 확인
- 사용 횟수 제한 확인
- 사용 횟수 증가

**`auth.guestLogin`** - 게스트 계정 생성 및 토큰 발급
```typescript
입력: { 
  durationMinutes: number,
  deviceId: string,
  accessCodeId?: number 
}
출력: { 
  accessToken: string,
  refreshToken: string,
  expiresAt: string,
  guestAccountId: number 
}
```

기능:
- 게스트 계정 생성
- JWT 토큰 생성 (accessToken, refreshToken)
- 세션 생성
- 토큰 만료 시간 설정

#### 관리자 라우터 (`admin.*`)

**`admin.createAccessCode`** - 새 접속코드 생성 (관리자 전용)
```typescript
입력: {
  code: string,
  usageLimit?: number,
  expiresAt?: string,
  notes?: string
}
출력: {
  success: boolean,
  codeId: number,
  message: string
}
```

**`admin.listAccessCodes`** - 모든 접속코드 조회 (관리자 전용)
```typescript
출력: AccessCode[]
```

**`admin.updateAccessCode`** - 접속코드 수정 (관리자 전용)
```typescript
입력: {
  codeId: number,
  isActive?: boolean,
  usageLimit?: number,
  notes?: string
}
출력: {
  success: boolean,
  message: string
}
```

**`admin.deleteAccessCode`** - 접속코드 삭제 (관리자 전용)
```typescript
입력: { codeId: number }
출력: {
  success: boolean,
  message: string
}
```

**`admin.getStatistics`** - 관리 통계 조회 (관리자 전용)
```typescript
출력: {
  totalAccessCodes: number,
  activeAccessCodes: number,
  totalUsage: number,
  activeSessions: number,
  totalUsers: number
}
```

### 2. 인증 컨텍스트 (`app/contexts/AuthContext.tsx`)

클라이언트 측 게스트 인증 상태 관리:

```typescript
interface GuestSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  guestAccountId: number;
  deviceId: string;
}

interface AuthContextType {
  accessCodeValidated: boolean;
  guestSession: GuestSession | null;
  isLoading: boolean;
  error: string | null;
  validateAccessCode: (code: string) => Promise<void>;
  loginAsGuest: (durationMinutes: number) => Promise<void>;
  logout: () => void;
  isGuestExpired: () => boolean;
}
```

**주요 기능:**
- 접속코드 검증
- 게스트 로그인
- 세션 만료 확인
- localStorage를 통한 영속성

## 🎨 클라이언트 구현

### 1. 접속코드 입력 화면 (`app/(tabs)/accesscode.tsx`)

**기능:**
- 접속코드 입력 필드
- 실시간 유효성 검사
- 에러 메시지 표시
- 테마 지원 (라이트/다크 모드)

**사용자 흐름:**
1. 관리자로부터 받은 접속코드 입력
2. "접속코드 검증" 버튼 클릭
3. 검증 성공 시 로그인 화면으로 자동 이동

### 2. 게스트 로그인 화면 (`app/(tabs)/login.tsx`)

**기능:**
- 세션 기간 선택 (1시간, 6시간, 24시간, 7일)
- 선택된 기간 표시
- 주의사항 안내
- 테마 지원

**사용자 흐름:**
1. 원하는 세션 기간 선택
2. "게스트로 시작" 버튼 클릭
3. 로그인 성공 시 입력 화면으로 이동

### 3. 관리자 대시보드 (`app/(tabs)/admin.tsx`)

**기능:**

#### 인증 확인
- OAuth 사용자 인증 확인
- 관리자 역할(`role === "admin"`) 확인
- 미인증/비관리자 사용자 접근 제한

#### 통계 표시
- 전체 접속코드 수
- 활성 코드 수
- 총 사용 횟수
- 활성 세션 수
- 전체 사용자 수

#### 코드 생성
- 랜덤 12자 코드 생성
- 사용 횟수 제한 설정 (선택사항)
- 만료 기간 설정 (일 단위)
- 메모 추가 (관리자용)

#### 코드 관리
- 생성된 모든 코드 목록 표시
- 각 코드의 상태, 사용 현황, 만료일 표시
- 코드 활성/비활성 전환
- 코드 수정 (모달)
- 코드 삭제

## 🚀 사용 방법

### 관리자 (코드 생성)

1. **관리자 대시보드 접근**
   - OAuth 로그인 필요
   - 관리자 역할 필요

2. **새 접속코드 생성**
   - "새 코드 생성" 버튼 클릭
   - 필요시 사용 횟수 제한 입력 (예: 10)
   - 필요시 만료 기간 입력 (예: 7일)
   - 필요시 메모 추가
   - "코드 저장" 버튼 클릭

3. **코드 관리**
   - 생성된 코드 목록에서 코드 선택
   - "수정" 버튼으로 설정 변경
   - "삭제" 버튼으로 코드 제거

### 사용자 (게스트 로그인)

1. **접속코드 입력**
   - accesscode 탭 열기
   - 관리자로부터 받은 코드 입력
   - "접속코드 검증" 버튼 클릭

2. **게스트 로그인**
   - login 탭으로 자동 이동
   - 원하는 세션 기간 선택
   - "게스트로 시작" 버튼 클릭

3. **앱 사용**
   - input 탭에서 조각 치수 입력
   - cutting 탭에서 배치 결과 확인
   - estimate 탭에서 견적 계산
   - 필요시 PDF 내보내기

## 🔐 보안 고려사항

### 1. 토큰 관리
- JWT 토큰 사용 (accessToken, refreshToken)
- 토큰 만료 시간 설정
- 클라이언트에서 localStorage에 저장

### 2. 접속코드 보안
- 고유성 검증 (중복 코드 방지)
- 활성 상태 관리
- 사용 횟수 제한
- 만료 시간 설정

### 3. 관리자 접근 제어
- OAuth 인증 필수
- 관리자 역할 확인
- 비관리자 접근 차단

### 4. 세션 관리
- deviceId를 통한 기기 추적
- 세션 활성 상태 관리
- 만료된 세션 자동 제거

## 📊 데이터 흐름

### 접속코드 검증 흐름
```
클라이언트: validateAccessCode(code)
    ↓
서버: auth.validateAccessCode
    ├─ 코드 존재 여부 확인
    ├─ 활성 상태 확인
    ├─ 만료 시간 확인
    ├─ 사용 횟수 제한 확인
    ├─ usageCount 증가
    └─ 결과 반환
    ↓
클라이언트: localStorage에 accessCodeValidated 저장
```

### 게스트 로그인 흐름
```
클라이언트: loginAsGuest(durationMinutes)
    ↓
서버: auth.guestLogin
    ├─ 게스트 계정 생성
    ├─ JWT 토큰 생성
    ├─ 세션 생성
    └─ 토큰 반환
    ↓
클라이언트: localStorage에 guestSession 저장
    ↓
앱 기능 사용 가능
```

## 🧪 테스트 체크리스트

### 접속코드 검증
- [ ] 유효한 코드 검증 성공
- [ ] 유효하지 않은 코드 거부
- [ ] 비활성 코드 거부
- [ ] 만료된 코드 거부
- [ ] 사용 횟수 초과 코드 거부
- [ ] 사용 횟수 증가 확인

### 게스트 로그인
- [ ] 1시간 기간 로그인
- [ ] 6시간 기간 로그인
- [ ] 24시간 기간 로그인
- [ ] 7일 기간 로그인
- [ ] 토큰 발급 확인
- [ ] 세션 저장 확인

### 관리자 대시보드
- [ ] 비관리자 접근 제한
- [ ] 통계 표시 확인
- [ ] 코드 생성 기능
- [ ] 코드 목록 표시
- [ ] 코드 수정 기능
- [ ] 코드 삭제 기능

### 테마 지원
- [ ] 라이트 모드 UI 확인
- [ ] 다크 모드 UI 확인
- [ ] 색상 대비 확인

## 🔄 마이그레이션 가이드

### 기존 사용자 처리
1. 기존 사용자는 OAuth 로그인 유지
2. 새 사용자는 접속코드 기반 게스트 로그인 사용
3. 게스트 계정은 기간 만료 시 자동 삭제

### 데이터 백업
게스트 사용자에게 다음을 권장합니다:
- 중요한 프로젝트를 JSON으로 내보내기
- 견적서를 PDF로 내보내기
- 기간 만료 전 데이터 저장

## 📝 환경 변수

필요한 환경 변수:
```
JWT_SECRET=your-secret-key
DATABASE_URL=mysql://user:password@host/database
OAUTH_SERVER_URL=https://oauth-server-url
```

## 🐛 문제 해결

### 접속코드 검증 실패
- 코드가 정확한지 확인
- 대문자/소문자 구분 확인
- 코드 만료 여부 확인
- 사용 횟수 제한 확인

### 게스트 로그인 실패
- 네트워크 연결 확인
- 서버 상태 확인
- 토큰 저장 공간 확인

### 관리자 대시보드 접근 불가
- OAuth 로그인 확인
- 관리자 역할 확인
- 데이터베이스 연결 확인

## 📚 참고 자료

- [Drizzle ORM 문서](https://orm.drizzle.team/)
- [tRPC 문서](https://trpc.io/)
- [JWT 토큰](https://jwt.io/)
- [React Native 인증](https://reactnative.dev/)

## 🎯 향후 개선 사항

1. **이메일 알림**
   - 코드 생성 시 이메일 발송
   - 세션 만료 전 알림

2. **고급 분석**
   - 코드별 사용 현황
   - 사용자별 접근 로그
   - 시간대별 사용 통계

3. **보안 강화**
   - 코드 재발급 기능
   - IP 주소 제한
   - 다중 인증 (MFA)

4. **사용자 경험**
   - 코드 QR 생성
   - 일괄 코드 생성
   - 코드 템플릿

---

**작성일**: 2026년 7월 8일  
**버전**: 1.0.0  
**작성자**: Manus AI
