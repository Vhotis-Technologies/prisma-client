/**
 * Web stub: always returns light (SSR-safe; no system theme on web bundle).
 */
// NOTE: The default React Native styling doesn't support server rendering.
// Server rendered styles should not change between the first render of the HTML
// and the first render on the client. Typically, web developers will use CSS media queries
// to render different styles on the client and server, these aren't directly supported in React Native
// but can be achieved using a styling library like Nativewind.
/** Fixed light color scheme for web builds. */
export function useColorScheme() {
  return 'light';
}
