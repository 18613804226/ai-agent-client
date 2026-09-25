import React from 'react';
import { View, StyleSheet } from 'react-native';
import Sidebar from './Sidebar';
import { useKnowledgeFiles } from '../hooks/useKnowledgeFiles';

interface MobileDrawerProps {
  theme: any;
  conversations: any[];
  activeId: string;
  isDarkMode: boolean;
  onClose?: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (e: any, id: string) => void;
  onToggleTheme: () => void;
  uploadedFiles: any[];
  onUploadFile: () => void;
  onDeleteFile: (fileId: string) => void;
  [key: string]: any;
}

const DRAWER_WIDTH = 280;

export function MobileDrawer({
  theme,
  conversations,
  activeId,
  isDarkMode,
  onClose,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onToggleTheme,
}: MobileDrawerProps) {
  const { uploadedFiles, handleUploadFile, handleDeleteFile } =
    useKnowledgeFiles();

  return (
    <View
      style={[
        styles.container,
        { borderColor: theme.border, backgroundColor: theme.background },
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
        onToggleTheme={onToggleTheme}
        theme={theme}
        uploadedFiles={uploadedFiles}
        onUploadFile={handleUploadFile}
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
