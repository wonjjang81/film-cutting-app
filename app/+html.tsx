import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="description" content="필름 규격과 수량을 입력해 필요한 원단과 재단 수율을 계산합니다." />
        <meta name="theme-color" content="#2563eb" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
