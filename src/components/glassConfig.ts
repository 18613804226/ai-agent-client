/**
 * 输入栏「磨砂半透」三端集中配置。
 *
 * 只做一层半透明主题色（无高斯模糊）：背后内容会变暗透出，但保持清晰可辨。
 * 平台实现见 `GlassSurface.tsx`（原生）与 `GlassSurface.web.tsx`。
 */
export const GLASS = {
  /** 原生端磨砂底色（半透明） */
  nativeBgDark: 'rgba(30,31,32,0.94)',
  nativeBgLight: 'rgba(240,244,249,0.95)',

  /** Web 端磨砂底色（半透明） */
  webBgDark: 'rgba(30,31,32,0.94)',
  webBgLight: 'rgba(240,244,249,0.95)',
} as const;

/** 原生端磨砂底色 */
export const nativeGlassBg = (isDark: boolean) =>
  isDark ? GLASS.nativeBgDark : GLASS.nativeBgLight;

/** Web 端磨砂底色 */
export const webGlassBg = (isDark: boolean) =>
  isDark ? GLASS.webBgDark : GLASS.webBgLight;
