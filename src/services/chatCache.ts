import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Conversation } from '../hooks/useChatManager'

/**
 * 会话列表 + 上次活跃会话消息的本地缓存（stale-while-revalidate）。
 *
 * 为什么需要：冷启动首屏要等两次**串行**网络请求（getSessions → getSessionDetail），
 * 网络一慢就是 1~2 秒空白。有缓存就能「先渲染本地 → 后台静默刷新」，首屏不再等网络。
 *
 * 三条硬约束：
 *  1. **按 deviceId 分 key** —— 会话是绑设备的（见 useChatManager 的 lastLoadedDeviceIdRef）。
 *     换设备必须整体失效，否则会显示别人的会话。
 *  2. **大小上限** —— AsyncStorage 在 Android 上**单条上限 2MB**，长会话很容易超；
 *     超了就只缓存列表、不缓存消息（消息等下次进会话时再拉）。
 *  3. **版本号** —— 结构变了能整体失效，不用手动清。
 *
 * 读/写都**绝不抛错**：缓存只是加速项，任何异常都当「没有缓存」，不能挡住启动。
 */

const VERSION = 1
/** 消息条数上限：超了只缓存列表 */
const MAX_MESSAGES = 200
/** 缓存字节上限（约 300KB）：超了只缓存列表，避免写爆 AsyncStorage */
const MAX_BYTES = 300 * 1024

interface CacheShape {
  v: number
  list: Conversation[]
  activeId: string | null
  messages?: Conversation['messages']
}

const keyOf = (deviceId: string) => `chat-cache:v${VERSION}:${deviceId}`

/** 消息太大 → 不缓存消息（列表照常缓存） */
const messagesTooBig = (messages?: Conversation['messages']) =>
  !!messages && JSON.stringify(messages).length > MAX_BYTES

export const chatCache = {
  /** 读缓存。异常一律返回 null（缓存只是加速项）。 */
  async readAll(deviceId: string): Promise<Omit<CacheShape, 'v'> | null> {
    if (!deviceId) return null
    try {
      const raw = await AsyncStorage.getItem(keyOf(deviceId))
      if (!raw) return null
      const parsed = JSON.parse(raw) as CacheShape
      if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.list)) return null
      return {
        list: parsed.list,
        activeId: parsed.activeId ?? null,
        messages:
          Array.isArray(parsed.messages) &&
          parsed.messages.length > 0 &&
          !messagesTooBig(parsed.messages)
            ? parsed.messages
            : undefined
      }
    } catch {
      return null
    }
  },

  /** 写缓存。失败静默。 */
  async write(
    deviceId: string,
    list: Conversation[],
    activeId: string | null,
    messages?: Conversation['messages']
  ): Promise<void> {
    if (!deviceId || !Array.isArray(list)) return
    try {
      const truncated =
        messages && messages.length > MAX_MESSAGES
          ? messages.slice(0, MAX_MESSAGES)
          : messages
      const payload: CacheShape = {
        v: VERSION,
        list,
        activeId,
        messages: messagesTooBig(truncated) ? undefined : truncated
      }
      await AsyncStorage.setItem(keyOf(deviceId), JSON.stringify(payload))
    } catch {
      /* 静默：缓存写失败不影响功能 */
    }
  },

  async clear(deviceId: string): Promise<void> {
    if (!deviceId) return
    try {
      await AsyncStorage.removeItem(keyOf(deviceId))
    } catch {
      /* 静默 */
    }
  }
}
