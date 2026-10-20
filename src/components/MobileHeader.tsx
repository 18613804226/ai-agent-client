import React from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { IconPlus, IconSpeakerOn, IconSpeakerOff } from './Icons'
import { HoverTouchable } from './HoverTouchable'
interface MobileHeaderProps {
  theme: any
  insetsTop: number
  title?: string
  isDrawerOpen: boolean
  onToggleDrawer: () => void
  onNewChat?: () => void // 💡 1. 增加一个新建会话的回调属性
  autoRead: boolean
  onToggleAutoRead: () => void
}

export function MobileHeader({
  theme,
  insetsTop,
  title,
  isDrawerOpen,
  onToggleDrawer,
  onNewChat,
  autoRead, // 💡 接收全局的自动朗读状态
  onToggleAutoRead // 💡 接收切换开关的回调
}: MobileHeaderProps) {
  // 顶部留白：原生端（iOS/Android）都用安全区 insetsTop —— edge-to-edge 下
  // insets.top 即状态栏高度，不加会被状态栏盖住；Web/H5 无状态栏，留 0
  //（原 34 让 H5 头部离顶太远）。
  const topInset = Platform.OS === 'web' ? 0 : insetsTop
  return (
    <View
      style={[
        styles.mobileTopBar,
        {
          backgroundColor: theme.bgSidebar,
          borderColor: theme.border,
          paddingTop: topInset,
          height: 48 + topInset
        }
      ]}
    >
      {/* 左侧：菜单切换按钮 (☰) */}
      <HoverTouchable
        style={styles.menuToggleBtn}
        onPress={onToggleDrawer}
        accessibilityRole="button"
        accessibilityLabel="打开侧边栏"
      >
        <Text style={{ fontSize: 20, color: theme.textMain }}>☰</Text>
      </HoverTouchable>

      {/* 中间：显示当前会话标题（已解开注释并完美适配居中截断） */}
      {/* <Text
        style={[styles.mobileTopTitle, { color: theme.textMain }]}
        numberOfLines={1}
      >
        {title || '新会话'}
      </Text> */}
      <View style={styles.menuToggleBtn}>
        {/* 右侧：新建会话按钮 (+) */}
        <HoverTouchable
          style={{
            borderRadius: 8,
            padding: 4
          }}
          hoverBg={
            theme.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
          }
          rippleColor={
            theme.isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)'
          }
          onPress={onNewChat}
          accessibilityRole="button"
          accessibilityLabel="新建对话"
        >
          <IconPlus
            size={20} // 设置图标大小
            color={theme.textMain} // 设置图标颜色跟随主题
            strokeWidth={2.5} // 设置线条粗细，比文字更清晰
          />
        </HoverTouchable>
        {/* 💡 右侧：自动朗读开关按钮 */}
        <HoverTouchable
          style={[
            {
              backgroundColor: autoRead
                ? 'rgba(29, 161, 242, 0.15)'
                : 'transparent',
              borderRadius: 8,
              marginLeft: 20,
              padding: 4
            }
          ]}
          hoverBg={
            autoRead
              ? 'rgba(29, 161, 242, 0.15)'
              : theme.isDark
                ? 'rgba(255, 255, 255, 0.12)'
                : 'rgba(0, 0, 0, 0.08)'
          }
          rippleColor={
            autoRead
              ? theme.historyActiveText
              : theme.isDark
                ? 'rgba(255, 255, 255, 0.25)'
                : 'rgba(0, 0, 0, 0.15)'
          }
          onPress={onToggleAutoRead}
          accessibilityRole="button"
          accessibilityLabel={autoRead ? '关闭自动朗读' : '开启自动朗读'}
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
        </HoverTouchable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    zIndex: 10
  },
  menuToggleBtn: {
    minWidth: 30,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 4
  },
  mobileTopTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8
  }
})
