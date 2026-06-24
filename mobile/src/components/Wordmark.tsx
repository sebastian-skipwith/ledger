import { Image } from 'react-native';

// The Persistence brand mark (assets/images/logo.png, 203×240).
// Pass `tintColor` to recolor the (transparent) mark — e.g. black on a light bg.
export function Wordmark({ height = 44, tintColor }: { height?: number; tintColor?: string }) {
  return (
    <Image
      source={require('@/assets/images/logo.png')}
      style={{ height, width: height * (203 / 240), resizeMode: 'contain', tintColor }}
    />
  );
}
