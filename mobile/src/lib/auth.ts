import { apiCall } from './api';
import { useStore } from './store';
import { googleSignIn } from './google';
import type { User } from './types';

interface AuthResponse {
  user: User;
  access: string;
  refresh: string;
}

function applyAuth(data: AuthResponse) {
  useStore.getState().setAuth(data.user, data.access, data.refresh);
}

export async function loginWithEmail(email: string, password: string) {
  const data: AuthResponse = await apiCall('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  applyAuth(data);
}

export async function registerWithEmail(email: string, password: string, fullName: string) {
  const data: AuthResponse = await apiCall('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  applyAuth(data);
}

// Native Google Sign-In → backend verifies the ID token → returns our session JWTs.
export async function loginWithGoogle() {
  const idToken = await googleSignIn();
  const data: AuthResponse = await apiCall('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential: idToken }),
  });
  applyAuth(data);
}
