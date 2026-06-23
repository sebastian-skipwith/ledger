import { GoogleSignin } from '@react-native-google-signin/google-signin';

// The WEB OAuth client ID is REQUIRED for GoogleSignin to return a non-null
// idToken (counter-intuitive, but that's the native SDK contract). Create three
// OAuth clients in Google Cloud (Web, Android, iOS); the Android client must
// carry the SHA-1 of the EAS signing keystore.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

export const googleConfigured = WEB_CLIENT_ID.length > 0;

let configured = false;
function configure() {
  if (configured || !googleConfigured) return;
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}),
    offlineAccess: false,
  });
  configured = true;
}

// Returns a Google ID token (JWT) to POST to /api/auth/google.
export async function googleSignIn(): Promise<string> {
  if (!googleConfigured) {
    throw new Error('Google Sign-In is not configured yet.');
  }
  configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res: any = await GoogleSignin.signIn();
  // v13+ returns { type, data: { idToken, ... } }; older returns { idToken }.
  const idToken = res?.data?.idToken ?? res?.idToken;
  if (!idToken) throw new Error('No Google ID token returned.');
  return idToken as string;
}
