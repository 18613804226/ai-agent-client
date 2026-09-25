import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { IconPlus, IconSpeakerOn, IconSpeakerOff } from './Icons';
interface MobileHeaderProps {
  theme: any;
  insetsTop: number;
  title?: string;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  onNewChat?: () => void; // 💡 1. 增加一个新建会话的回调属性
  autoRead: boolean;
  onToggleAutoRead: () => void;
}

export function MobileHeader({
  theme,
  insetsTop,
  title,
  isDrawerOpen,
  onToggleDrawer,
  onNewChat,
  autoRead, // 💡 接收全局的自动朗读状态
  onToggleAutoRead, // 💡 接收切换开关的回调
}: MobileHeaderProps) {
  return (
    <View
      style={[
        styles.mobileTopBar,
        {
          backgroundColor: theme.bgSidebar,
          borderColor: theme.border,
          paddingTop: Platform.OS === 'ios' ? insetsTop : 34,
          height: 48 + (Platform.OS === 'ios' ? insetsTop : 34),
        },
      ]}
    >
      {/* 左侧：菜单切换按钮 (☰) */}
      <TouchableOpacity style={styles.menuToggleBtn} onPress={onToggleDrawer}>
        <Text style={{ fontSize: 20, color: theme.textMain }}>☰</Text>
      </TouchableOpacity>

      {/* 中间：显示当前会话标题（已解开注释并完美适配居中截断） */}
      {/* <Text
        style={[styles.mobileTopTitle, { color: theme.textMain }]}
        numberOfLines={1}
      >
        {title || '新会话'}
      </Text> */}
      <View style={styles.menuToggleBtn}>
        {/* 右侧：新建会话按钮 (+) */}
        <TouchableOpacity onPress={onNewChat}>
          <IconPlus
            size={20} // 设置图标大小
            color={theme.textMain} // 设置图标颜色跟随主题
            strokeWidth={2.5} // 设置线条粗细，比文字更清晰
          />
        </TouchableOpacity>
        {/* 💡 右侧：自动朗读开关按钮 */}
        <TouchableOpacity
          style={[
            {
              backgroundColor: autoRead
                ? 'rgba(29, 161, 242, 0.15)'
                : 'transparent',
              borderRadius: 8,
              marginLeft: 5,
              padding: 4,
            },
          ]}
          onPress={onToggleAutoRead}
        >
          <View>
            {autoRead ? (
              <IconSpeakerOn
                size={20}
                strokeWidth={3}
                color={theme.historyActiveText}
              />
            ) : (
              <IconSpeakerOff
                size={20}
                strokeWidth={3}
                color={theme.textMuted}
              />
            )}
          </View>
        </TouchableOpacity>
      </View>
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
  menuToggleBtn: {
    minWidth: 30,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 4,
  },
  mobileTopTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
});
