import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useDrawerStatus } from 'expo-router/drawer';
import Sidebar from './Sidebar';
import { useKnowledge } from '../context/appContexts';
import type { ThemeMode } from '../context/appContexts';

interface MobileDrawerProps {
  theme: any;
  conversations: any[];
  activeId: string;
  isDarkMode: boolean;
  themeMode: ThemeMode;
  onClose?: () => void;
  onOpen?: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (e: any, id: string) => void;
  onThemeModeChange: (mode: ThemeMode) => void;
  [key: string]: any;
}

const DRAWER_WIDTH = 280;

export function MobileDrawer({
  theme,
  conversations,
  activeId,
  isDarkMode,
  themeMode,
  onClose,
  onOpen,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onThemeModeChange,
}: MobileDrawerProps) {
  const {
    uploadedFiles,
    handleUploadFile,
    handleDeleteFile,
    toggleKnowledgeFileEnabled,
  } = useKnowledge();

  // ⚠️ 抽屉开合状态直传 Sidebar：关闭时它内部把长按菜单/二次确认一起收掉，
  // 否则 Drawer 只滑走不卸载，下次打开弹窗还飘在那。
  const drawerOpen = useDrawerStatus() === 'open';

  return (
    <View
      // 📱 H5：给侧边栏根挂个 class，供 _layout 注入的 CSS 压住长按 callout 菜单
      //    （RNW 不支持 -webkit-touch-callout，样式表里写没用；className 走 style 透传）
      style={[
        styles.container,
        {
          borderColor: theme.border,
          backgroundColor: theme.bgSidebar,
          className: 'mobile-sidebar',
        } as any,
      ]}
    >
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        drawerOpen={drawerOpen}
        onCloseDrawer={onClose}
        onNewChat={() => {
          onNewChat();
          onClose?.(); // 💡 点击新建聊天后自动收起抽屉
        }}
        onSelectChat={(id) => {
          onSelectChat(id);
          onClose?.(); // 💡 点击会话后自动收起抽屉
        }}
        onDeleteChat={onDeleteChat}
        isDarkMode={isDarkMode}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        theme={theme}
        uploadedFiles={uploadedFiles}
        onUploadFile={() => {
          // 关键：先让抽屉「正常」关闭，等关闭动画结束后再拉起系统文件选择器。
          // 如果选择器在抽屉打开（手势进行中）时打开，会打断抽屉的手势，
          // 导致抽屉被顶掉且之后无法再划开。
          // 选择器返回后，再用 onOpen 把抽屉恢复到打开状态。
          onClose?.();
          setTimeout(() => {
            handleUploadFile(() => onOpen?.());
          }, 320);
        }}
        onDeleteFile={handleDeleteFile}
        onToggleFileEnabled={toggleKnowledgeFileEnabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: DRAWER_WIDTH,
    height: '100%',
    // ⚠️ 不要在这里加 borderRightWidth：`_layout.tsx` 的 drawerStyle 已经显式
    //    关掉抽屉右边框（borderRightWidth: 0），这里再画 1px 会让它「关不掉」，
    //    暗色主题下表现为侧栏收起时的竖直拖影。
    borderRightWidth: 0,
  },
});
