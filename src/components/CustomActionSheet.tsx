import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Pressable,
  ViewStyle,
  Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { PopAnim, POP_CSS_FALLBACK } from './PopAnim';

export interface MenuItem {
  id: string;
  icon: string;
  label: string;
  onPress: () => void;
}

interface CustomActionSheetProps {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
  isDarkMode: boolean;
  theme: any;
  // 💡 新增：支持自定义弹窗相对于 + 号的偏移量
  positionStyle?: {
    bottom?: number | string;
    left?: number | string;
    right?: number | string;
    top?: number | string;
  };
}

export default function CustomActionSheet({
  visible,
  onClose,
  items,
  isDarkMode,
  theme,
  positionStyle,
}: CustomActionSheetProps) {
  if (!visible) return null;

  // ⚠️ WEB hover 高亮：跟随主题（深色提亮 / 浅色加深），跟 HoverTouchable 同一套手感
  const hoverBg = isDarkMode
    ? 'rgba(255, 255, 255, 0.08)'
    : 'rgba(0, 0, 0, 0.05)';

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <PopAnim kind="dialog">
          {(animStyle) => (
            <Animated.View
              style={[
                styles.menuCard,
                {
                  backgroundColor: isDarkMode ? '#212225' : '#FFFFFF',
                  borderColor: theme.border || '#333',
                },
                positionStyle as ViewStyle, // 💡 允许外部传入精确定位
                POP_CSS_FALLBACK,
                animStyle,
              ]}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                {items.map((item, index) => (
                  <SheetMenuItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    textColor={
                      theme.textMain || (isDarkMode ? '#fff' : '#000')
                    }
                    hoverBg={hoverBg}
                    showDivider={index < items.length - 1}
                    dividerColor={theme.border || '#333'}
                    onPress={() => {
                      onClose();
                      item.onPress();
                    }}
                  />
                ))}
              </Pressable>
            </Animated.View>
          )}
        </PopAnim>
      </Pressable>
    </Modal>
  );
}

/**
 * 带 WEB hover 高亮的菜单项：移动端无 hover 无影响，原生端走透明度按压。
 * hover 时整行变色 + 手型指针，过渡 0.15s，跟 HoverTouchable 同手感。
 */
function SheetMenuItem({
  icon,
  label,
  textColor,
  hoverBg,
  showDivider,
  dividerColor,
  onPress,
}: {
  icon: string;
  label: string;
  textColor: string;
  hoverBg: string;
  showDivider: boolean;
  dividerColor: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        showDivider && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: dividerColor,
        },
        Platform.OS === 'web' &&
          ({
            transitionProperty: 'background-color',
            transitionDuration: '0.15s',
            transitionTimingFunction: 'ease',
            cursor: 'pointer',
          } as any),
        Platform.OS === 'web' && hovered && { backgroundColor: hoverBg },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      // @ts-ignore RNW 的鼠标事件
      onMouseEnter={() => setHovered(true)}
      // @ts-ignore RNW 的鼠标事件
      onMouseLeave={() => setHovered(false)}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={[styles.menuText, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuCard: {
    position: 'absolute',
    width: 200,
    borderRadius: 12,
    borderWidth: 1,
    // ⚠️ 卡片上下不留白：hover 高亮要顶满整卡，留 padding 会出现
    // 首尾 4px 不变色的断层，很难看。分隔线顶满也更齐。
    paddingVertical: 0,
    overflow: 'hidden',
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.25)',
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuIcon: {
    fontSize: 15,
    marginRight: 10,
  },
  menuText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
