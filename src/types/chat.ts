import type { PickedAttachment } from '../hooks/useImagePicker'

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  isStreaming?: boolean;
  /** 系统类标记行（如「用户中止对话」），渲染为居中哥倩文本，不走气泡 */
  systemNote?: boolean;
  images?: string[];
  /**
   * 随消息发送的附件（文档/视频），存完整 PickedAttachment：
   * Web 靠 File 引用（blob）预览、原生靠 file:// uri —— 气泡行点击进 FilePreviewer。
   * 历史会话重载后端不返回该字段，行自然消失（本地会话期内有效）。
   */
  attachments?: PickedAttachment[];
}

export interface ThemeType {
  isDark: boolean;
  textMain: string;
  textMuted: string;
  border: string;
  bubbleUserBg: string;
  bubbleUserText: string;
  bubbleAiBg: string;
  historyActiveText: string;
}

export interface StreamingRenderMsg {
  msgId: string;
  thought: string;
  content: string;
}

export interface ChatAreaProps {
  messages: Message[];
  theme: ThemeType;
  isMobile?: boolean;
  isKeyboardUp?: boolean;
  activeId: string;
  /** 正在拉取当前会话详情：显示加载态，避免先闪欢迎页或旧消息再跳到底部 */
  isHistoryLoading?: boolean;
  streamingRenderMsg?: StreamingRenderMsg | null;
  autoRead?: boolean; // 💡 新增：自动朗读开关
  isDrawerOpen?: boolean; // 抽屉打开时禁用文本选择，防止误触
  /** 驱动 translateY 的键盘高度共享值（UI 线程真实值） */
  keyboardHeightSV?: any;
  /** 键盘进度 0..1（UI 线程），用于补偿底部小字折叠的高度 */
  keyboardProgressSV?: any;
}
