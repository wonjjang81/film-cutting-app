import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { AuthSessionProvider } from '../src/features/auth/AuthSession';

export default function RootLayout() {
  return (
    <>
      <Head>
        <title>필름 재단 계산기</title>
      </Head>
      <AuthSessionProvider><Stack screenOptions={{ headerShown: false }} /></AuthSessionProvider>
    </>
  );
}
