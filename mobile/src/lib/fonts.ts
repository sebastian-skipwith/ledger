import { Inter_500Medium } from '@expo-google-fonts/inter';

// Skia (victory-native) renders axis/label text through a real font file —
// without one, chart labels don't appear. This module is passed to useFont().
export const chartFontSource = Inter_500Medium;
