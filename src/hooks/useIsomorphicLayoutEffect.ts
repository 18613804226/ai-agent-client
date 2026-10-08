import { useEffect, useLayoutEffect } from 'react';

/**
 * Web 端贴底必须用 layout effect（DOM commit 之后、浏览器 paint 之前同步执行），
 * 但 expo web 静态导出会在 Node 里预渲染 —— 那里没有 DOM、也没有 layout 阶段，
 * React 会对 useLayoutEffect 发警告，所以服务端降级成 useEffect。
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
