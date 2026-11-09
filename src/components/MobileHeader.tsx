import React, { memo } from 'react'
import { View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native'
import { Svg, Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { IconPlus, IconSpeakerOn, IconSpeakerOff } from './Icons'
import { HoverTouchable } from './HoverTouchable'
/**
 * 头部下沿的「上实下虚」渐变纱幕（参考 Gemini 的内容淡出）：
 * 紧接头部的上端用**页面背景色**铺实，往下逐级透明，滚到头部下面的文字
 * 会自然淡出，而不是被一条硬边框线切断。
 *
 * ⚠️ 颜色必须用 bgApp（深色 #000 / 浅色 #fff），不能用 theme.border：
 *    边框色在黑底上本来就接近背景，再乘透明度几乎看不见 —— 这是上一版
 *    「不明显」的原因。遮罩要盖住内容，用的是底色本身。
 * 比 Gemini 弱一档：顶端 0.85 不透明度（Gemini 几乎整片压暗）。
 *
 * 「实」的部分只占最顶上一小段，其余高度都留给渐隐：把头部实色区的视觉厚度
 * 收窄、把高度分给纱幕，头部本体高度 48 + inset 保持原值不变（总高度不增加）。
 *
 * ⚠️ 宽度必须用 useWindowDimensions 拿到的**显式像素值**：
 *    position:absolute 的 <Svg> 里 width="100%" 不会解析成父容器宽度，
 *    右边会露一条没被盖住、能透出底下气泡的缝（ChatInputBar.tsx:316 同坑）。
 * 渐变带挂在头部下沿之外（bottom: -FADE_H），头部 zIndex:10 保证盖住聊天内容。
 * 用 SVG 而不是 CSS mask/box-shadow：三端都能跑，且不依赖 RNW 不支持的属性。
 */
const FADE_H = 28

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

export const MobileHeader = memo(function MobileHeader({
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
  const { width: screenW } = useWindowDimensions()
  return (
    <View
      style={[
        styles.mobileTopBar,
        {
          backgroundColor: theme.bgSidebar,
          paddingTop: topInset,
          height: 48 + topInset
        }
      ]}
    >
      {/* 上实下虚：一整片内容淡出纱幕，不画任何边框线（不占布局、不挡点击） */}
      <Svg
        width={screenW}
        height={FADE_H}
        pointerEvents="none"
        style={styles.headerFade}
      >
        <Defs>
          <LinearGradient id="headerFadeDown" x1="0" y1="0" x2="0" y2="1">
            {/* 「实」只占最顶上一小段，剩下的高度都交给渐隐 */}
            <Stop offset="0" stopColor={theme.bgApp} stopOpacity={0.85} />
            <Stop offset="0.14" stopColor={theme.bgApp} stopOpacity={0.62} />
            <Stop offset="0.38" stopColor={theme.bgApp} stopOpacity={0.3} />
            <Stop offset="0.68" stopColor={theme.bgApp} stopOpacity={0.1} />
            <Stop offset="1" stopColor={theme.bgApp} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width={screenW}
          height={FADE_H}
          fill="url(#headerFadeDown)"
        />
      </Svg>

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
})

const styles = StyleSheet.create({
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 10
  },
  headerFade: {
    position: 'absolute',
    left: 0,
    // 宽度不写 right:0 —— Svg 用 screenW 显式像素宽度，避免 absolute 下
    // 「left+right+width」三者争宽度导致右侧留缝
    // 整片纱幕挂在头部下沿**之外**：上沿与头部背景无缝接上，往下淡出到透明
    bottom: -FADE_H,
    height: FADE_H
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
