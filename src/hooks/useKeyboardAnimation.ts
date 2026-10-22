import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';
// NOTE: aliased to avoid clash with this file's own hook name.
// The lib's useReanimatedKeyboardAnimation drives `height` (already negative)
// frame-by-frame on the UI thread on native; on web it is a NOOP.
import {
  useReanimatedKeyboardAnimation as useLibKeyboardAnimation,
  useKeyboardState as useLibKeyboardState,
} from 'react-native-keyboard-controller';

/**
 * Keyboard-follow animation (react-native-keyboard-controller).
 *
 * - Native (Android/iOS): `height` shared value from KeyboardProvider is driven
 *   frame-by-frame by native keyboard events (UI thread), so
 *   `keyboardHeightStyle.translateY = height` follows the finger.
 *   Requires KeyboardProvider wrapping the root layout (see app/_layout.tsx).
 * - Web: lib implementation is a NOOP (height stays 0) -- fall back to
 *   visualViewport height-diff to detect show/hide (mobile browsers do not
 *   emit RN Keyboard events).
 */
export function useKeyboardAnimation() {
  if (Platform.OS === 'web') {
    return useWebKeyboardAnimation();
  }
  return useNativeKeyboardAnimation();
}

function useNativeKeyboardAnimation() {
  const { height, progress } = useLibKeyboardAnimation();
  // isKeyboardUp only toggles JS-driven UI (welcome text); JS-thread update is fine.
  const isKeyboardUp = useLibKeyboardState((s) => s.isVisible);

  const keyboardHeightStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: height.value }],
  }));

  // UI-thread keyboard signals: pass through so footer collapse can react
  // inside worklets without a JS round-trip.
  return {
    keyboardHeightStyle,
    isKeyboardUp,
    keyboardHeight: height,
    keyboardProgress: progress,
    webViewportStyle: null,
  };
}

/** Web fallback: visualViewport height diff detects keyboard show/hide and fits the app to the visible area. */
function useWebKeyboardAnimation() {
  const [isKeyboardUp, setIsKeyboardUp] = useState(false);
  const [webViewportStyle, setWebViewportStyle] = useState<{
    top: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      const content = viewportMeta.getAttribute('content') ?? '';
      if (!content.includes('interactive-widget')) {
        viewportMeta.setAttribute(
          'content',
          `${content}, interactive-widget=resizes-content`
        );
      }
    }
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (vv && typeof vv.addEventListener === 'function') {
      const baseHeightRef = { current: vv.height };
      let frame = 0;

      const syncViewport = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const shrunk = baseHeightRef.current - vv.height;
          if (shrunk > 150) {
            setIsKeyboardUp((prev) => (prev ? prev : true));
            setWebViewportStyle((prev) =>
              prev &&
              prev.top === vv.offsetTop &&
              prev.height === vv.height
                ? prev
                : { top: vv.offsetTop, height: vv.height }
            );
          } else if (shrunk < 80) {
            baseHeightRef.current = vv.height;
            setIsKeyboardUp((prev) => (prev ? false : prev));
            setWebViewportStyle((prev) => (prev === null ? prev : null));
          }
        });
      };

      vv.addEventListener('resize', syncViewport);
      vv.addEventListener('scroll', syncViewport);
      return () => {
        vv.removeEventListener('resize', syncViewport);
        vv.removeEventListener('scroll', syncViewport);
        if (frame) cancelAnimationFrame(frame);
      };
    }
    // Legacy engines without visualViewport: fall back to global focus/blur on inputs.
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'TEXTAREA' ||
          t.tagName === 'INPUT' ||
          (t as any).isContentEditable)
      ) {
        setIsKeyboardUp(true);
      }
    };
    const onFocusOut = () => setIsKeyboardUp(false);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // No follow offset on web: return empty style to keep caller signature consistent.
  // keyboardHeight/Progress are null on web (lib is NOOP there); footer falls
  // back to the JS isKeyboardUp flag.
  const keyboardHeightStyle = useAnimatedStyle(() => ({}));
  return {
    keyboardHeightStyle,
    isKeyboardUp,
    keyboardHeight: null,
    keyboardProgress: null,
    webViewportStyle,
  };
}
