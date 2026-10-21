import { createContext, useContext } from 'react';
import { darkTheme } from '../constants/theme';
import type { useChatManager } from '../hooks/useChatManager';
import type { useKnowledgeFiles } from '../hooks/useKnowledgeFiles';

/**
 * 全局 Context 定义集中放在这里，避免 app/_layout.tsx 与组件互相 import
 * 形成 require cycle（之前 MobileDrawer / ChatArea 反向 import _layout）。
 */

// 聊天全局 Context（不含流式渲染状态，避免每 token 更新触发整屏重渲染）
export const ChatContext = createContext<Omit<
  ReturnType<typeof useChatManager>,
  'streamingRenderMsg'
> | null>(null);
export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};

// 流式渲染状态独立 Context：只有真正消费它的组件（ChatArea）会因 token 更新重渲染
export const StreamingRenderMsgContext = createContext<ReturnType<
  typeof useChatManager
>['streamingRenderMsg']>(null);
export const useStreamingRenderMsg = () =>
  useContext(StreamingRenderMsgContext);

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

export const AdminPreviewContext = createContext<{
  isAdminPreview: boolean;
  setAdminPreview: (isAdmin: boolean) => void;
}>({
  isAdminPreview: false,
  setAdminPreview: () => {},
});
export const useAdminPreview = () => useContext(AdminPreviewContext);

// 💡 全局角色：user 普通用户 / admin 管理员，默认 user。
// 桌面侧栏与移动抽屉共用同一份状态，切一次两端同步。
// 只有 admin 才露出「管理后台」登录入口。
export type RoleMode = 'user' | 'admin';
export const RoleContext = createContext<{
  role: RoleMode;
  setRole: (role: RoleMode) => void;
}>({
  role: 'user',
  setRole: () => {},
});
export const useRole = () => useContext(RoleContext);

import type { AuthDevice } from '../services/authStore';

// 认证全局 Context：token + 设备信息 + 配额快照
export const AuthContext = createContext<{
  ready: boolean;
  authed: boolean;
  device: AuthDevice | null;
  loginAsDevice: () => Promise<void>;
  loginAsAdmin: (password: string) => Promise<void>;
  /** 免密激活缓存的 admin 会话；true = 已切到 admin，false = 需要去输密码 */
  activateAdmin: () => Promise<boolean>;
  logoutToDevice: () => Promise<void>;
  refreshQuota: () => Promise<void>;
}>({
  ready: false,
  authed: false,
  device: null,
  loginAsDevice: async () => {},
  loginAsAdmin: async () => {},
  activateAdmin: async () => false,
  logoutToDevice: async () => {},
  refreshQuota: async () => {},
});
export const useAuth = () => useContext(AuthContext);

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
