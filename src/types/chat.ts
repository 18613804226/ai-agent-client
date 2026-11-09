import type { PickedAttachment } from '../hooks/useImagePicker'
import type { ChatSource } from '../utils/citations'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thought?: string
  isStreaming?: boolean
  /** 系统类标记行（如「用户中止对话」），渲染为居中哥倩文本，不走气泡 */
  systemNote?: boolean
  images?: string[]
  /**
   * 随消息发送的附件（文档/视频），存完整 PickedAttachment：
   * Web 靠 File 引用（blob）预览、原生靠 file:// uri —— 气泡行点击进 FilePreviewer。
   * 历史会话重载后端不返回该字段，行自然消失（本地会话期内有效）。
   */
  attachments?: PickedAttachment[]
  /** 本轮消耗的 token 数（来自服务端 done 事件；total_tokens，含输入） */
  tokens?: number
  /** 本轮耗时（毫秒，客户端从发送到流结束计时，含打字机逐字揭示时间） */
  durationMs?: number
  /** 服务端 done：本轮实际使用的模型（降级后为降级目标）。
   *  APP / H5 的 thinking 已禁用，这里是唯一能看到模型名的地方 */
  model?: string
  /** 服务端 done：生成 token 数（不含输入，含思考），算生成速度的分子 */
  completionTokens?: number
  /**
   * 服务端 done：输入 token 数（系统提示 + 历史 + 检索结果 + 本轮问题）。
   * 新后端直接给；老后端没有时用 `tokens − completionTokens` 倒推。
   */
  inputTokens?: number
  /**
   * 服务端 done：输出里「思考」占的 token。
   * 新后端直接给；没有时按思考/正文的字符权重把 completionTokens 分摊掉。
   */
  reasoningTokens?: number
  /**
   * 服务端 done：**正文**第一个 token 的延迟（ms）。
   * t/s 的分母要用它 —— ttftMs 可能是「思考首字」，拿它减会把思考那几秒
   * 算进正文生成时间，速度被明显压低。
   */
  firstAnswerTokenMs?: number
  /** 服务端 done：命中 prompt cache 的输入 token；上游没上报时不存在 */
  cachedTokens?: number
  /** 服务端 done：思考阶段耗时（首末思考 chunk 间隔，ms）；没有时为 null */
  thoughtDurationMs?: number | null
  /**
   * 服务端 done：正文阶段耗时（首末正文 chunk 间隔，ms）。
   * 这是 t/s 最准确的分母 —— 已经剔掉了思考与工具调用占用的时间。
   */
  answerDurationMs?: number | null
  /** 服务端 done：结束原因 stop / length / tool_calls / content_filter */
  finishReason?: string
  /** 服务端 done：是否被长度上限截断 */
  truncated?: boolean
  /** 服务端 done：首字延迟 ms（含 RAG 检索）；没出字为 null */
  ttftMs?: number | null
  /** 服务端 done：本轮总耗时 ms。刻意不叫 durationMs —— 客户端已有同名自算值，
   *  两者口径不同，同名会互相覆盖并让 t/s 算错 */
  serverDurationMs?: number
  /** 服务端 done：本轮引用来源条数（含知识库来源，不能用来判断有没有可点角标） */
  sourcesCount?: number
  /**
   * 本轮引用来源明细：实时流来自 `sources` 帧，历史回显来自 `messages[].sources`。
   * 只有 kind==='web' 且带 url/index 的项会变成正文 [n] 可点角标。
   */
  sources?: ChatSource[]
  /** 服务端 done：本轮带入上下文的历史消息条数 */
  historyKept?: number
  /** 服务端 done：被上下文窗口裁掉的历史条数 */
  historyDropped?: number
  /** 服务端 done：是否启用滚动摘要（上下文压缩） */
  digestUsed?: boolean
}

export interface ThemeType {
  isDark: boolean
  textMain: string
  textMuted: string
  border: string
  bubbleUserBg: string
  bubbleUserText: string
  bubbleAiBg: string
  historyActiveText: string
}

export interface StreamingRenderMsg {
  msgId: string
  thought: string
  content: string
}

export interface ChatAreaProps {
  messages: Message[]
  theme: ThemeType
  isMobile?: boolean
  isKeyboardUp?: boolean
  activeId: string
  /** 正在拉取当前会话详情：显示加载态，避免先闪欢迎页或旧消息再跳到底部 */
  isHistoryLoading?: boolean
  streamingRenderMsg?: StreamingRenderMsg | null
  autoRead?: boolean // 💡 新增：自动朗读开关
  isDrawerOpen?: boolean // 抽屉打开时禁用文本选择，防止误触
  /** 驱动 translateY 的键盘高度共享值（UI 线程真实值） */
  keyboardHeightSV?: any
  /** 键盘进度 0..1（UI 线程），用于补偿底部小字折叠的高度 */
  keyboardProgressSV?: any
  /**
   * 输入栏悬浮层高度（px）。列表内容一直铺到屏幕底边（不再给悬浮层预留位置），
   * 所以悬浮元素（如「回到底部」按钮）要自己抬高到这个高度之上才不会被遮住。
   */
  bottomInset?: number
  /** 作为 FlashList 底部内容占位的悬浮栏高度，不改变列表视口尺寸。 */
  bottomContentInset?: number
}
