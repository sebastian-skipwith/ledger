import { apiCall } from './api';
import { useStore } from './store';
import { googleSignIn } from './google';
import { identifyUser, track } from './track';
import type { User } from './types';

interface AuthResponse {
  user: User;
  access: string;
  refresh: string;
}

function applyAuth(data: AuthResponse) {
  useStore.getState().setAuth(data.user, data.access, data.refresh);
  identifyUser(data.user.id); // id only — no PII
}

export async function loginWithEmail(email: string, password: string) {
  const data: AuthResponse = await apiCall('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  applyAuth(data);
  track('signed_in', { method: 'email' });
}

export async function registerWithEmail(email: string, password: string, fullName: string) {
  const data: AuthResponse = await apiCall('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  applyAuth(data);
  track('signed_up', { method: 'email' });
}

// Native Google Sign-In → backend verifies the ID token → returns our session JWTs.
export async function loginWithGoogle() {
  const idToken = await googleSignIn();
  const data: AuthResponse = await apiCall('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential: idToken }),
  });
  applyAuth(data);
  track('signed_in', { method: 'google' });
}
