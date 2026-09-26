import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Pressable,
  ViewStyle,
} from 'react-native';

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

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[
            styles.menuCard,
            {
              backgroundColor: isDarkMode ? '#212225' : '#FFFFFF',
              borderColor: theme.border || '#333',
            },
            positionStyle as ViewStyle, // 💡 允许外部传入精确定位
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                index < items.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border || '#333',
                },
              ]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text
                style={[
                  styles.menuText,
                  { color: theme.textMain || (isDarkMode ? '#fff' : '#000') },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
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
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
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
