import { Image } from 'react-native';

// The Persistence brand mark (assets/images/logo.png, 203×240).
export function Wordmark({ height = 44 }: { height?: number }) {
  return (
    <Image
      source={require('@/assets/images/logo.png')}
      style={{ height, width: height * (203 / 240), resizeMode: 'contain' }}
    />
  );
}
