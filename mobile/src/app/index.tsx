import { Redirect } from 'expo-router';
import { useStore } from '@/lib/store';

// Entry route ("/"). Sends signed-in users to the dashboard, others to login.
export default function Index() {
  const token = useStore((s) => s.accessToken);
  return <Redirect href={token ? '/home' : '/login'} />;
}
