import { useState, useRef, useEffect } from 'react';
import { Platform, Keyboard, Animated } from 'react-native';

export function useKeyboardAnimation() {
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [isKeyboardUp, setIsKeyboardUp] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardUp(true);
      Animated.timing(keyboardHeightAnim, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });

    const subHide = Keyboard.addListener(hideEvent, (e) => {
      setIsKeyboardUp(false);
      Animated.timing(keyboardHeightAnim, {
        toValue: 0,
        duration: e.duration || 200,
        useNativeDriver: false,
      }).start();
    });

    // ⚠️ H5 兼容：移动端浏览器弹软键盘不走 RN Keyboard 事件（尤其 OPPO/微信内置
    // 浏览器），isKeyboardUp 永远 false → 底部提示藏不住。
    // 用 visualViewport 高度变化兜底：键盘弹起会把可视视口压小。
    let cleanupViewport: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const vv = (window as any).visualViewport as VisualViewport | undefined;
      if (vv && typeof vv.addEventListener === 'function') {
        const baseHeightRef = { current: vv.height };
        const onResize = () => {
          // 视口被压小超过 150px 认为是键盘弹起（过滤旋转/地址栏伸缩的抖动）
          const shrunk = baseHeightRef.current - vv.height;
          if (shrunk > 150) {
            setIsKeyboardUp((prev) => (prev ? prev : true));
          } else if (shrunk < 80) {
            // 键盘收起后视口恢复：同步回落，并更新基准（横竖屏切换也自适应）
            baseHeightRef.current = vv.height;
            setIsKeyboardUp((prev) => (prev ? false : prev));
          }
        };
        vv.addEventListener('resize', onResize);
        cleanupViewport = () => vv.removeEventListener('resize', onResize);
      } else {
        // 极旧内核无 visualViewport：退化到输入框 focus/blur 全局监听
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
        cleanupViewport = () => {
          window.removeEventListener('focusin', onFocusIn);
          window.removeEventListener('focusout', onFocusOut);
        };
      }
    }

    return () => {
      subShow.remove();
      subHide.remove();
      cleanupViewport?.();
    };
  }, [keyboardHeightAnim]);

  return { keyboardHeightAnim, isKeyboardUp };
}
