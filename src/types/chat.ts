export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  isStreaming?: boolean;
  /** 系统类标记行（如「用户中止对话」），渲染为居中哥倩文本，不走气泡 */
  systemNote?: boolean;
  images?: string[];
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
  streamingRenderMsg?: StreamingRenderMsg | null;
  autoRead?: boolean; // 💡 新增：自动朗读开关
  isDrawerOpen?: boolean; // 抽屉打开时禁用文本选择，防止误触
}
