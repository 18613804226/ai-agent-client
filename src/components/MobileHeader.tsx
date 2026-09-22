import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';

interface MobileHeaderProps {
  theme: any;
  insetsTop: number;
  title: string;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
}

export function MobileHeader({
  theme,
  insetsTop,
  title,
  isDrawerOpen,
  onToggleDrawer,
}: MobileHeaderProps) {
  return (
    <View
      style={[
        styles.mobileTopBar,
        {
          backgroundColor: theme.bgSidebar,
          borderColor: theme.border,
          paddingTop: Platform.OS === 'ios' ? insetsTop : 24,
          height: 48 + (Platform.OS === 'ios' ? insetsTop : 24),
        },
      ]}
    >
      <TouchableOpacity style={styles.menuToggleBtn} onPress={onToggleDrawer}>
        <Text style={{ fontSize: 18, color: theme.textMain }}>☰</Text>
      </TouchableOpacity>
      <Text
        style={[styles.mobileTopTitle, { color: theme.textMain }]}
        numberOfLines={1}
      >
        {title || '加载中...'}
      </Text>
      <View style={{ width: 30 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  menuToggleBtn: { padding: 6 },
  mobileTopTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
});
