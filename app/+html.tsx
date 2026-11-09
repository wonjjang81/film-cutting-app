import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  const configured = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim();
  const base = ((configured || (process.env.CF_PAGES === '1' ? '/' : '/film-cutting-app')).replace(/\/$/, '')) + '/';
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="description" content="필름 규격과 수량을 입력해 필요한 원단과 재단 수율을 계산합니다." />
        <meta name="theme-color" content="#6d28d9" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="필름견적" />
        <link rel="manifest" href={`${base}manifest.webmanifest`} />
        {/* 공통 디자인 기준: Pretendard 글꼴·공통 변수, 이 앱의 식별색은 보라 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css" />
        <link rel="stylesheet" href={`${base}interior-tokens.css`} />
        <style dangerouslySetInnerHTML={{ __html: ':root{--interior-app-accent:var(--interior-film)}html,body,#root,#root *{font-family:var(--interior-font-sans)!important}' }} />
        <link rel="apple-touch-icon" href={`${base}icons/apple-touch-icon.png`} />
        <script src={`${base}pwa.js`} defer />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
