import React, { useState } from 'react'
import {
  NativeModules,
  Platform,
  processColor,
  requireNativeComponent,
  UIManager
} from 'react-native'

export type MdBlockEffect =
  | {
      kind: 'list'
      marker: string
      depth: number
      fontSize?: number
      uid: string
    }
  | {
      kind: 'quote'
      barColor: number
      bgColor: number
      barWidth?: number
      padLeft?: number
      uid: string
    }

let cachedEffectRegistered: boolean | null = null
let cachedNativeTextEffect: React.ComponentType<any> | null = null
let cachedNativeTrimWrap: React.ComponentType<any> | null = null
let cachedTrimWrapSupported: boolean | null = null

/**
 * 检查 Android 原生 TextEffectRegistry 是否可用并完成注册（仅执行一次）。
 * 旧版原生壳通过 OTA 收到新 JS 时返回 false，自动安全降级为普通文本。
 */
export function isNativeSpanSupported(): boolean {
  if (Platform.OS !== 'android') return false
  if (cachedEffectRegistered === true) return true
  try {
    const ok = NativeModules?.DieTaiNative?.ensureTextEffectsRegistered?.() === true
    if (ok) cachedEffectRegistered = true
    return ok
  } catch {
    return false
  }
}

export function isTextTrimWrapSupported(): boolean {
  if (Platform.OS !== 'android') return false
  if (cachedTrimWrapSupported !== null) return cachedTrimWrapSupported
  try {
    const uiMgr = UIManager as any
    cachedTrimWrapSupported = !!(
      uiMgr?.hasViewManagerConfig?.('DieTaiTextTrimWrap') ??
      uiMgr?.getViewManagerConfig?.('DieTaiTextTrimWrap') != null
    )
  } catch {
    cachedTrimWrapSupported = false
  }
  return cachedTrimWrapSupported
}

function getNativeTextEffect(): React.ComponentType<any> | null {
  if (cachedNativeTextEffect) return cachedNativeTextEffect
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native/Libraries/Text/TextEffectNativeComponent')
    cachedNativeTextEffect = mod?.default ?? mod ?? null
  } catch {
    cachedNativeTextEffect = null
  }
  return cachedNativeTextEffect
}

function getNativeTextTrimWrap(): React.ComponentType<any> | null {
  if (cachedNativeTrimWrap) return cachedNativeTrimWrap
  try {
    cachedNativeTrimWrap = requireNativeComponent('DieTaiTextTrimWrap')
  } catch {
    cachedNativeTrimWrap = null
  }
  return cachedNativeTrimWrap
}

/** 把任意 RN 颜色值转为 Android ColorInt，失败回退 fallback */
export function toAndroidColorInt(color: unknown, fallback = 0): number {
  if (typeof color === 'number' && Number.isFinite(color)) return color
  if (typeof color === 'string' && color) {
    const parsed = processColor(color)
    if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/**
 * 包裹 Android 可选中 `<Text>` 的原生高度修剪容器：
 * 监测 `TextView.layout` 实际绘制底边与 Yoga 分配高度的差值（常见于国产 ROM
 * 中文标点挤压导致少画 1~2 行、底部露出空白），以负 marginBottom 收齐余白。
 */
export function SelectableTextTrimWrap({
  children,
  enabled = true
}: {
  children: React.ReactNode
  enabled?: boolean
}) {
  const [surplus, setSurplus] = useState(0)

  if (!enabled || !isTextTrimWrapSupported()) {
    return <>{children}</>
  }

  const NativeWrap = getNativeTextTrimWrap()
  if (!NativeWrap) {
    return <>{children}</>
  }

  return (
    <NativeWrap
      style={surplus > 0 ? { marginBottom: -surplus } : undefined}
      onSurplusChange={(e: any) => {
        const raw = e?.nativeEvent?.surplus
        const next =
          typeof raw === 'number' && Number.isFinite(raw) && raw > 0
            ? Math.round(raw)
            : 0
        setSurplus((prev) => (prev === next ? prev : next))
      }}
    >
      {children}
    </NativeWrap>
  )
}

/**
 * 原生段落级 Span 包裹组件：通过 RN 0.88 `RCTTextEffect` 在同一棵 `<Text>` 树内
 * 为列表项/引用块挂载 Android `LeadingMarginSpan`，保留跨段连续拖选的同时
 * 实现悬挂缩进、引用左竖线与底色块。
 *
 * ⚠️ Android `SpannableStringBuilder` 强制要求 `ParagraphStyle` Span 的起止位置
 *    必须在文本首尾或 `\n` 之后，因此非末尾块的 `\n` 必须包在本组件内部。
 */
export function MdEffectBlock({
  effect,
  children,
  trailingNewline = false,
  hasContent = true
}: {
  effect: MdBlockEffect
  children: React.ReactNode
  trailingNewline?: boolean
  hasContent?: boolean
}) {
  if (!hasContent || !isNativeSpanSupported()) {
    return (
      <>
        {children}
        {trailingNewline ? '\n' : null}
      </>
    )
  }

  const TextEffect = getNativeTextEffect()
  if (!TextEffect) {
    return (
      <>
        {children}
        {trailingNewline ? '\n' : null}
      </>
    )
  }

  return (
    <TextEffect effectName="dietaiBlock" effectProps={effect}>
      {children}
      {trailingNewline ? '\n' : null}
    </TextEffect>
  )
}

/**
 * 为同一个 `<Text>` run 里的非末尾子块追加换行：
 * 若子块末端是 `MdEffectBlock`（或带 `data-md-effect-container` 的容器），
 * 则把 `\n` 推入最后一个 `MdEffectBlock` 内部，确保 `ParagraphStyle` Span
 * 严格落在 `\n` 边界上；否则由调用方在外部补 `\n`。
 */
export function withTrailingNewlineInRun(el: React.ReactNode): {
  node: React.ReactNode
  needsExternalNewline: boolean
} {
  if (!React.isValidElement(el)) {
    return { node: el, needsExternalNewline: true }
  }

  if (el.type === MdEffectBlock) {
    return {
      node: React.cloneElement(el as React.ReactElement<any>, {
        trailingNewline: true
      }),
      needsExternalNewline: false
    }
  }

  const props: any = el.props || {}
  if (props['data-md-effect-container']) {
    const arr = React.Children.toArray(props.children)
    if (arr.length > 0) {
      const lastIdx = arr.length - 1
      const inner = withTrailingNewlineInRun(arr[lastIdx])
      if (!inner.needsExternalNewline && inner.node != null) {
        arr[lastIdx] = inner.node as Exclude<
          React.ReactNode,
          boolean | null | undefined
        >
        return {
          node: React.cloneElement(el as React.ReactElement<any>, undefined, ...arr),
          needsExternalNewline: false
        }
      }
    }
  }

  return { node: el, needsExternalNewline: true }
}

/** 把同级子元素拼进文本流，自动处理块间单换行与 MdEffectBlock 内部换行 */
export function joinRunWithNewlines(items: React.ReactNode[]): React.ReactNode[] {
  const out: React.ReactNode[] = []
  items.forEach((el, i) => {
    if (i < items.length - 1) {
      const res = withTrailingNewlineInRun(el)
      out.push(res.node)
      if (res.needsExternalNewline) {
        out.push('\n')
      }
    } else {
      out.push(el)
    }
  })
  return out
}

/** Android `<Text>` 统一折行策略，对齐 Yoga StaticLayout 与 TextView */
export const ANDROID_TEXT_PROPS =
  Platform.OS === 'android'
    ? ({
        textBreakStrategy: 'simple' as const,
        android_hyphenationFrequency: 'none' as const
      } as const)
    : null
