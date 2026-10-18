/**
 * 输入栏「毛玻璃」三端差异的集中配置。
 *
 * 三端机制完全不同，别再把魔法值散落在调用方：
 * - Web：靠 CSS `backdrop-filter`（在容器上），无 BlurView。
 * - iOS：`BlurView` 原生 `UIVisualEffectView`（intensity + tint）。
 * - Android：`BlurView` 的 dimezis 实现，必须配 `blurTarget`（否则回退 none 并告警），
 *   且"实/透"由 tint 叠加层决定（alpha ≈ (intensity/100)*0.69，有 0.69 上限），
 *   上限不够就在 blur 之上再盖一层主题色 scrim（{@link androidScrim}）。
 *
 * 平台实现见 `GlassSurface.tsx`（原生）与 `GlassSurface.web.tsx`。
 */
export const GLASS = {
  /** 原生端输入栏底色：与 BlurView 自带底色保持一致，避免边缘 5~6px 色差条 */
  nativeBgDark: 'rgba(30,31,32,0.65)',
  nativeBgLight: 'rgba(240,244,249,0.65)',

  /** Web 端底色（略实一点）+ backdrop-filter 模糊半径 */
  webBgDark: 'rgba(30,31,32,0.72)',
  webBgLight: 'rgba(240,244,249,0.72)',
  webBlur: 24,

  /** iOS / 默认端 intensity（0~100） */
  iosIntensity: 60,

  /** Android：intensity 越大 → tint 叠加层越实；blurReductionFactor 等比放大，
   *  使实际模糊半径 = intensity/blurReductionFactor 保持不变（只加深叠加层，不改模糊强度） */
  androidIntensity: 95,
  androidBlurReductionFactor: 6.3,

  /** Android：blur 之上再盖的主题色 scrim，无 0.69 上限（1 = 完全不透明） */
  androidScrimAlpha: 0.6,
} as const;

/** 原生端输入栏底色 */
export const nativeGlassBg = (isDark: boolean) =>
  isDark ? GLASS.nativeBgDark : GLASS.nativeBgLight;

/** Web 端输入栏底色 */
export const webGlassBg = (isDark: boolean) =>
  isDark ? GLASS.webBgDark : GLASS.webBgLight;

/** Android blur 之上的主题色 scrim（rgba 字符串） */
export const androidScrim = (isDark: boolean) =>
  `rgba(${isDark ? '30,31,32' : '240,244,249'},${GLASS.androidScrimAlpha})`;