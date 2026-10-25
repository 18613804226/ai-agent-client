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
export function useSuppressBrowserCallout(
  dep: unknown = null,
  opts?: { blockTouch?: boolean },
) {
  const ref = useRef<any>(null);
  const blockTouch = opts?.blockTouch === true;

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
    // 📱 输入层压制（可选）：touchstart 直接 preventDefault，浏览器收不到这次
    // 触摸序列，长按识别/选中/系统菜单在手势源头就被掐掉 —— OPPO/ColorOS 等
    // 国产浏览器不认 contextmenu 拦截，这是唯一有效的一层。
    // 不影响 RNW 按压/长按：responder 走合成事件，preventDefault 不阻断传播。
    let killTouch: ((e: Event) => void) | undefined;
    let restoreClick: ((e: Event) => void) | undefined;
    let touchDownAt = 0;
    if (blockTouch) {
      // 掐掉长按菜单：preventDefault on touchstart。
      // ⚠️ 代价：浏览器不再派发兼容鼠标事件和 click —— 而 RNW 的 Pressable
      //    在部分浏览器上依赖 click，于是「点不动」。所以短按时手动补一个 click 回去；
      //    长按（>350ms）不补，那时本来就该是长按菜单。
      killTouch = (e: Event) => {
        touchDownAt = Date.now();
        e.preventDefault();
      };
      restoreClick = (e: Event) => {
        if (Date.now() - touchDownAt >= 350) return;
        const target = e.target as HTMLElement | null;
        if (target && typeof target.dispatchEvent === 'function') {
          target.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
        }
      };
      el.addEventListener('touchstart', killTouch, {
        capture: true,
        passive: false,
      } as any);
      el.addEventListener('touchend', restoreClick, {
        capture: true,
        passive: false,
      } as any);
    }
    // iOS Safari 长按还要 touchstart 里 preventDefault，但那会杀掉 click；
    // 这里只防菜单，touch 事件交给 Pressable 本身。
    return () => {
      el.removeEventListener('contextmenu', kill, { capture: true } as any);
      el.removeEventListener('selectstart', kill, { capture: true } as any);
      el.removeEventListener('dragstart', kill, { capture: true } as any);
      if (killTouch) {
        el.removeEventListener('touchstart', killTouch, {
          capture: true,
        } as any);
      }
      if (restoreClick) {
        el.removeEventListener('touchend', restoreClick, {
          capture: true,
        } as any);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep, blockTouch]);

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

/**
 * 容器级压制：给区块容器（如侧边栏「最近记录」「已上传文件」）挂原生监听，
 * 区块内所有子孙元素（标题 / 条目 / 空白处）的长按菜单事件冒泡到容器即被拦，
 * 不用逐个子元素挂。只拦菜单、不改样式——不影响列表滚动。
 * 仅 web 生效；返回清理函数（其他端返回 undefined，调用方可直接 ?.()）。
 */
export function attachCalloutSuppress(
  el: HTMLElement | null | undefined,
): (() => void) | undefined {
  if (Platform.OS !== 'web') return;
  if (!el || typeof el.addEventListener !== 'function') return;
  const kill = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  el.addEventListener('contextmenu', kill, { capture: true });
  el.addEventListener('selectstart', kill, { capture: true });
  el.addEventListener('dragstart', kill, { capture: true });
  // 兜底：部分浏览器的长按工具条是「选中驱动」的，不走 contextmenu。
  // 监听 selectionchange，选区一落进区块内立刻清掉，工具条失去选区即收起。
  const doc = el.ownerDocument;
  const clearSelection = () => {
    const sel = doc?.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    if (node && el.contains(node)) sel.removeAllRanges();
  };
  doc?.addEventListener('selectionchange', clearSelection);
  return () => {
    el.removeEventListener('contextmenu', kill, { capture: true } as any);
    el.removeEventListener('selectstart', kill, { capture: true } as any);
    el.removeEventListener('dragstart', kill, { capture: true } as any);
    doc?.removeEventListener('selectionchange', clearSelection);
  };
}
