import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { formatWidgetView, readWidgetData } from '@/lib/widget-data';
import { NetWorthWidget } from './NetWorthWidget';

const nameToWidget = {
  NetWorth: NetWorthWidget,
};

// Headless JS task invoked by the Android widget system. Cached-read only:
// no network here. Keep it synchronous-ish (one awaited read, then render) —
// setTimeout/long timers do NOT work in this headless context.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const Widget = nameToWidget[props.widgetInfo.widgetName as keyof typeof nameToWidget];
  if (!Widget) return;

  const view = formatWidgetView(await readWidgetData());

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK':
      props.renderWidget(<Widget {...view} />);
      break;
    case 'WIDGET_DELETED':
    default:
      break;
  }
}
