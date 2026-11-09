import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { AuthSessionProvider } from '../src/features/auth/AuthSession';

export default function RootLayout() {
  return (
    <>
      <Head>
        <title>필름견적</title>
      </Head>
      <AuthSessionProvider><Stack screenOptions={{ headerShown: false }} /></AuthSessionProvider>
    </>
  );
}
