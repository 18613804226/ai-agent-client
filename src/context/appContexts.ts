import { createContext, useContext } from 'react';
import { darkTheme } from '../constants/theme';
import type { useChatManager } from '../hooks/useChatManager';
import type { useKnowledgeFiles } from '../hooks/useKnowledgeFiles';

/**
 * 全局 Context 定义集中放在这里，避免 app/_layout.tsx 与组件互相 import
 * 形成 require cycle（之前 MobileDrawer / ChatArea 反向 import _layout）。
 */

// 聊天全局 Context
export const ChatContext = createContext<ReturnType<
  typeof useChatManager
> | null>(null);
export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};

export type ThemeMode = 'light' | 'dark' | 'system';

// 主题 Context
export const ThemeContext = createContext<{
  isDarkMode: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  theme: typeof darkTheme;
}>({
  isDarkMode: true,
  themeMode: 'dark',
  setThemeMode: () => {},
  theme: darkTheme,
});
export const useTheme = () => useContext(ThemeContext);

// 知识库全局 Context：桌面侧栏 / 移动抽屉 / 发送逻辑共用同一份文件状态与上传进度
export const KnowledgeContext = createContext<ReturnType<
  typeof useKnowledgeFiles
> | null>(null);
export const useKnowledge = () => {
  const context = useContext(KnowledgeContext);
  if (!context)
    throw new Error('useKnowledge must be used within a KnowledgeProvider');
  return context;
};
