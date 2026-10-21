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

  // 键盘高度（JS state，来自 keyboard-controller 自己的状态 —— 在 pan 模式下也能拿到）。
  // 供聊天列表做「先吃留白、再顶内容」的补偿。
  const keyboardHeightValue = useLibKeyboardState((s) => s.height);

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
    keyboardHeightValue,
  };
}

/** Web fallback: visualViewport height diff detects keyboard show/hide (no follow offset). */
function useWebKeyboardAnimation() {
  const [isKeyboardUp, setIsKeyboardUp] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (vv && typeof vv.addEventListener === 'function') {
      const baseHeightRef = { current: vv.height };
      const onResize = () => {
        // Viewport shrunk by >150px => keyboard shown (filters rotation/url-bar jitter).
        const shrunk = baseHeightRef.current - vv.height;
        if (shrunk > 150) {
          setIsKeyboardUp((prev) => (prev ? prev : true));
        } else if (shrunk < 80) {
          // Keyboard hidden, viewport restored: sync back and refresh baseline.
          baseHeightRef.current = vv.height;
          setIsKeyboardUp((prev) => (prev ? false : prev));
        }
      };
      vv.addEventListener('resize', onResize);
      return () => vv.removeEventListener('resize', onResize);
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
    keyboardHeightValue: 0,
  };
}
