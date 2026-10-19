import 'react-native-gesture-handler';
// 👇 统一使用 JS Stack（expo-router 官方提供）。
//    不用默认的 native Stack 的原因：POP 时路由立即从导航状态移除，React 内容
//    随之卸载，原生只保留空壳做滑出动画（Android 实测"内容先消失、外框再滑出"）。
//    JS Stack 的 StackRouter + CardStack 有 closingRouteKeys 机制：正在退出的页面
//    会保持挂载直到转场结束，卡片连同内容一起侧滑，底层页面同步 parallax 揭示，
//    与 iOS 原生 push/pop 手感一致；且基于 gesture-handler，边缘侧滑返回在
//    Android / iOS 都可用。本项目 headerShown:false、页面轻量，性能完全够用。
import { Stack } from 'expo-router/js-stack';
import { usePathname } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, useColorScheme, Text, View } from 'react-native';
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
import { diag } from '../src/devDiag';

const THEME_MODE_KEY = 'theme-mode';

// TEMP DIAG（定位后删除）：记录 RootLayout 挂载次数
let __diagBootCount = 0;

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

  // ✅ Web：锁死视口，禁止整页滚动（含切到 admin 再切回后 body 被撑高的情况）。
  //    expo-router 的 Stack（CardContent）在触屏 H5 会注入 viewport-fix <style>：
  //    body { height: calc(var(--vh, 1vh) * 100) }。--vh 在地址栏伸缩 / goBack 后
  //    可能没及时重算 → body 偏高，<html> 随之冒出滚动条（chat 虽 position:fixed，
  //    但 html/body 的滚动条仍会出现）。
  //    这里注入一条 !important 样式，把 html 与 body 的高度=100%、overflow=hidden 钉死：
  //    - 优先级高于上面那条 <style>（其未写 !important），也压过任何临时 inline
  //      overflow:auto；html 的 overflow 一并 hidden，消除 <html> 滚动条。
  //    admin / chat 页都用内部 ScrollView，不依赖 body 滚动，故安全。
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = 'app-viewport-lock';
    const el =
      (document.getElementById(id) as HTMLStyleElement | null) ??
      document.createElement('style');
    el.id = id;
    el.textContent =
      'html, body { height: 100% !important; overflow: hidden !important; margin: 0 !important; }';
    if (!el.parentElement) document.head.appendChild(el);
  }, []);

  // ✅ 离开 admin 登录页（页面内按钮 / 侧滑 / Android 系统返回手势都算）→ 复位 admin 选中态。
  //    H5 上「系统返回手势」是浏览器级 back，常常不会卸载 admin-login 这个 screen，
  //    只靠组件卸载清理会漏（页面内按钮能跑、手势跑不到）。
  //    这里改用「路由变化」判断：从 /admin-login 切到非 /admin 路由 = 返回聊天 → 复位。
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev?.startsWith('/admin-login') && !pathname.startsWith('/admin')) {
      diag.lastSet = 'layoutPathReset';
      setAdminPreview(false);
      setRole('user');
    }
  }, [pathname]);

  // TEMP DIAG（定位后删除）：挂载序号 + role/adminPreview 变更计数
  const [diagBootId] = useState(() => {
    __diagBootCount += 1;
    return __diagBootCount;
  });
  const diagChangeRef = useRef(0);
  useEffect(() => {
    diagChangeRef.current += 1;
  }, [role, isAdminPreview]);

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
                {/* TEMP DIAG（定位后删除）：显示 role / adminPreview / 路由 / 启动次数 / 变更次数 */}
                {Platform.OS === 'web' && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      zIndex: 99999,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      backgroundColor: 'rgba(0,0,0,0.8)',
                    }}
                  >
                    <Text style={{ color: '#0f0', fontSize: 11 }}>
                      {`role=${role} prev=${isAdminPreview ? 1 : 0} path=${pathname} boot=${diagBootId} chg=${diagChangeRef.current} src=${diag.lastSet}`}
                    </Text>
                  </View>
                )}
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
