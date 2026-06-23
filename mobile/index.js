// Custom entry point (replaces "main": "expo-router/entry").
// The bare side-effect import below runs Expo Router's normal root registration;
// we then register the Android home-screen widget task handler after it.
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  // Android-only: load lazily so a future iOS build never touches the module.
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/widget-task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
