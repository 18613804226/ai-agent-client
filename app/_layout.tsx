import 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { MobileDrawer } from '../src/components/MobileDrawer';
import { darkTheme, lightTheme } from '../src/constants/theme';
import React, { useState, useMemo, useCallback } from 'react';
import { useChatManager } from '../src/hooks/useChatManager';
import { ChatContext, ThemeContext } from '../src/context/appContexts';
import { KnowledgeProvider } from '../src/context/KnowledgeProvider';

export default function RootLayout() {
  const chatManager = useChatManager(); // 👈 整个应用的聊天状态在这里统一托管！
  const [isDarkMode, setIsDarkMode] = useState(true);

  // ✅ useMemo：避免每次渲染都新建 theme 对象 -> 稳定 Context 值，让下游 memo 生效
  const theme = useMemo(
    () =>
      isDarkMode
        ? { ...darkTheme, isDark: true }
        : { ...lightTheme, isDark: false },
    [isDarkMode],
  );

  const toggleTheme = useCallback(() => setIsDarkMode((prev) => !prev), []);

  // ✅ 稳定的 Context 值（theme / toggleTheme 均已 memo 化）
  const themeContextValue = useMemo(
    () => ({ isDarkMode, toggleTheme, theme }),
    [isDarkMode, toggleTheme, theme],
  );

  return (
    <ThemeContext.Provider value={themeContextValue}>
      {/* 💡 2. 用 ChatContext.Provider 包裹全局 */}
      <ChatContext.Provider value={chatManager}>
        <KnowledgeProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <StatusBar style={isDarkMode ? 'light' : 'dark'} />
            <Drawer
              drawerContent={(props) => (
                <MobileDrawer
                  {...props}
                  theme={theme}
                  conversations={chatManager.conversations}
                  activeId={chatManager.activeId}
                  onClose={() => props.navigation.closeDrawer()}
                  onOpen={() => props.navigation.openDrawer()}
                  onNewChat={chatManager.handleNewChat}
                  onSelectChat={chatManager.handleSelectChat}
                  onDeleteChat={chatManager.handleDeleteChat}
                  isDarkMode={isDarkMode}
                  onToggleTheme={toggleTheme}
                />
              )}
              screenOptions={{
                headerShown: false,
                drawerType: 'slide',
                overlayColor: 'rgba(0, 0, 0, 0.5)',
                swipeMinDistance: 30,
                swipeEdgeWidth: 45,
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
        </KnowledgeProvider>
      </ChatContext.Provider>
    </ThemeContext.Provider>
  );
}
