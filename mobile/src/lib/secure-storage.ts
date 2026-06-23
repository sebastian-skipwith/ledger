import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

// Keychain (iOS) / Keystore-backed EncryptedSharedPreferences (Android) storage
// for zustand's persist middleware. We only persist the small auth slice
// ({ user, accessToken, refreshToken }) so we stay well under SecureStore's
// ~2KB-per-value Android limit. Never use AsyncStorage for tokens.
export const secureStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await SecureStore.getItemAsync(name)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name) => {
    await SecureStore.deleteItemAsync(name);
  },
};
