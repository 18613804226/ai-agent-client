import 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { MobileDrawer } from '../src/components/MobileDrawer';
import { darkTheme, lightTheme } from '../src/constants/theme';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useChatManager } from '../src/hooks/useChatManager';
import {
  ChatContext,
  ThemeContext,
  type ThemeMode,
} from '../src/context/appContexts';
import { KnowledgeProvider } from '../src/context/KnowledgeProvider';

const THEME_MODE_KEY = 'theme-mode';

export default function RootLayout() {
  const chatManager = useChatManager(); // 👈 整个应用的聊天状态在这里统一托管！
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const userChangedTheme = useRef(false);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((savedMode) => {
        if (
          isMounted &&
          !userChangedTheme.current &&
          (savedMode === 'light' ||
            savedMode === 'dark' ||
            savedMode === 'system')
        ) {
          setThemeModeState(savedMode);
        }
      })
      .catch((error) => {
        console.error('Failed to load theme preference:', error);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    userChangedTheme.current = true;
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode).catch((error) => {
      console.error('Failed to save theme preference:', error);
    });
  }, []);

  const isDarkMode =
    themeMode === 'system'
      ? systemColorScheme !== 'light'
      : themeMode === 'dark';

  // ✅ useMemo：避免每次渲染都新建 theme 对象 -> 稳定 Context 值，让下游 memo 生效
  const theme = useMemo(
    () =>
      isDarkMode
        ? { ...darkTheme, isDark: true }
        : { ...lightTheme, isDark: false },
    [isDarkMode],
  );

  // ✅ 稳定的 Context 值，避免主题下游组件不必要地重渲染
  const themeContextValue = useMemo(
    () => ({ isDarkMode, themeMode, setThemeMode, theme }),
    [isDarkMode, themeMode, setThemeMode, theme],
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
                  themeMode={themeMode}
                  onThemeModeChange={setThemeMode}
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
