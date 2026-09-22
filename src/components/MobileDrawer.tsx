import React from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import Sidebar from './Sidebar';

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
}

const DRAWER_WIDTH = 280;

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

  return (
    <View style={styles.mobileOverlayContainer}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>
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
    zIndex: 999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1000,
  },
  sidebarMobileDrawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DRAWER_WIDTH,
    height: '100%',
    borderRightWidth: 1,
    zIndex: 1001,
  },
});
