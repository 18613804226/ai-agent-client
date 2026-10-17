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
  RoleContext,
  ThemeContext,
  type RoleMode,
  type ThemeMode,
} from '../src/context/appContexts';
import { KnowledgeProvider } from '../src/context/KnowledgeProvider';
import { AuthProvider } from '../src/context/AuthProvider';
import { useAuth } from '../src/context/appContexts';
import BootSplash, { BOOT_EXIT_MS } from '../src/components/BootSplash';

const THEME_MODE_KEY = 'theme-mode';

export default function RootLayout() {
  const systemColorScheme = useColorScheme();
  const [isAdminPreview, setAdminPreview] = useState(false);
  const [role, setRole] = useState<RoleMode>('user');
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
        <RoleContext.Provider value={{ role, setRole }}>
        <AuthProvider>
        <AuthGate>
          <ChatHost>
            <SafeAreaProvider>
                <GestureHandlerRootView
                 style={{ flex: 1, backgroundColor: '#FFFFFF' }}
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
          </ChatHost>
        </AuthGate>
        </AuthProvider>
        </RoleContext.Provider>
      </AdminPreviewContext.Provider>
    </ThemeContext.Provider>
  );
}

/**
 * 启动门控：device-login 完成前显示 JS 层品牌启动动效（而不是空白底），
 * 避免无 token 就打会话接口。AuthProvider 必须在外层，useChatManager 的
 * 初始化请求会带上 token。
 *
 * 时序：启动屏**始终**先播完整入场动画，等「动画播完」且「数据 ready」两个条件
 * 都满足才淡出 —— 不能 ready 一就绪就切，那会把入场动画硬生生截断。
 * 内容在 ready 时就已在启动屏下面挂载（预热），淡出结束后卸载启动屏，
 * 不产生「品牌屏 → 白屏 → 内容」的三段跳。
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authed, loginAsDevice } = useAuth();
  const [splashMounted, setSplashMounted] = useState(true);
  const [enterDone, setEnterDone] = useState(false);
  /** 退场许可：入场动画播完 + 数据就绪 */
  const canExit = ready && enterDone;

  const handleEntered = useCallback(() => setEnterDone(true), []);

  React.useEffect(() => {
    if (ready && !authed) loginAsDevice();
  }, [ready, authed, loginAsDevice]);

  React.useEffect(() => {
    if (!canExit) return;
    const id = setTimeout(() => setSplashMounted(false), BOOT_EXIT_MS + 20);
    return () => clearTimeout(id);
  }, [canExit]);

  return (
    <>
      {ready ? children : null}
      {splashMounted ? (
        <BootSplash exiting={canExit} onEntered={handleEntered} />
      ) : null}
    </>
  );
}

/**
 * 聊天状态宿主：挂在 AuthGate 之内，保证 useChatManager 的
 * 初始化会话请求发生在 device-login（token 落盘）之后。
 */
function ChatHost({ children }: { children: React.ReactNode }) {
  const chatManager = useChatManager(); // 👈 整个应用的聊天状态在这里统一托管！
  return (
    <ChatContext.Provider value={chatManager}>
      <KnowledgeProvider>{children}</KnowledgeProvider>
    </ChatContext.Provider>
  );
}
