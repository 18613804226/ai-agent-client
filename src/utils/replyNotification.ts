import {
  AppState,
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform
} from 'react-native'
import { stripDocumentFences } from './chatDocument'

interface DieTaiNativeSpec {
  showReplyNotification?: (title: string, body: string) => void
  cancelReplyNotification?: () => void
  setBackgroundStreaming?: (active: boolean) => void
  startNativeStream?: (
    requestId: string,
    streamUrl: string,
    sessionUrl: string,
    token: string,
    body: string,
    convTitle: string,
    baselineMsgCount: number
  ) => void
  cancelNativeStream?: (requestId: string) => void
}

export type NativeStreamEvent =
  | { requestId: string; type: 'line'; line: string }
  | { requestId: string; type: 'http_error'; status: number; body: string }
  | {
      requestId: string
      type: 'done'
      notified: boolean
      sawError?: boolean
      content: string
      thought: string
    }
  | {
      requestId: string
      type: 'recovered'
      notified: boolean
      content: string
      thought: string
    }
  | { requestId: string; type: 'error'; message: string }

const getDieTaiNative = (): DieTaiNativeSpec | undefined =>
  NativeModules?.DieTaiNative as DieTaiNativeSpec | undefined

let permissionRequested = false
let activeWebNotification: Notification | null = null

export function isAppInBackground(): boolean {
  if (Platform.OS === 'web') {
    const doc = (globalThis as any).document
    return (
      typeof doc !== 'undefined' &&
      (doc.visibilityState === 'hidden' || Boolean(doc.hidden))
    )
  }
  return AppState.currentState !== 'active'
}

export function cancelReplyNotification(): void {
  if (Platform.OS === 'android') {
    try {
      getDieTaiNative()?.cancelReplyNotification?.()
    } catch {}
    return
  }
  if (Platform.OS === 'web' && activeWebNotification) {
    try {
      activeWebNotification.close()
    } catch {}
    activeWebNotification = null
  }
}

export function onAppEnterBackground(
  listener: () => void,
  onForeground?: () => void
): () => void {
  if (Platform.OS === 'web') {
    const doc = (globalThis as any).document
    if (!doc?.addEventListener) return () => {}
    let wasHidden =
      doc.visibilityState === 'hidden' || Boolean(doc.hidden)
    const onVisibilityChange = () => {
      const hidden =
        doc.visibilityState === 'hidden' || Boolean(doc.hidden)
      if (hidden && !wasHidden) {
        wasHidden = true
        listener()
      } else if (!hidden && wasHidden) {
        wasHidden = false
        cancelReplyNotification()
        onForeground?.()
      }
    }
    doc.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      doc.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }

  let prevState: string | null | undefined = AppState.currentState
  const sub = AppState.addEventListener('change', (nextState: string) => {
    if (prevState === 'active' && nextState !== 'active') {
      listener()
    } else if (nextState === 'active') {
      cancelReplyNotification()
      if (prevState !== 'active') {
        onForeground?.()
      }
    }
    prevState = nextState
  })
  return () => {
    sub.remove()
  }
}

export async function ensureReplyNotificationPermission(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      if (Number(Platform.Version) < 33) return
      const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      if (!perm) return
      const granted = await PermissionsAndroid.check(perm)
      if (granted || permissionRequested) return
      permissionRequested = true
      await PermissionsAndroid.request(perm)
      return
    }

    if (Platform.OS === 'web') {
      const NotificationCtor = (globalThis as any).Notification
      if (!NotificationCtor) return
      if (NotificationCtor.permission !== 'default' || permissionRequested) {
        return
      }
      permissionRequested = true
      await NotificationCtor.requestPermission()
    }
  } catch {}
}

export function setBackgroundStreamingActive(active: boolean): void {
  if (Platform.OS !== 'android') return
  try {
    getDieTaiNative()?.setBackgroundStreaming?.(active)
  } catch {}
}

export function hasNativeStreamSupport(): boolean {
  return (
    Platform.OS === 'android' &&
    typeof getDieTaiNative()?.startNativeStream === 'function'
  )
}

export function startNativeSseStream(
  params: {
    requestId: string
    streamUrl: string
    sessionUrl: string
    token: string
    body: string
    convTitle: string
    baselineMsgCount: number
  },
  onEvent: (event: NativeStreamEvent) => void
): () => void {
  const mod = getDieTaiNative()
  if (
    Platform.OS !== 'android' ||
    typeof mod?.startNativeStream !== 'function'
  ) {
    return () => {}
  }

  let cleanedUp = false
  const sub = DeviceEventEmitter.addListener(
    'onDieTaiStreamEvent',
    (ev: NativeStreamEvent) => {
      if (cleanedUp || !ev || ev.requestId !== params.requestId) return
      onEvent(ev)
    }
  )

  mod.startNativeStream(
    params.requestId,
    params.streamUrl,
    params.sessionUrl,
    params.token,
    params.body,
    params.convTitle,
    params.baselineMsgCount
  )

  return () => {
    if (cleanedUp) return
    cleanedUp = true
    try {
      sub.remove()
    } catch {}
    try {
      mod.cancelNativeStream?.(params.requestId)
    } catch {}
  }
}

function formatNotificationPreview(rawContent: string): string {
  const unwrapped = stripDocumentFences(rawContent || '')
  const plain = unwrapped
    .replace(/```[\s\S]*?```/g, ' [代码] ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\d+\]/g, '')
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return '点击查看完整回复'
  return plain.length > 80 ? `${plain.slice(0, 79)}…` : plain
}

export function notifyReplyCompleted(
  rawContent: string,
  convTitle?: string
): void {
  const cleanTitle = convTitle?.trim()
  const title =
    cleanTitle && cleanTitle !== '新对话'
      ? `DieTai · ${cleanTitle}`
      : 'DieTai 已完成回答'
  const body = formatNotificationPreview(rawContent)

  if (Platform.OS === 'android') {
    try {
      getDieTaiNative()?.showReplyNotification?.(title, body)
    } catch {}
    return
  }

  if (Platform.OS === 'web') {
    const NotificationCtor = (globalThis as any).Notification
    if (!NotificationCtor || NotificationCtor.permission !== 'granted') return
    try {
      activeWebNotification?.close()
      const notification: Notification = new NotificationCtor(title, {
        body,
        tag: 'dietai-reply'
      })
      activeWebNotification = notification
      notification.onclick = () => {
        try {
          ;(globalThis as any).focus?.()
          notification.close()
        } catch {}
      }
    } catch {}
  }
}
