import { Stack } from 'expo-router';
import Head from 'expo-router/head';

export default function RootLayout() {
  return (
    <>
      <Head>
        <title>필름 재단 계산기</title>
      </Head>
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
