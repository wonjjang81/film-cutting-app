import { Redirect, type Href } from 'expo-router';

// A static web build cannot provide a trustworthy authentication boundary.
export default function LoginScreen() {
  return <Redirect href={'/input' as Href} />;
}
