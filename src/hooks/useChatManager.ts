import { useRef, useState, useEffect, useCallback } from 'react'
import { Platform, Vibration } from 'react-native'
import { useAnimatedRef } from 'react-native-reanimated'
import { api, refreshDeviceSnapshot, refreshMyDevice } from '../services/api'

/** 唯一消息 id：Date.now 单独用会在同一毫秒内重复（用户消息 + thinking 占位） */
const makeId = (prefix = 'm') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

/** 服务端历史 id 可能是毫秒时间戳且重复；补成唯一 id，避免 FlashList/React duplicate key */
const normalizeMessages = (list: any[]) => {
  const seen = new Set<string>()
  return (list || []).map((m: any) => {
    let id = m?.id != null ? String(m.id) : ''
    if (!id || seen.has(id)) id = makeId('m')
    seen.add(id)
    return { ...m, id }
  })
}
import {
  getToken,
  onTokenChange,
  bumpLocalUsage,
  getDevice
} from '../services/authStore'
import { MyToast } from '../components/GlobalToast'
import { stopSpeech } from '../services/speechPlayer'
import { resolveImageUpload, type PickedAttachment } from './useImagePicker'
import { chatDistanceFromBottom, scrollChatToBottom } from '../utils/chatScroll'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  time?: string
  thought?: string
  systemNote?: boolean
  images?: string[]
  /** 随消息发送的附件（文档/视频）：本地回显 + 气泡内点击预览（存完整附件对象） */
  attachments?: PickedAttachment[]
}

export interface Conversation {
  id: string
  title: string
  messages?: Message[]
}

const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

type StreamChunk = { type: 'thought' | 'content'; text: string }

export function useChatManager() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const [autoRead, setAutoRead] = useState(false)
  const toggleAutoRead = () => setAutoRead((prev) => !prev)

  // ==================== 流式相关 ====================
  const [streamingRenderMsg, setStreamingRenderMsg] = useState<{
    msgId: string
    thought: string
    content: string
  } | null>(null)

  const queueRef = useRef<StreamChunk[]>([])
  const currentThoughtRef = useRef('')
  const currentContentRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const isConsumingRef = useRef(false)
  const streamFinishedRef = useRef(false)
  const currentStreamingMsgIdRef = useRef<string>('')
  /**
   * 流世代号：每开始/中止一轮流式 +1。
   * cancelAnimationFrame 存在极小概率漏掉「已入队待执行」的那一帧，
   * 旧帧若复活会把新流的队列用旧 msgId 吐掉（isConsumingRef 为 true 时
   * enqueue 也不会再唤醒），表现就是新消息一直「思考中...」。
   */
  const streamEpochRef = useRef(0)
  /** handleSend 轮次令牌：旧轮的 finally 不允许覆盖新一轮的状态 */
  const sendRunRef = useRef(0)
  /**
   * 本轮是否不计费：用户中止 / 429 超限 / 401 未登录 / 请求异常时为 true，
   * finally 里据此决定要不要本地乐观 +1 配额（服务端这些场景不计数）。
   */
  const sendNotCountedRef = useRef(false)

  // ==================== 吐字引擎状态 ====================
  /** 队列里还没吐出来的字数 */
  const queueCharsRef = useRef(0)
  /** 小数余额：不足 1 字的吐字量留到下一帧，避免高频帧率下丢字 */
  const charCarryRef = useRef(0)
  const lastFrameTimeRef = useRef(0)
  const lastPushTimeRef = useRef(0)

  const autoFollowRef = useRef(true)
  const isAtBottomRef = useRef(true)
  // animated ref：钉顶/历史贴底用 UI 线程 scrollTo 直接驱动 FlashList 内部 ScrollView
  const scrollViewRef = useAnimatedRef<any>()

  // ==================== 吐字参数 ====================
  /**
   * 空闲吐字速度（字/秒）：只在「模型本身比这慢」或「队列快吐完」时生效，
   * 负责给出匀速打字的手感。
   */
  const CHARS_PER_SEC = 99
  /**
   * 积压超过该值就进入追赶。
   * 原来是 120：等于自己先攒 120 字的缓冲 ≈ 0.3~1.2s 的延迟，白等；
   * 20 字 ≈ 0.1s，肉眼分辨不出。
   */
  const CATCH_UP_CHARS = 20
  /**
   * 追赶倍率（单位：字/秒 每 1 字积压）。
   * 稳定态：吐字速度 = 倍率 × 积压 = 到达速度，于是
   * **平均延迟 ≈ 1 / 倍率 秒**：×2 → 0.5s（原来的观感就是「慢半拍」），
   * ×7 → ≈0.14s（等同于不延迟）。
   * 想更不延迟就调大（10 → ≈0.1s），代价是单帧增量变大、台阶更容易看见。
   */
  const CATCH_UP_RAMP = 7
  /** 追赶速度上限（字/秒）：防止高速流下越追越猛。 */
  const MAX_CATCH_UP_SPEED = 1600
  /**
   * 流式中单帧吐字上限：16 字 ≈ 0.8 行。
   * 它同时是「主线程卡顿时的保险丝」和「流式期的视觉上限」：
   * 16 字 × 60fps ≈ 960 字/秒，已经比绝大多数模型的输出速度还快。
   */
  const MAX_PER_FRAME = 16
  /** 流已结束时的收尾基准速度（字/秒）：队列快空时用它，最后几个字仍是「打字」出来的。 */
  const FINISH_SPEED = 420
  /** 收尾追赶倍率：流都结束了就没必要再慢慢吐，积压越多收得越快。 */
  const FINISH_RAMP = 14
  /** 收尾速度上限（字/秒）。 */
  const MAX_FINISH_SPEED = 1920
  /**
   * 收尾时单帧上限：32 字 ≈ 1.5 行。
   * 流已结束、用户在等落盘，这时候「快」比「稳」重要。
   */
  const FINISH_MAX_PER_FRAME = 32
  /** 每帧推一次 React 状态（≈20fps）：批量更新，避免每 token 全树重渲染 */
  const FRAME_PUSH_INTERVAL = 50
  /** 单帧时间上限，防止切后台回来一帧吐几百字 */
  const MAX_FRAME_GAP = 100
  const FIRST_FRAME_GAP = 16

  /** 清空吐字状态机（切换会话 / 新一轮流式开始时调用） */
  const resetTypewriter = useCallback(() => {
    streamEpochRef.current += 1
    streamFinishedRef.current = false
    isConsumingRef.current = false
    queueRef.current = []
    queueCharsRef.current = 0
    charCarryRef.current = 0
    lastFrameTimeRef.current = 0
    lastPushTimeRef.current = 0
    currentThoughtRef.current = ''
    currentContentRef.current = ''
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /**
   * 中止在途的一轮流式（切会话 / 新建会话 / 重复发送时调用）。
   * 不弹「用户中止对话」标记 —— 那是 handleStopGeneration 专属的语义。
   * 关键点：必须 abort 网络请求。只 resetTypewriter 是不够的，
   * 旧流的 onprogress 会继续 enqueue，在 isConsumingRef=false 时用旧 msgId
   * 复活吐字链，落盘时那条消息已被 getSessionDetail 覆盖 → 永久「思考中...」。
   */
  const abortActiveStream = useCallback(() => {
    // 中止的请求服务端不计费（清单：abort 不计费）
    sendNotCountedRef.current = true
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    streamFinishedRef.current = true
    streamEpochRef.current += 1
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current)
      timerRef.current = null
    }
    isConsumingRef.current = false
    queueRef.current = []
    queueCharsRef.current = 0
    charCarryRef.current = 0
    lastFrameTimeRef.current = 0
    lastPushTimeRef.current = 0
    currentStreamingMsgIdRef.current = ''
    setStreamingRenderMsg(null)
    setIsGenerating(false)
  }, [])

  // 1. 初始化：等 device-login 落 token 后再拉会话；
  // 若首轮拿过期 token 被 401，新 token 落盘后自动重拉一次
  // 上次已加载会话的 deviceId：切角色只换 token、deviceId 不变，
  // 此时无需重拉（会把当前会话重置回第一个、消息重新加载 = 聊天窗口刷新）
  const lastLoadedDeviceIdRef = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const initChatData = async () => {
      try {
        // 还没登录（无 token）就等 token-change，不先打 401
        const token = await getToken()
        if (!token) return
        // 会话按 deviceId 绑定：deviceId 没变（典型 = 切 user/admin 角色）就跳过重拉，
        // 保持当前会话与消息不动，避免聊天窗口被重置刷新
        const device = await getDevice()
        const deviceId = device?.deviceId ?? null
        if (deviceId && deviceId === lastLoadedDeviceIdRef.current) return
        lastLoadedDeviceIdRef.current = deviceId
        const sessions: any = await api.getSessions()
        if (cancelled) return
        if (sessions && sessions.length > 0) {
          setConversations(sessions)
          const firstId = sessions[0].id
          setActiveId(firstId)

          const detail: any = await api.getSessionDetail(firstId)
          if (cancelled) return
          setConversations((prev) =>
            prev.map((c) =>
              c.id === firstId
                ? { ...c, messages: normalizeMessages(detail.messages || []) }
                : c
            )
          )
          return
        }
        setConversations([])
        setActiveId('')
      } catch (error) {
        // 401 是旧 token 过期的预期失败（会自动续期+onTokenChange 重拉），不刷错
        const status =
          (error as any)?.response?.status ?? (error as any)?.status
        if (!cancelled && status !== 401)
          console.error('初始化后端会话失败:', error)
      }
    }
    initChatData()
    const off = onTokenChange((token) => {
      if (token) initChatData()
      else if (!cancelled) {
        // token 清空（登出/401 自愈）：重置 deviceId 记录，下次登录无论是否同设备都重拉
        lastLoadedDeviceIdRef.current = null
        setConversations([])
        setActiveId('')
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const currentChat =
    conversations.find((c) => c.id === activeId) || conversations[0]

  /**
   * 判断会话是否为「空白新会话」：
   * - messages 为空数组 / 尚未加载(undefined) 且标题仍是默认「新对话」
   *
   * 为什么把 messages===undefined 也算空白：
   * 刚创建的会话本地没有 messages 字段（handleSelectChat 才会回填），
   * 如果这时把它判成「非空白」，点 + 会再建一个，用户会看到两个空白。
   * 真正从后端加载过的会话只要发过言就有 messages（发送即本地落盘），
   * 所以 undefined + 默认标题 ≈ 刚建还没用过的会话，误判概率极低。
   */
  const isBlankSession = (conv?: Conversation) =>
    !!conv &&
    conv.title === '新对话' &&
    (!conv.messages || conv.messages.length === 0)

  // 2. 创建新会话（幂等：已停留在空白会话上时复用，不再建）
  const handleNewChat = async () => {
    // ① 当前已是空白会话 → 原地复用，不调后端，避免攒出一堆「新对话」
    const activeConv = conversations.find((c) => c.id === activeId)
    if (activeConv && isBlankSession(activeConv)) {
      // 草稿是全局 inputText，切会话不丢，这里不用管
      return activeConv.id
    }

    // 新会话不继承旧会话在途的流（abortActiveStream 内含 setIsGenerating(false)）
    abortActiveStream()

    // ② 顺手清掉列表里其他的空白会话（只保留当前这一个），历史记录立刻干净。
    //    后端删除异步进行、失败静默（下次点 + 还会再清一次），不阻塞不报错。
    //    安全边界：只有「默认标题 + 本地无消息」才算空白——发过言的会话标题
    //    会在发送瞬间同步改掉（本地 + 后端），所以不会误删有内容的会话。
    const blankIds = conversations
      .filter((c) => c.id !== activeId && isBlankSession(c))
      .map((c) => c.id)
    if (blankIds.length > 0) {
      setConversations((prev) => prev.filter((c) => !blankIds.includes(c.id)))
      // 异步删后端，失败静默（下次打开还会再清一次）
      blankIds.forEach((id) => {
        api.deleteSession(id).catch(() => {})
      })
    }

    const tempId = makeId('temp')
    const newConv = { id: tempId, title: '新对话' }

    setConversations((prev) => [newConv, ...prev].slice(0, 20))
    setActiveId(tempId)

    try {
      const sessionData: any = await api.createSession()
      const realId = sessionData.id

      setConversations((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? { ...c, id: realId, title: sessionData.title || '新对话' }
            : c
        )
      )
      setActiveId(realId)
      return realId
    } catch (error) {
      console.error('创建会话失败', error)
      setConversations((prev) => prev.filter((c) => c.id !== tempId))
    }
  }

  // 3. 切换会话
  const handleSelectChat = async (id: string) => {
    // 切换时中止在途流式并清理流式状态，防止串文字 / 旧消息卡在「思考中...」
    abortActiveStream()
    resetTypewriter()
    autoFollowRef.current = true
    // 切换会话时关闭头部「自动朗读」，并中止正在播放的音频
    // （否则新会话会被 autoRead 的 effect 自动接着念）
    setAutoRead(false)
    stopSpeech()
    setActiveId(id)

    try {
      const detail: any = await api.getSessionDetail(id)
      const messages = normalizeMessages(detail.messages || [])
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, messages } : c))
      )
    } catch (error) {
      console.error('获取会话详情失败:', error)
    }
  }

  // 4. 删除会话
  const handleDeleteChat = async (e: any, id: string) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation()
    }
    try {
      await api.deleteSession(id)
    } catch (error) {
      console.error('删除会话失败:', error)
      return
    }

    const nextConversations = conversations.filter((c) => c.id !== id)
    setConversations(nextConversations)

    if (activeId === id) {
      if (nextConversations.length > 0) {
        setActiveId(nextConversations[0].id)
        handleSelectChat(nextConversations[0].id)
      } else {
        setActiveId('')
      }
    }
  }

  const updateAiMessageFields = useCallback(
    (
      msgId: string,
      fields: { content?: string; thought?: string; systemNote?: boolean }
    ) => {
      setConversations((prev) =>
        prev.map((conv) => {
          const hasMessage =
            conv.messages?.some((m: any) => m.id === msgId) || false
          if (!hasMessage) return conv

          return {
            ...conv,
            messages: (conv.messages || []).map((msg) =>
              msg.id === msgId ? { ...msg, ...fields } : msg
            )
          }
        })
      )
    },
    []
  )

  /** 追加一条消息到当前会话（用于「用户中止对话」提示等） */
  const appendMessage = useCallback(
    (msg: Partial<Message>) => {
      const id = msg.id ?? makeId('m')
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeId
            ? {
                ...conv,
                messages: [...(conv.messages || []), { ...msg, id } as Message]
              }
            : conv
        )
      )
      return id
    },
    [activeId]
  )

  const updateStreamingMarkdownState = useCallback(
    (content: string, thought: string, msgId: string) => {
      if (streamFinishedRef.current && queueRef.current.length === 0) {
        // 已结束且队列空，不再更新临时状态
        return
      }
      setStreamingRenderMsg({
        msgId,
        thought,
        content
      })
    },
    []
  )

  // ==================== 核心：匀速吐字 + 无空转的队列消费者 ====================
  const startSmoothConsumer = useCallback(
    (targetMsgId: string) => {
      if (isConsumingRef.current) return
      isConsumingRef.current = true

      /** 本条吐字链所属的流世代号：与 streamEpochRef 不符即说明这轮流已被放弃 */
      const myEpoch = streamEpochRef.current

      /** 吐字收尾：队列排空 + 流已结束 → 落盘，UI 一次性切到最终态 */
      const finish = () => {
        isConsumingRef.current = false
        timerRef.current = null

        const thought = currentThoughtRef.current
        const content = currentContentRef.current

        if (thought || content) {
          updateAiMessageFields(targetMsgId, {
            thought: thought || undefined,
            content
          })
        } else {
          // 空回复必须写成一条系统标记行，不能留空 content：
          // ChatArea 判定 hasContent=false && hasThought=false → isThinking=true，
          // 那颗气泡会永远转「思考中...」（服务端 finalCleanReply 被清洗成空、
          // 只回 thought、subject$.error 等情况都会走到这里）。
          updateAiMessageFields(targetMsgId, {
            content: '（模型未返回内容）',
            systemNote: true
          })
        }

        setStreamingRenderMsg(null)
      }

      const consumeFrame = (frameTime?: number) => {
        // 已被新一轮流式接管 → 旧链直接退出。
        // 注意别在这里改 isConsumingRef / timerRef：它们现在属于新链。
        if (streamEpochRef.current !== myEpoch) return

        try {
          stepFrame(frameTime)
        } catch (err) {
          // 绝不能让 RAF 链带着 isConsumingRef=true 断掉：
          // 之后所有 enqueue 都会因为「已在消费」而不再唤醒 → 永久卡住
          console.error('吐字引擎异常，强制收尾:', err)
          queueRef.current = []
          queueCharsRef.current = 0
          streamFinishedRef.current = true
          finish()
        }
      }

      /** 单帧消费：按时间算预算 → 从队列头取字 → 每帧推一次 React 状态 */
      const stepFrame = (frameTime?: number) => {
        const queue = queueRef.current

        // ===== 关键：没数据就停，彻底去掉空转 =====
        if (queue.length === 0) {
          if (streamFinishedRef.current) {
            finish()
          } else {
            // 队列空但流还没结束 → 停掉 RAF，等新数据再唤醒
            isConsumingRef.current = false
            timerRef.current = null
          }
          return
        }

        // ===== 按时间算本帧该吐多少字 =====
        const now =
          typeof frameTime === 'number' && frameTime > 0
            ? frameTime
            : Date.now()
        const gap =
          lastFrameTimeRef.current === 0
            ? FIRST_FRAME_GAP
            : Math.min(now - lastFrameTimeRef.current, MAX_FRAME_GAP)
        lastFrameTimeRef.current = now

        const backlog = queueCharsRef.current
        let speed = CHARS_PER_SEC
        /** 本帧吐字上限：收尾期放宽（流已结束，用户已在等落盘） */
        let perFrameLimit = MAX_PER_FRAME
        if (streamFinishedRef.current) {
          // 流已结束：按积压提速收尾，避免长回答在结尾干等
          speed = Math.min(
            FINISH_SPEED + backlog * FINISH_RAMP,
            MAX_FINISH_SPEED
          )
          perFrameLimit = FINISH_MAX_PER_FRAME
        } else if (backlog > CATCH_UP_CHARS) {
          // 积压：按积压量提速，保证消费速度始终 ≥ 到达速度
          speed = Math.min(
            Math.max(backlog * CATCH_UP_RAMP, CHARS_PER_SEC),
            MAX_CATCH_UP_SPEED
          )
        }

        charCarryRef.current += (gap / 1000) * speed
        let budget = Math.floor(charCarryRef.current)
        charCarryRef.current -= budget
        if (budget <= 0) {
          // 还没到吐字时间，等下一帧
          timerRef.current = requestAnimationFrame(consumeFrame)
          return
        }
        budget = Math.min(budget, perFrameLimit)

        // ===== 从队列头按帧消费 =====
        let remain = budget
        while (remain > 0 && queue.length > 0) {
          const chunk = queue[0]
          const take = Math.min(remain, chunk.text.length)

          if (chunk.type === 'thought') {
            currentThoughtRef.current += chunk.text.slice(0, take)
          } else {
            currentContentRef.current += chunk.text.slice(0, take)
          }
          queueCharsRef.current -= take

          if (take >= chunk.text.length) {
            queue.shift()
          } else {
            chunk.text = chunk.text.slice(take)
          }
          remain -= take
        }

        // ===== 每帧推一次 React 状态（约 60fps），每帧只追加、不重排 =====
        if (now - lastPushTimeRef.current >= FRAME_PUSH_INTERVAL) {
          lastPushTimeRef.current = now
          updateStreamingMarkdownState(
            currentContentRef.current,
            currentThoughtRef.current,
            targetMsgId
          )
        }

        if (queue.length === 0 && streamFinishedRef.current) {
          finish()
          return
        }
        timerRef.current = requestAnimationFrame(consumeFrame)
      }

      timerRef.current = requestAnimationFrame(consumeFrame)
    },
    [updateStreamingMarkdownState, updateAiMessageFields]
  )

  // 推送并自动唤醒
  const enqueue = useCallback(
    (type: 'thought' | 'content', text: string) => {
      if (!text) return
      // 没有活跃 msgId = 当前没有在跑的流（旧流 abort 后可能还来最后几片）
      if (!currentStreamingMsgIdRef.current) return
      queueRef.current.push({ type, text })
      queueCharsRef.current += text.length

      // 唤醒消费者
      if (!isConsumingRef.current) {
        startSmoothConsumer(currentStreamingMsgIdRef.current)
      }
    },
    [startSmoothConsumer]
  )

  // ==================== SSE 解析公共逻辑 ====================
  const processSSELine = (line: string) => {
    const trimmedLine = line.trim()
    if (!trimmedLine.startsWith('data:')) return

    const jsonText = trimmedLine.replace('data:', '').trim()
    if (jsonText === '[DONE]') return

    try {
      const parsed = JSON.parse(jsonText)
      // 新版后端信封：{ data: { type, content } }，兼容旧版直铺形态
      const payload = parsed?.data ?? parsed
      const delta = payload.choices?.[0]?.delta || {}

      let chunkThought = ''
      let chunkContent = ''

      if (payload.type === 'thought') {
        chunkThought = payload.thought || payload.content || ''
      } else if (payload.type === 'content') {
        chunkContent = payload.content || ''
      } else if (payload.type === 'error') {
        // 服务端错误帧：直接展示，避免气泡一直「思考中...」
        updateAiMessageFields(currentStreamingMsgIdRef.current, {
          content:
            payload.content || payload.message || '服务器开小差了，请稍后再试。'
        })
        setStreamingRenderMsg(null)
        streamFinishedRef.current = true
        return
      } else if (payload.type === 'sources') {
        return // 引用来源帧：暂不渲染
      } else {
        chunkThought =
          delta.reasoning_content || payload.reasoning_content || ''
        chunkContent = delta.content || payload.content || ''
      }

      if (chunkThought) enqueue('thought', chunkThought)
      if (chunkContent) enqueue('content', chunkContent)
    } catch {
      // 解析失败忽略
    }
  }

  // ==================== 流式读取 ====================
  const runTypewriterEffect = async (
    thinkingMsgId: string,
    sessionId: string,
    queryText: string,
    images: string[] = [],
    knowledgeFileIds: string[] = [],
    attachmentIds: string[] = []
  ) => {
    // 重置状态
    resetTypewriter()
    currentStreamingMsgIdRef.current = thinkingMsgId
    setStreamingRenderMsg(null)

    // 本轮流的世代号：中途被中止/被新一轮顶替后，旧流残片一律丢弃，
    // 否则两条流共用同一个队列会互相串字
    const myEpoch = streamEpochRef.current
    const handleLine = (line: string) => {
      if (streamEpochRef.current !== myEpoch) return
      processSSELine(line)
    }

    startSmoothConsumer(thinkingMsgId)

    const url = `${baseURL}/chat/${sessionId}/stream`

    // images 已经在 handleSend 中上传，返回的是后端 URL 列表，直接使用
    const imageUrls = images

    // ========== WEB：fetch + ReadableStream ==========
    if (Platform.OS === 'web') {
      try {
        const streamToken = await getToken()
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(streamToken ? { Authorization: 'Bearer ' + streamToken } : {})
          },
          body: JSON.stringify({
            query: queryText,
            images: imageUrls,
            fileIds: knowledgeFileIds,
            ...(attachmentIds.length > 0 ? { attachmentIds } : {})
          }),
          signal: abortControllerRef.current!.signal
        })

        if (response.status === 429) {
          let quotaMsg = '今日体验次数已用完，明天再来吧'
          try {
            const errJson = await response.json()
            if (errJson?.message) quotaMsg = errJson.message
          } catch (e) {}
          MyToast.show(quotaMsg)
          updateAiMessageFields(thinkingMsgId, {
            content: quotaMsg,
            systemNote: true
          })
          setStreamingRenderMsg(null)
          streamFinishedRef.current = true
          sendNotCountedRef.current = true // 超限未处理，不计费
          refreshDeviceSnapshot()
          return
        }
        if (response.status === 401) {
          sendNotCountedRef.current = true // 未登录不计费
          const { notifyUnauthorized } = await import('../services/authStore')
          notifyUnauthorized()
          updateAiMessageFields(thinkingMsgId, {
            content: '登录已过期，正在重新登录，请稍后重试。',
            systemNote: true
          })
          setStreamingRenderMsg(null)
          streamFinishedRef.current = true
          return
        }
        if (!response.ok) {
          // 后端 400 会带具体原因（不支持的文件类型 / 超 50MB / 视频超 10 分钟 /
          // 无音轨 / 扫描版无 OCR / query 和文件都没有…），必须原样展示，别吞成
          // 笼统的「服务器开小差了」。
          let msg = ''
          try {
            const errJson = await response.json()
            msg = errJson?.message || ''
          } catch (e) {}
          if (msg) {
            sendNotCountedRef.current = true // 请求被拒，服务端不计费
            MyToast.show(msg)
            updateAiMessageFields(thinkingMsgId, {
              content: msg,
              systemNote: true
            })
            setStreamingRenderMsg(null)
            streamFinishedRef.current = true
            return
          }
          throw new Error('HTTP ' + response.status)
        }
        if (!response.body) {
          throw new Error('ReadableStream not supported')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            streamFinishedRef.current = true
            // 唤醒一次，让消费者走结束逻辑
            if (!isConsumingRef.current) {
              startSmoothConsumer(thinkingMsgId)
            }
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            handleLine(line)
          }
        }
      } catch (err: any) {
        sendNotCountedRef.current = true // 网络/HTTP 异常，服务端大概率不计费
        if (err.name !== 'AbortError') {
          console.error('web stream error', err)
          updateAiMessageFields(thinkingMsgId, {
            content: '服务器开小差了，请检查网络或后端连接。'
          })
          setStreamingRenderMsg(null)
        }
        streamFinishedRef.current = true
      }
    }
    // ========== 移动端：XHR onprogress ==========
    else {
      // 让 runTypewriterEffect「真正」等到 XHR 结束再返回。
      // 之前分支里 xhr.send() 之后 async 函数就结束了 → handleSend 的
      // finally 立刻执行 setIsGenerating(false) → 停止按钮在流式期间
      // 就切回「发送」状态、点击无效。
      await new Promise<void>(async (resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url)
        xhr.setRequestHeader('Content-Type', 'application/json')
        try {
          const t = await getToken()
          if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t)
        } catch (e) {}
        let lastReadPos = 0
        /**
         * SSE 半行缓冲：XHR 的 progress 按网络包切分，不会对齐 \n。
         * 之前是直接 split 后把最后一段（半行）一起丢掉、lastReadPos 又已前移，
         * 那条 data: 事件就整条没了（下一片以半行开头，JSON.parse 再次失败）
         * → 真机丢字/丢段，极端情况下丢光 → 气泡卡在「思考中...」。
         */
        let buffer = ''

        const settle = () => resolve()

        /** flush=true 时把残留的最后一段也按整行处理（收尾用） */
        const drainSSE = (flush = false) => {
          const lines = buffer.split('\n')
          buffer = flush ? '' : lines.pop() || ''
          for (const line of lines) {
            handleLine(line)
          }
        }

        xhr.onprogress = () => {
          buffer += xhr.responseText.substring(lastReadPos)
          lastReadPos = xhr.responseText.length
          drainSSE()
        }

        xhr.onload = () => {
          if (xhr.status === 429) {
            let quotaMsg = '今日体验次数已用完，明天再来吧'
            try {
              const errJson = JSON.parse(xhr.responseText)
              if (errJson?.message) quotaMsg = errJson.message
            } catch (e) {}
            MyToast.show(quotaMsg)
            updateAiMessageFields(thinkingMsgId, {
              content: quotaMsg,
              systemNote: true
            })
            setStreamingRenderMsg(null)
            streamFinishedRef.current = true
            sendNotCountedRef.current = true // 超限未处理，不计费
            refreshDeviceSnapshot()
            settle()
            return
          }
          if (xhr.status === 401) {
            sendNotCountedRef.current = true // 未登录不计费
            import('../services/authStore').then((m) => m.notifyUnauthorized())
            updateAiMessageFields(thinkingMsgId, {
              content: '登录已过期，正在重新登录，请稍后重试。',
              systemNote: true
            })
            setStreamingRenderMsg(null)
            streamFinishedRef.current = true
            settle()
            return
          }
          if (xhr.status < 200 || xhr.status >= 300) {
            sendNotCountedRef.current = true // 非 2xx，服务端不计费
            // 400 的具体原因（文件类型/大小/时长…）原样展示
            let msg = ''
            try {
              msg = JSON.parse(xhr.responseText)?.message || ''
            } catch (e) {}
            if (msg) MyToast.show(msg)
            updateAiMessageFields(thinkingMsgId, {
              content: msg || '服务器开小差了，请检查网络或后端连接。',
              systemNote: !!msg
            })
            setStreamingRenderMsg(null)
            streamFinishedRef.current = true
            settle()
            return
          }
          drainSSE(true)
          streamFinishedRef.current = true
          if (!isConsumingRef.current) {
            startSmoothConsumer(thinkingMsgId)
          }
          settle()
        }

        xhr.onerror = () => {
          sendNotCountedRef.current = true // 网络错误，服务端不计费
          updateAiMessageFields(thinkingMsgId, {
            content: '服务器开小差了，请检查网络或后端连接。'
          })
          setStreamingRenderMsg(null)
          streamFinishedRef.current = true
          settle()
        }

        abortControllerRef.current!.signal.addEventListener('abort', () => {
          xhr.abort()
          // XMLHttpRequest 的 abort 事件不会触发 onload/onerror，
          // 所以要在这里 settle，让 runTypewriterEffect 的 await 回来，
          // 确保 handleSend 的 finally 也能完整执行收尾。
          streamFinishedRef.current = true
          settle()
        })

        xhr.send(
          JSON.stringify({
            query: queryText,
            images: imageUrls,
            fileIds: knowledgeFileIds,
            ...(attachmentIds.length > 0 ? { attachmentIds } : {})
          })
        )
      })
    }
  }

  // ==================== 滚动处理 ====================
  const handleScroll = (event: any) => {
    // 原生端是 inverted 列表（offset 0 就是视觉底部），离底距离的算法两端不同，
    // 统一走 utils/chatScroll 里的 chatDistanceFromBottom。
    const isCloseToBottom = chatDistanceFromBottom(event?.nativeEvent) <= 50

    // autoFollowRef 归 ChatArea 独占写入（它要和「回到底部」按钮用同一个阈值），
    // 这里别再抢着写，否则两个阈值打架会让自动跟随在吐字时来回抖。
    isAtBottomRef.current = isCloseToBottom
  }

  // ==================== 发送消息 ====================
  /**
   * @param overrideText 可选。传入时优先发送该文本（用于语音识别等「即时发送」场景），
   *                     否则发送输入框当前内容。
   * @param images 可选。选中的图片 base64/URL 数组，发送前会上传到后端。
   * @param knowledgeFileIds 可选。选中的知识库文件 ID 数组，告知后端用于 RAG 上下文。
    * @param files 可选。随消息发送的文档/视频附件：选中时已上传拿 id
    *             （useImagePicker.uploadAttachment），这里对失败/未完成/临近过期的
    *             做兜底重传，再以 attachmentIds 随本轮消息引用（不入向量库）。
    * @param onComposerClear 可选。**前置校验 + 附件上传全部通过**时立刻回调一次：
    *             用来清掉输入栏的图片/文件 chips，不必等流式吐字结束。
    *             校验失败 / 附件上传失败都会提前 return false，不会触发它，
    *             所以 chips 留着、用户可以直接重试。
    * @returns 是否真正发起发送（false = 前置校验/附件上传失败，输入已还给用户）。
    */
  const handleSend = async (
    overrideText?: string,
    images: string[] = [],
    knowledgeFileIds: string[] = [],
    attachments: PickedAttachment[] = [],
    onComposerClear?: () => void
  ): Promise<boolean> => {
    const textToSend = overrideText ?? inputText

    // 统一附件列表里按 kind 分流：
    // 图片走后端 /chat/upload-image（返回 URL，随消息 images 字段引用）；
    // 文档/视频走后端 /chat/attachment（返回 id，随消息 attachmentIds 引用）。
    // 老调用方（images: string[]）仍按原路走，这里与 attachments 里的图片合并。
    const imageUris = [
      ...images,
      ...attachments.filter((a) => a.kind === 'image').map((a) => a.uri),
    ]
    const files = attachments.filter((a) => a.kind !== 'image')
    // 图片附件 → 它在 imageUris / uploadedImageUrls 里的下标。
    // 老调用方的 images: string[] 排在最前，占用的下标没有对应附件对象。
    const imageIndexMap = new Map<PickedAttachment, number>()
    attachments.forEach((a) => {
      if (a.kind === 'image') {
        imageIndexMap.set(a, images.length + imageIndexMap.size)
      }
    })

    // 文字 / 图片 / 附件至少给一样（后端：query 和文件至少要提供一样）
    if (
      !textToSend.trim() &&
      imageUris.length === 0 &&
      files.length === 0
    ) {
      return false
    }

    // 客户端先挡 50MB（后端同口径）：别把超大文件白传一遍再收 400
    const MAX_SEND_FILE = 50 * 1024 * 1024
    const tooBig = files.find((f) => f.size && f.size > MAX_SEND_FILE)
    if (tooBig) {
      MyToast.show(`文件过大，最多 50MB：${tooBig.name || '未命名文件'}`)
      return false
    }

    // 同一时刻只允许一轮流式：先把上一轮彻底中止（语音连发 / 快速连点），
    // 否则两条流共用一个队列会互相串字，旧流的 onload 还会提前结束新一轮
    abortActiveStream()
    const myRun = ++sendRunRef.current
    // 上面的 abortActiveStream 会把标志位置成「不计费」，这里立刻复位；
    // 本轮真被中止/超限/401 时对应的处理路径会再标回去
    sendNotCountedRef.current = false

    let currentActiveId = activeId
    let isBrandNewSession = false

    isAtBottomRef.current = true
    // 原生 inverted：offset 0 = 底部；Web：scrollToEnd
    scrollChatToBottom(scrollViewRef.current, true)

    if (!currentActiveId) {
      try {
        const sessionData: any = await api.createSession()
        currentActiveId = sessionData.id
        setActiveId(currentActiveId)
        isBrandNewSession = true
      } catch (error) {
        console.error('自动创建会话失败:', error)
        return false
      }
    }

    const currentInput = textToSend
    setInputText('')

    // 图片同样「选中即传」：发送时先查缓存 / 复用进行中的请求（useImagePicker 的
    // precache 已预传），没有才现传；任一失败 → 还原输入 + toast，
    // 不再像旧实现（uploadImages 吞错返回短数组）那样静默丢图。
    let uploadedImageUrls: string[] = []
    if (imageUris.length > 0) {
      try {
        for (const img of imageUris) {
          uploadedImageUrls.push(await resolveImageUpload(img))
        }
      } catch (e: any) {
        setInputText(textToSend)
        MyToast.show(e?.message || '图片上传失败，请重试')
        return false
      }
    }

    // 附件在「选中时」已上传（useImagePicker.uploadAttachment → uploadId），
    // 这里只做两件兜底：① 选中时上传失败 / 还没传完 → 现在补传（错误还原输入可重试）；
    // ② 临近后端 30 分钟过期（超过 20 分钟没发）→ 重传刷新 id，避免「附件识别不到」。
    let attachmentIds: string[] = []
    if (files.length > 0) {
      try {
        for (const f of files) {
          const fresh =
            !!f.uploadId &&
            !!f.uploadedAt &&
            Date.now() - f.uploadedAt < 20 * 60 * 1000
          if (fresh) {
            attachmentIds.push(f.uploadId!)
            continue
          }
          const att = await api.uploadChatAttachment({
            name: f.name || '未命名文件',
            uri: f.uri,
            blob: f.blob,
            mime: f.mime
          })
          attachmentIds.push(att.id)
        }
      } catch (e: any) {
        setInputText(textToSend) // 上面已清空输入：失败原样还回去，方便直接重试
        MyToast.show(e?.message || '附件上传失败，请稍后重试')
        return false
      }
    }

    // ✅ 到这里：前置校验（文字/图片/附件都齐了、附件 id 全部拿到）已全部通过，
    //    接下来只剩流式请求。此刻立刻清空输入栏的 chips——不要等吐字结束。
    //    输入文字在上面 setInputText('') 已清；chips 由 onSend 成功回调清。
    //    真正的失败窗口（校验/上传）都在上面 return false 了，不会走到这里，
    //    所以这里清不会吞掉用户的重试机会。
    if (onComposerClear) onComposerClear()

    const userMsg: Message = {
      id: makeId('u'),
      role: 'user',
      content: currentInput,
      images: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
      // 附件回显 + 气泡点击预览：存完整附件对象（Web 靠 File 引用 blob 预览，
      // 别把 data: 大字符串——可达几十 MB——留在消息里；原生存 file:// uri）。
      // 图片也存进同一个数组：气泡渲染走统一的 attachments，不再分流。
      // 图片的本地来源（data:/file://）不入消息，改用本次上传得到的服务端 url。
      attachments: attachments.length
        ? attachments.map((f) => {
            const imageIdx = imageIndexMap.get(f) ?? -1
            return {
              ...f,
              uri: f.blob ? '' : f.uri,
              ...(imageIdx >= 0
                ? {
                    uri: '',
                    url: uploadedImageUrls[imageIdx],
                    // blob 也不能留：Image 渲染改走 url
                    blob: undefined
                  }
                : null)
            }
          })
        : undefined
    }

    const thinkingMsgId = makeId('a')
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      role: 'assistant',
      content: ''
    }

    const currentConv = conversations.find((c: any) => c.id === currentActiveId)
    const isFirst = !currentConv || (currentConv.messages?.length || 0) <= 2

    // 纯附件消息没有输入文本：标题退回第一个附件名，别生成一个 "..." 标题
    const titleBase =
      currentInput.trim() ||
      attachments.find((a) => a.name)?.name ||
      (imageUris.length > 0 ? '图片' : '') ||
      ''
    const updatedTitle =
      isFirst || !currentConv?.title
        ? titleBase.slice(0, 14) + '...'
        : currentConv.title

    setConversations((prev: any) => {
      const existsIndex = prev.findIndex((c: any) => c.id === currentActiveId)

      if (existsIndex !== -1) {
        const targetConv = prev[existsIndex]
        const newConv = {
          ...targetConv,
          title: updatedTitle,
          messages: [...(targetConv.messages || []), userMsg, thinkingMsg]
        }
        const nextPrev = [...prev]
        nextPrev[existsIndex] = newConv
        return nextPrev
      } else {
        return [
          {
            id: currentActiveId,
            title: updatedTitle,
            messages: [userMsg, thinkingMsg]
          },
          ...prev
        ]
      }
    })

    if (isBrandNewSession || updatedTitle) {
      api.updateSessionTitle(currentActiveId, updatedTitle).catch((err) => {
        console.error('更新会话标题失败:', err)
      })
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsGenerating(true)

    try {
      await runTypewriterEffect(
        thinkingMsgId,
        currentActiveId,
        currentInput,
        uploadedImageUrls,
        knowledgeFileIds,
        attachmentIds
      )
    } catch (error: any) {
      // 请求异常这一轮大概率没被服务端计数：标为不计费（真值由下次登录校准）
      sendNotCountedRef.current = true
      if (error.name !== 'AbortError') {
        console.error('发送消息失败:', error)
        updateAiMessageFields(thinkingMsgId, {
          content: '抱歉，服务器开小差了，请检查网络或后端连接。'
        })
      }
    } finally {
      // 已被新一轮 send / 停止按钮接管时，这一轮不许再改共享状态，
      // 否则会把新流的 controller 置空（停止按钮失效）或提前切回「发送」
      if (sendRunRef.current === myRun) {
        setIsGenerating(false)
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        // 正常完成 = 服务端 usedToday+1：
        // 先本地乐观自增让文字立刻动，再拉 /auth/me 真值校准（接口未上线时静默）
        if (!sendNotCountedRef.current) {
          bumpLocalUsage()
          refreshMyDevice()
        }
        Vibration.vibrate(100)
      }
    }
    return true
  }

  // ==================== 停止生成 ====================
  const handleStopGeneration = () => {
    // 让本轮 send 的 finally 失效：状态由下面统一收尾
    sendRunRef.current += 1

    // 1. 先把已经吐出来的内容落盘（abortActiveStream 会清空这些 ref）
    const msgId = currentStreamingMsgIdRef.current
    const hasOutput = !!(currentContentRef.current || currentThoughtRef.current)
    if (msgId && hasOutput) {
      updateAiMessageFields(msgId, {
        thought: currentThoughtRef.current || undefined,
        content: currentContentRef.current || '...'
      })
    }

    // 2. 终止网络请求 + 杀吐字链 + 清队列
    abortActiveStream()

    // 3. 标记「用户中止对话」。一个字都没吐出来时直接把那条占位消息改成标记行，
    //    否则它带着 content:'...' 会被 ChatArea 判成 isThinking → 永久「思考中...」
    if (msgId && !hasOutput) {
      updateAiMessageFields(msgId, {
        content: '-------- 用户中止对话 --------',
        systemNote: true
      })
    } else {
      appendMessage({
        role: 'assistant',
        content: '-------- 用户中止对话 --------',
        systemNote: true
      })
    }
  }

  return {
    conversations,
    activeId,
    currentChat,
    inputText,
    setInputText,
    isGenerating,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleSend,
    handleStopGeneration,
    autoRead,
    setAutoRead,
    toggleAutoRead,
    handleScroll,
    isAtBottomRef,
    scrollViewRef,
    autoFollowRef,
    streamingRenderMsg
  }
}
