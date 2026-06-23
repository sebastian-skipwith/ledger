import { Platform } from 'react-native';

// Brand palette — the dark aesthetic from the web dashboard/HUD.
// Mirrors the CSS custom properties in frontend/app/globals.css (dark theme).
export const theme = {
  ink: '#0a0a0f', // app background
  card: 'rgba(255,255,255,0.04)', // tile / surface fill over ink
  cardSolid: '#14141c', // opaque surface (modals, sheets)
  border: 'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.07)',

  text: '#f0f0f8', // primary text (a.k.a. --white)
  subtle: '#aaaac0',
  muted: '#8a8aa8',

  accent: '#ffffff', // primary button bg (white-on-dark)
  accentFg: '#0a0a0f', // primary button text

  // Real semantic colors for gains/losses (web brand is monochrome, finance is not)
  green: '#16a34a',
  red: '#dc2626',
  amber: '#d4a017',

  fg: '255,255,255', // base rgb for rgba() borders/fills
} as const;

// Font families. The brand uses a serif for display, a mono for numbers.
// System fonts for now; brand fonts (Syne / serif) can be loaded via expo-font later.
export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20 } as const;
