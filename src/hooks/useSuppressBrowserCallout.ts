import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * 压住国产浏览器（OPPO/ColorOS 等）长按弹系统菜单的手。
 *
 * 背景：RNW 的 onContextMenu 是合成事件，这些浏览器的长按菜单走原生
 * contextmenu/selectstart，合成层 preventDefault 拦不住，还会抢走按压/
 * 长按事件（按住说话被打断、自家长按删除菜单被系统菜单盖住）。
 *
 * 用法：
 *   const { ref, contextMenuGuard, suppressStyle } = useSuppressBrowserCallout(dep);
 *   <Pressable ref={ref} style={[..., suppressStyle]} onContextMenu={contextMenuGuard} />
 *
 * 注意：只用在「不需要系统复制」的按压位（语音按钮、侧边栏长按删除项）。
 * 气泡正文要保留系统复制，千万别挂这个。
 */
export function useSuppressBrowserCallout(dep: unknown = null) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current;
    // RNW ref 拿到的可能是组件实例，统一解出真实 DOM 节点
    const el: HTMLElement | null =
      node instanceof HTMLElement
        ? node
        : ((node?._nativeRef as HTMLElement | undefined) ??
          (node as any)?.getNativeRef?.() ??
          null);
    if (!el || typeof el.addEventListener !== 'function') return;
    const kill = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('contextmenu', kill, { capture: true });
    el.addEventListener('selectstart', kill, { capture: true });
    el.addEventListener('dragstart', kill, { capture: true });
    // iOS Safari 长按还要 touchstart 里 preventDefault，但那会杀掉 click；
    // 这里只防菜单，touch 事件交给 Pressable 本身。
    return () => {
      el.removeEventListener('contextmenu', kill, { capture: true } as any);
      el.removeEventListener('selectstart', kill, { capture: true } as any);
      el.removeEventListener('dragstart', kill, { capture: true } as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);

  // RN 合成层也拦一道（部分 Chromium 内核这层就够了）
  const contextMenuGuard = useCallback((e: any) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
  }, []);

  return { ref, contextMenuGuard, suppressStyle: SUPPRESS_CALLOUT_STYLE };
}

/**
 * 长按三件套样式（仅 web）：禁文本选中 / 禁系统 callout 菜单 / 禁触摸滚动抢事件。
 * 气泡正文千万别用 —— 那里要保留系统复制。
 */
export const SUPPRESS_CALLOUT_STYLE = Platform.select({
  web: {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    touchAction: 'none',
  } as any,
  default: {},
});
