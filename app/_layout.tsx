import { Platform } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { MobileDrawer } from '../src/components/MobileDrawer';
import { darkTheme, lightTheme } from '../src/constants/theme';
import React, { useState, createContext, useContext } from 'react';
import { useChatManager } from '../src/hooks/useChatManager';
import { useKnowledgeFiles } from '../src/hooks/useKnowledgeFiles';

// 💡 1. 定义聊天全局 Context
const ChatContext = createContext<ReturnType<typeof useChatManager> | null>(
  null,
);
export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};

// 主题 Context 保持不变
export const ThemeContext = createContext({
  isDarkMode: true,
  toggleTheme: () => {},
  theme: darkTheme,
});
export const useTheme = () => useContext(ThemeContext);

export default function RootLayout() {
  const chatManager = useChatManager(); // 👈 整个应用的聊天状态在这里统一托管！
  const { uploadedFiles, handleUploadFile, handleDeleteFile } =
    useKnowledgeFiles();
  const [isDarkMode, setIsDarkMode] = useState(true);

  const theme = isDarkMode
    ? { ...darkTheme, isDark: true }
    : { ...lightTheme, isDark: false };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme }}>
      {/* 💡 2. 用 ChatContext.Provider 包裹全局 */}
      <ChatContext.Provider value={chatManager}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style={isDarkMode ? 'light' : 'dark'} />
          <Drawer
            drawerContent={(props) => (
              <MobileDrawer
                {...props}
                theme={theme}
                conversations={chatManager.conversations}
                activeId={chatManager.activeId}
                onNewChat={chatManager.handleNewChat}
                onSelectChat={chatManager.handleSelectChat}
                onDeleteChat={chatManager.handleDeleteChat}
                isDarkMode={isDarkMode}
                onToggleTheme={toggleTheme}
                uploadedFiles={uploadedFiles}
                onUploadFile={handleUploadFile}
                onDeleteFile={handleDeleteFile}
              />
            )}
            screenOptions={{
              headerShown: false,
              drawerType: 'slide',
              overlayColor: 'rgba(0, 0, 0, 0.5)',
              drawerStyle: {
                width: 280,
                backgroundColor: theme.bgSidebar,
                borderRightColor: 'transparent',
                borderRightWidth: 0,
              },
            }}
          >
            <Drawer.Screen name="index" options={{ title: 'AI 聊天' }} />
          </Drawer>
        </GestureHandlerRootView>
      </ChatContext.Provider>
    </ThemeContext.Provider>
  );
}
