import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { MobileDrawer } from '../../src/components/MobileDrawer';
import { useChat, useTheme } from '../../src/context/appContexts';

/**
 * 聊天主界面的抽屉导航（嵌套在根 Stack 之下）。
 * 聊天页在这里面，抽屉侧滑交互保持不变。
 */
export default function DrawerLayout() {
  const { theme, isDarkMode, themeMode, setThemeMode } = useTheme();
  const {
    conversations,
    activeId,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
  } = useChat();

  return (
    <Drawer
      drawerContent={(props) => (
        <MobileDrawer
          {...props}
          theme={theme}
          conversations={conversations}
          activeId={activeId}
          onClose={() => props.navigation.closeDrawer()}
          onOpen={() => props.navigation.openDrawer()}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          isDarkMode={isDarkMode}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
        />
      )}
      screenOptions={{
        headerShown: false,
        drawerType: 'slide',
        // 遮罩颜色走主题：暗色下用深灰（内容底色也是黑，不加深就分不开抽屉和内容）
        overlayColor: theme.drawerOverlay,
        swipeMinDistance: 30,
        swipeEdgeWidth: 45,
        // 👇 Drawer 场景容器涂上主题底色，Stack 侧滑转场时不会露出白底
        sceneStyle: { backgroundColor: theme.bgApp },
        drawerStyle: {
          // ⚠️ 宽度要分平台给：
          //  · web：给**字符串** '280px'。getDrawerWidthWeb 对字符串原样返回；
          //    而它的默认值是 `min(calc(100% - 56px), 360px)`（百分比）——
          //    一旦没生效就退回百分比，不同浏览器视口宽不同 → 侧边栏宽度不同。
          //  · 原生：必须给**数字** 280。getDrawerWidthNative 对字符串会退回默认值
          //    （334/360），给数字才原样用。
          width: (Platform.OS === 'web' ? '280px' : 280) as any,
          backgroundColor: theme.bgSidebar,
          borderRightColor: 'transparent',
          borderRightWidth: 0,
        },
      }}
    >
      <Drawer.Screen name="index" options={{ title: 'AI 聊天' }} />
    </Drawer>
  );
}
