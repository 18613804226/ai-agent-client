import 'react-native-gesture-handler';
// 👇 统一使用 JS Stack（expo-router 官方提供）。
//    不用默认的 native Stack 的原因：POP 时路由立即从导航状态移除，React 内容
//    随之卸载，原生只保留空壳做滑出动画（Android 实测"内容先消失、外框再滑出"）。
//    JS Stack 的 StackRouter + CardStack 有 closingRouteKeys 机制：正在退出的页面
//    会保持挂载直到转场结束，卡片连同内容一起侧滑，底层页面同步 parallax 揭示，
//    与 iOS 原生 push/pop 手感一致；且基于 gesture-handler，边缘侧滑返回在
//    Android / iOS 都可用。本项目 headerShown:false、页面轻量，性能完全够用。
import { Stack } from 'expo-router/js-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, useColorScheme } from 'react-native';
import { darkTheme, lightTheme } from '../src/constants/theme';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useChatManager } from '../src/hooks/useChatManager';
import {
  AdminPreviewContext,
  ChatContext,
  ThemeContext,
  type ThemeMode,
} from '../src/context/appContexts';
import { KnowledgeProvider } from '../src/context/KnowledgeProvider';

const THEME_MODE_KEY = 'theme-mode';

export default function RootLayout() {
  const chatManager = useChatManager(); // 👈 整个应用的聊天状态在这里统一托管！
  const systemColorScheme = useColorScheme();
  const [isAdminPreview, setAdminPreview] = useState(false);
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

  // ✅ Web 端同步浏览器底色（html/body 默认白色）：
  //    Stack 侧滑转场的缝隙、iOS 浏览器回弹时都不会再露出白底
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.body.style.backgroundColor = theme.bgApp;
    document.documentElement.style.backgroundColor = theme.bgApp;
  }, [theme.bgApp]);

  // ✅ 稳定的 Context 值，避免主题下游组件不必要地重渲染
  const themeContextValue = useMemo(
    () => ({ isDarkMode, themeMode, setThemeMode, theme }),
    [isDarkMode, themeMode, setThemeMode, theme],
  );

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <AdminPreviewContext.Provider
        value={{ isAdminPreview, setAdminPreview }}
      >
        <ChatContext.Provider value={chatManager}>
          <KnowledgeProvider>
            <SafeAreaProvider>
              <GestureHandlerRootView
                style={{ flex: 1, backgroundColor: theme.bgApp }}
              >
                <StatusBar style={isDarkMode ? 'light' : 'dark'} />
                {/* 👇 根 Stack：聊天主界面（内嵌 Drawer）+ admin 页面。
                    admin 页面通过 push/back 进出，侧滑转场中内容全程保持挂载 */}
                <Stack
                  screenOptions={{
                    headerShown: false,
                    // 侧滑进出场；JS Stack 映射为 SlideFromRightIOS：
                    // 卡片连内容一起滑出，底层页面 parallax 揭示，手势侧滑返回跟手
                    animation: 'slide_from_right',
                    // 卡片内容底色：转场时露出的底不会是白的（JS Stack 选项名是 cardStyle）
                    cardStyle: { backgroundColor: theme.bgApp },
                  }}
                >
                  <Stack.Screen name="(drawer)" />
                  <Stack.Screen name="admin-login" />
                  <Stack.Screen name="admin" />
                </Stack>
              </GestureHandlerRootView>
            </SafeAreaProvider>
          </KnowledgeProvider>
        </ChatContext.Provider>
      </AdminPreviewContext.Provider>
    </ThemeContext.Provider>
  );
}
