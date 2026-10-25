import 'react-native-gesture-handler';
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
          width: 280,
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
