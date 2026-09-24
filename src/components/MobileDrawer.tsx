import React from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur'; // 💡 这样导入
import Sidebar from './Sidebar';
import { useKnowledgeFiles } from '../hooks/useKnowledgeFiles'; // 💡 引入刚才写的 Hook

interface MobileDrawerProps {
  showOverlay: boolean;
  backdropOpacity: Animated.Value;
  drawerTranslateX: Animated.Value;
  theme: any;
  conversations: any[];
  activeId: string;
  isDarkMode: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (e: any, id: string) => void;
  onToggleTheme: () => void;
  // 💡 加上这三行对应的类型定义
  uploadedFiles: any[];
  onUploadFile: () => void;
  onDeleteFile: (fileId: string) => void;
}

const DRAWER_WIDTH = 280;

// 让 Animated 支持 BlurView 组件
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export function MobileDrawer({
  showOverlay,
  backdropOpacity,
  drawerTranslateX,
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
  if (!showOverlay) return null;
  const { uploadedFiles, handleUploadFile, handleDeleteFile } =
    useKnowledgeFiles();
  return (
    <View style={styles.mobileOverlayContainer}>
      {/* 💡 结合 Animated 实现渐显渐隐的毛玻璃遮罩 */}
      <AnimatedBlurView
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        intensity={90} // 模糊强度 (1-100)
        tint={isDarkMode ? 'dark' : 'light'} // 根据暗黑模式切换毛玻璃色调
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
      </AnimatedBlurView>

      <Animated.View
        style={[
          styles.sidebarMobileDrawer,
          { transform: [{ translateX: drawerTranslateX }] },
          { borderColor: theme.border },
        ]}
      >
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onNewChat={onNewChat}
          onSelectChat={onSelectChat}
          onDeleteChat={onDeleteChat}
          isDarkMode={isDarkMode}
          onToggleTheme={onToggleTheme}
          theme={theme}
          uploadedFiles={uploadedFiles}
          onUploadFile={handleUploadFile}
          onDeleteFile={handleDeleteFile}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  sidebarMobileDrawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DRAWER_WIDTH,
    height: '100%',
    borderRightWidth: 1,
    zIndex: 11,
  },
});
