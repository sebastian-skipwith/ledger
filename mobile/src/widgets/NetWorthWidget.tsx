import { FlexWidget, TextWidget } from 'react-native-android-widget';

// NOTE: these are the library's widget primitives (native RemoteViews), NOT
// React Native components — only the documented style props work, text goes via
// the `text` prop, and all values must be pre-formatted strings.
export interface NetWorthWidgetProps {
  netWorth: string;
  safeToSpend: string;
  updatedAt: string;
}

export function NetWorthWidget({ netWorth, safeToSpend, updatedAt }: NetWorthWidgetProps) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#0a0a0f',
        borderRadius: 20,
        padding: 16,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget text="NET WORTH" style={{ fontSize: 11, color: '#8a8aa8', letterSpacing: 1.5, fontWeight: '600' }} />
      <TextWidget text={netWorth} style={{ fontSize: 30, color: '#f0f0f8', fontWeight: 'bold', marginTop: 2 }} />
      <TextWidget text={`Safe to spend  ${safeToSpend}`} style={{ fontSize: 13, color: '#16a34a', marginTop: 8 }} />
      <TextWidget text={updatedAt} style={{ fontSize: 10, color: '#5a5a63', marginTop: 6 }} />
    </FlexWidget>
  );
}
