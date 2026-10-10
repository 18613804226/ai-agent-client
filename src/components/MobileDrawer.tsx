import React from 'react';
import { View, StyleSheet } from 'react-native';
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
  const { uploadedFiles, handleUploadFile, handleDeleteFile } = useKnowledge();

  return (
    <View
      style={[
        styles.container,
        { borderColor: theme.border, backgroundColor: theme.bgApp },
      ]}
    >
      <Sidebar
        conversations={conversations}
        activeId={activeId}
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: DRAWER_WIDTH,
    height: '100%',
    borderRightWidth: 1,
  },
});
