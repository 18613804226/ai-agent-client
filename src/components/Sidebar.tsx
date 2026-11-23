import React, { useState, useRef, useEffect } from 'react'
import {
  Text,
  View,
  ScrollView,
  Platform,
  useWindowDimensions,
  Vibration
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { useRouter } from 'expo-router'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import type { UploadedFile } from '../hooks/useKnowledgeFiles'
import { isPCWebWidth, SEMANTIC_COLORS } from '../constants/theme'
import type { ThemeMode, RoleMode } from '../context/appContexts'
import { useAuth, useRole } from '../context/appContexts'
import { MyToast } from './GlobalToast'
import HoverTouchable from './HoverTouchable'
import { IconPlus } from './Icons'
import { InputBarIcon } from './InputBarIcon'
import { attachCalloutSuppress } from '../hooks/useSuppressBrowserCallout'
import { sidebarStyles, SECTION_NO_CALLOUT_STYLE } from './sidebar/sidebarStyles'
import { FileEnabledSwitch } from './sidebar/FileEnabledSwitch'
import { SegmentedControl, type SegmentedOption } from './sidebar/SegmentedControl'
import {
  SidebarLongPressItem,
  measureWindowPos
} from './sidebar/SidebarLongPressItem'
import {
  FileActionSheet,
  ConversationActionSheet
} from './sidebar/ActionSheets'
import {
  ConfirmDeleteDialog,
  ConfirmDeleteConversationDialog
} from './sidebar/ConfirmDialogs'

/**
 * Subtle breathing cyan ambient corner spot for the desktop Web permanent sidebar.
 * Rendered only when `isPCWeb` is true so mobile drawer visuals stay unchanged.
 */
function SidebarCornerGlow({ isDarkMode }: { isDarkMode: boolean }) {
  const breathe = useSharedValue(0)

  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, {
        duration: 8000,
        easing: Easing.inOut(Easing.sin)
      }),
      -1,
      true
    )

    return () => {
      cancelAnimation(breathe)
    }
  }, [breathe])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.72, 1]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1, 1.08]) }]
  }))

  const webGlowStyle =
    Platform.OS === 'web'
      ? ({
          backgroundImage: isDarkMode
            ? 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, rgba(56, 189, 248, 0.04) 46%, transparent 72%)'
            : 'radial-gradient(circle, rgba(56, 189, 248, 0.10) 0%, rgba(56, 189, 248, 0.03) 46%, transparent 72%)',
          filter: 'blur(30px)'
        } as any)
      : {
          backgroundColor: isDarkMode
            ? 'rgba(56, 189, 248, 0.08)'
            : 'rgba(56, 189, 248, 0.06)'
        }

  return (
    <Animated.View
      pointerEvents="none"
      style={[sidebarStyles.cornerGlow, webGlowStyle, animatedStyle]}
    />
  )
}

/** 今日额度进度条：宽度变化时做平滑过渡 */
function AnimatedQuotaBar({
  percent,
  color,
  trackBg
}: {
  percent: number
  color: string
  trackBg: string
}) {
  const fillSV = useSharedValue(percent)
  const trackW = useSharedValue(0)

  useEffect(() => {
    fillSV.value = withTiming(percent, {
      duration: 420,
      easing: Easing.out(Easing.cubic)
    })
    return () => cancelAnimation(fillSV)
  }, [percent, fillSV])

  const fillStyle = useAnimatedStyle(() => {
    const clamped = Math.max(0, Math.min(100, fillSV.value))
    return {
      width:
        trackW.value > 0
          ? (trackW.value * clamped) / 100
          : (`${clamped}%` as `${number}%`)
    }
  })

  return (
    <View
      style={[sidebarStyles.quotaBarTrack, { backgroundColor: trackBg }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        if (w > 0) trackW.value = w
      }}
    >
      <Animated.View
        style={[
          sidebarStyles.quotaBarFill,
          { backgroundColor: color },
          fillStyle
        ]}
      />
    </View>
  )
}

/** 数字变化时做轻量的上下滚动切换，初始挂载直接静止展示 */
function RollingNumber({ value, color }: { value: number; color: string }) {
  const prevRef = useRef(value)
  const [prev, setPrev] = useState<number | null>(null)
  const [dir, setDir] = useState<1 | -1>(1)
  const progress = useSharedValue(1)

  useEffect(() => {
    if (prevRef.current === value) return
    const oldVal = prevRef.current
    prevRef.current = value
    setPrev(oldVal)
    setDir(value >= oldVal ? 1 : -1)
    progress.value = 0
    progress.value = withTiming(1, {
      duration: 280,
      easing: Easing.out(Easing.cubic)
    })
    const timer = setTimeout(() => setPrev(null), 300)
    return () => {
      clearTimeout(timer)
      cancelAnimation(progress)
    }
  }, [value, progress])

  const curStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 9 * dir }]
  }))

  const oldStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -progress.value * 9 * dir }]
  }))

  return (
    <View style={sidebarStyles.rollingNumWrap}>
      {prev !== null ? (
        <Animated.Text
          style={[
            sidebarStyles.quotaText,
            sidebarStyles.rollingNumPrev,
            { color },
            oldStyle
          ]}
        >
          {prev}
        </Animated.Text>
      ) : null}
      <Animated.Text style={[sidebarStyles.quotaText, { color }, curStyle]}>
        {value}
      </Animated.Text>
    </View>
  )
}

const ROLE_OPTIONS: readonly SegmentedOption<RoleMode>[] = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' }
]

const THEME_OPTIONS: readonly SegmentedOption<ThemeMode>[] = [
  { value: 'light', label: '浅色', accessibilityLabel: '浅色模式' },
  { value: 'dark', label: '深色', accessibilityLabel: '深色模式' },
  { value: 'system', label: '跟随系统', accessibilityLabel: '跟随系统模式' }
]

interface SidebarProps {
  conversations: any[]
  activeId: string
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (e: any, id: string) => void
  isDarkMode: boolean
  themeMode: ThemeMode
  onThemeModeChange: (mode: ThemeMode) => void
  theme: any
  uploadedFiles: UploadedFile[]
  onUploadFile: () => void
  onDeleteFile: (id: string) => void
  onToggleFileEnabled: (id: string, enabled: boolean) => void
  /**
   * ⚠️ 抽屉开合状态（移动端抽屉场景由 MobileDrawer 传入，桌面常驻侧边栏不传）：
   * 抽屉关闭时把长按菜单/二次确认一起收掉，否则下次打开弹窗还飘在那。
   */
  drawerOpen?: boolean
  /** 移动端：离开聊天页前先收起抽屉，避免 admin 返回时先关到底层抽屉 */
  onCloseDrawer?: () => void
}

export default function Sidebar({
  conversations,
  activeId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isDarkMode,
  themeMode,
  onThemeModeChange,
  theme,
  uploadedFiles,
  onUploadFile,
  onDeleteFile,
  onToggleFileEnabled,
  drawerOpen,
  onCloseDrawer
}: SidebarProps) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const router = useRouter()
  // 💡 全局角色：紧凑分段器切换，admin 才显示「管理后台」入口。
  const { role } = useRole()
  const { device, logoutToDevice, activateAdmin } = useAuth()
  // 乐观反馈：点 Admin/User 立刻高亮该段，网络（verifyAdminToken）+ AsyncStorage 返回后
  // 再确认；失败则清空 pending 回滚到真实 role。避免移动端那一下「顿」。
  const [pendingRole, setPendingRole] = useState<RoleMode | null>(null)
  const effectiveRole = pendingRole ?? role
  // 📱 记录每个文件项的 ref，用于长按时测量实际屏幕坐标
  const fileItemRefs = useRef<Record<string, any>>({})
  // 📱 记录每个对话项的 ref
  const convItemRefs = useRef<Record<string, any>>({})
  // 侧边栏根容器 ref，用于把菜单坐标换算到根容器坐标系
  const sidebarRef = useRef<any>(null)
  // 📱 H5/OPPO：两个列表区块的容器级长按压制 ref（只拦浏览器菜单，不影响滚动）
  const fileSectionRef = useRef<any>(null)
  const historySectionRef = useRef<any>(null)

  // 🖥️ 与 app/index.tsx 保持一致的三端判断：仅电脑端网页保留 X 删除
  const isPCWeb = Platform.OS === 'web' && isPCWebWidth(width)

  // 📱 H5/OPPO：给「已上传文件」「最近记录」区块挂容器级长按压制——区块内
  // 长按（标题/条目/空白处）不再弹浏览器系统菜单；只拦菜单、不改样式，不影响滚动。
  // uploadedFiles 是条件渲染：区块节点出现/清空时 ref 会挂/卸，故依赖带上它。
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const offFiles = attachCalloutSuppress(fileSectionRef.current)
    const offHistory = attachCalloutSuppress(historySectionRef.current)
    return () => {
      offFiles?.()
      offHistory?.()
    }
  }, [uploadedFiles])

  // 长按操作菜单（文件）
  const [menu, setMenu] = useState<{
    file: UploadedFile
    x: number
    y: number
    rootW: number
    rootH: number
  } | null>(null)
  const [confirmFile, setConfirmFile] = useState<UploadedFile | null>(null)

  // 长按操作菜单（对话）
  const [convMenu, setConvMenu] = useState<{
    conversation: { id: string; title: string }
    x: number
    y: number
    rootW: number
    rootH: number
  } | null>(null)
  const [confirmConv, setConfirmConv] = useState<{
    id: string
    title: string
  } | null>(null)

  // 🖥️ PC 端悬停反馈（仅 isPCWeb 使用，移动端不挂 mouse 事件避免触屏粘滞）
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null)
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null)

  // ⚠️ 抽屉关闭时把长按菜单/二次确认一起收掉：
  // Drawer 关闭不会卸载 Sidebar（状态全留在内存），不清理的话下次打开弹窗还飘在那。
  // 桌面常驻侧边栏不传 drawerOpen（undefined），这里直接跳过不影响。
  useEffect(() => {
    if (drawerOpen === false) {
      setMenu(null)
      setConvMenu(null)
      setConfirmFile(null)
      setConfirmConv(null)
      setHoveredConvId(null)
      setHoveredFileId(null)
    }
  }, [drawerOpen])

  // 统一的删除入口：先关掉菜单，再弹二次确认
  const requestDeleteFile = (file: UploadedFile) => {
    setMenu(null)
    setConfirmFile(file)
  }

  const requestDeleteConversation = (conversation: {
    id: string
    title: string
  }) => {
    setConvMenu(null)
    setConfirmConv(conversation)
  }

  // 📱 长按某文件项：在手指当前位置打开操作菜单
  // offsetX/offsetY 为触摸点相对文件项左上角的偏移
  const openMenuAtFile = (
    file: UploadedFile,
    offsetX: number,
    offsetY: number
  ) => {
    // 长按弹出菜单时给一下轻震动反馈
    Vibration.vibrate(50)
    const node = fileItemRefs.current[file.id]
    const root = sidebarRef.current
    measureWindowPos(node, (ix, iy, _iw, _ih) => {
      measureWindowPos(root, (rx, ry, rw, rh) => {
        setMenu({
          file,
          x: ix - rx + offsetX,
          y: iy - ry + offsetY,
          rootW: rw,
          rootH: rh
        })
      })
    })
  }

  // 📱 长按某对话项：在手指当前位置打开操作菜单
  const openMenuAtConversation = (
    conversation: { id: string; title: string },
    offsetX: number,
    offsetY: number
  ) => {
    Vibration.vibrate(50)
    const node = convItemRefs.current[conversation.id]
    const root = sidebarRef.current
    measureWindowPos(node, (ix, iy, _iw, _ih) => {
      measureWindowPos(root, (rx, ry, rw, rh) => {
        setConvMenu({
          conversation,
          x: ix - rx + offsetX,
          y: iy - ry + offsetY,
          rootW: rw,
          rootH: rh
        })
      })
    })
  }

  const handleConfirmDelete = () => {
    if (confirmFile) onDeleteFile(confirmFile.id)
    setConfirmFile(null)
  }

  const handleConfirmDeleteConversation = () => {
    if (confirmConv) onDeleteChat(null, confirmConv.id)
    setConfirmConv(null)
  }

  const handleSwitchToAdmin = async () => {
    if (pendingRole || role === 'admin') return
    setPendingRole('admin')
    try {
      const ok = await activateAdmin()
      if (!ok) {
        onCloseDrawer?.()
        router.push('/admin-login')
      }
    } finally {
      setPendingRole(null)
    }
  }

  const handleSwitchToUser = async () => {
    if (pendingRole || role !== 'admin') return
    setPendingRole('user')
    try {
      await logoutToDevice()
    } catch {
      MyToast.show('切换失败，请检查网络')
    } finally {
      setPendingRole(null)
    }
  }

  const handleOpenAdmin = () => {
    onCloseDrawer?.()
    router.push('/admin')
  }

  const primaryColor = theme.primary ?? theme.sendBtnActive ?? '#2F7DE1'
  const primarySoft =
    theme.primarySoft ??
    (isDarkMode ? 'rgba(47, 125, 225, 0.16)' : 'rgba(37, 99, 235, 0.10)')
  const primaryBorder =
    theme.primaryBorder ??
    (isDarkMode ? 'rgba(47, 125, 225, 0.40)' : 'rgba(37, 99, 235, 0.28)')
  const subtleBorder = theme.borderSubtle ?? theme.border
  const elevatedBg =
    theme.surfaceElevated ??
    (isDarkMode ? 'rgba(255, 255, 255, 0.04)' : '#F6F8FA')
  const neutralHoverBg = isDarkMode
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(0, 0, 0, 0.05)'
  const newChatHoverBg = isDarkMode
    ? 'rgba(47, 125, 225, 0.26)'
    : 'rgba(37, 99, 235, 0.16)'
  const newChatTextColor = isDarkMode ? '#D6ECFF' : primaryColor
  const uploadIconBg = isDarkMode
    ? 'rgba(148, 163, 184, 0.14)'
    : 'rgba(100, 116, 139, 0.12)'
  const uploadIconColor = isDarkMode ? '#94A3B8' : '#64748B'
  const historyActiveBg = isDarkMode
    ? 'rgba(47, 125, 225, 0.26)'
    : 'rgba(37, 99, 235, 0.12)'
  const historyActiveBorder = isDarkMode
    ? 'rgba(47, 125, 225, 0.48)'
    : 'rgba(37, 99, 235, 0.26)'
  const activeItemHoverBg = isDarkMode
    ? 'rgba(47, 125, 225, 0.34)'
    : 'rgba(37, 99, 235, 0.17)'
  const menuOpenBg = isDarkMode
    ? 'rgba(255, 255, 255, 0.10)'
    : 'rgba(0, 0, 0, 0.06)'
  const deleteHoverBg = theme.deleteHoverBg || 'rgba(239, 68, 68, 0.14)'
  const successColor = theme.success ?? SEMANTIC_COLORS.success

  const hasQuota =
    role !== 'admin' &&
    typeof device?.usedToday === 'number' &&
    typeof device?.dailyQuota === 'number'
  const quotaRatio =
    hasQuota && (device?.dailyQuota ?? 0) > 0
      ? Math.min(1, Math.max(0, (device?.usedToday ?? 0) / device!.dailyQuota!))
      : 0
  const quotaTextColor =
    quotaRatio >= 0.9
      ? (theme.danger ?? SEMANTIC_COLORS.danger)
      : quotaRatio >= 0.75
        ? (theme.warning ?? SEMANTIC_COLORS.warning)
        : theme.textMuted
  const quotaBarColor =
    quotaRatio >= 0.9
      ? (theme.danger ?? SEMANTIC_COLORS.danger)
      : quotaRatio >= 0.75
        ? (theme.warning ?? SEMANTIC_COLORS.warning)
        : primaryColor
  const quotaTrackBg = isDarkMode
    ? 'rgba(255, 255, 255, 0.08)'
    : 'rgba(0, 0, 0, 0.08)'
  const showQuotaBar = role !== 'admin' && hasQuota
  const quotaFillPercent =
    (device?.usedToday ?? 0) > 0 ? Math.max(quotaRatio * 100, 4) : 0
  const segmentTrackBg = isDarkMode
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(0, 0, 0, 0.045)'

  return (
    <View
      ref={sidebarRef}
      style={[
        sidebarStyles.sidebarRoot,
        isPCWeb
          ? [
              sidebarStyles.sidebarRootDesktop,
              {
                backgroundColor: isDarkMode ? '#0C0D12' : '#F4F7FB',
                ...(Platform.OS === 'web'
                  ? ({
                      backgroundImage: isDarkMode
                        ? 'linear-gradient(180deg, #101218 0%, #090A0E 100%)'
                        : 'linear-gradient(180deg, #F7F9FC 0%, #F1F5F9 100%)'
                    } as any)
                  : null)
              }
            ]
          : { backgroundColor: theme.bgSidebar }
      ]}
    >
      {isPCWeb ? <SidebarCornerGlow isDarkMode={isDarkMode} /> : null}
      <View
        style={[
          sidebarStyles.sidebarInner,
          {
            // Web：PC 端留 40；H5 无状态栏，只留设计里的 +10 基础留白（原 40 离顶太远）
            paddingTop:
              Platform.OS === 'web'
                ? isPCWeb
                  ? 40
                  : 10
                : insets.top + 10,
            paddingBottom:
              Platform.OS === 'web'
                ? isPCWeb
                  ? 12
                  : ('max(16px, env(safe-area-inset-bottom))' as any)
                : Math.max(12, insets.bottom + 8)
          }
        ]}
      >
        {/* 1. 顶部：新建对话按钮 */}
        <View style={sidebarStyles.sidebarTop}>
          <HoverTouchable
            accessibilityRole="button"
            accessibilityLabel="发起新对话"
            style={[
              sidebarStyles.newChatBtn,
              { backgroundColor: primarySoft, borderColor: primaryBorder },
              !isPCWeb && { minHeight: 44 }
            ]}
            hoverBg={newChatHoverBg}
            onPress={onNewChat}
          >
            <IconPlus size={16} strokeWidth={2.3} color={newChatTextColor} />
            <Text style={[sidebarStyles.newChatBtnText, { color: newChatTextColor }]}>
              发起新对话
            </Text>
          </HoverTouchable>
        </View>

        {/* 2. 中部：知识库上传柔和卡片 */}
        <HoverTouchable
          accessibilityRole="button"
          accessibilityLabel="知识库上传"
          style={[
            sidebarStyles.uploadSection,
            { backgroundColor: elevatedBg, borderColor: subtleBorder }
          ]}
          hoverBg={neutralHoverBg}
          onPress={onUploadFile}
        >
          <View
            style={[
              sidebarStyles.uploadIconBadge,
              { backgroundColor: uploadIconBg }
            ]}
          >
            <InputBarIcon name="upload" size={15} color={uploadIconColor} />
          </View>
          <View style={sidebarStyles.uploadTextGroup}>
            <Text
              style={[sidebarStyles.uploadText, { color: theme.textMain }]}
              numberOfLines={1}
            >
              知识库上传
            </Text>
            <Text
              style={[sidebarStyles.uploadHint, { color: theme.textMuted }]}
              numberOfLines={2}
            >
              支持 .txt .pdf .docx .md .js .ts .py 等
            </Text>
          </View>
        </HoverTouchable>

        {/* 3. 已上传文件列表展示区 */}
        {uploadedFiles && uploadedFiles.length > 0 && (
          <View
            ref={fileSectionRef}
            style={[sidebarStyles.fileListContainer, SECTION_NO_CALLOUT_STYLE]}
          >
            <Text
              style={[
                sidebarStyles.categoryTitle,
                { color: theme.textSecondary ?? theme.textMuted }
              ]}
            >
              已上传文件 ({uploadedFiles.length})
            </Text>
            <Text style={[sidebarStyles.fileToggleHint, { color: theme.textMuted }]}>
              停用的文档不会随新问题发送
            </Text>
            <ScrollView
              style={sidebarStyles.subScrollContainer}
              showsVerticalScrollIndicator={false}
            >
              {uploadedFiles.map((file) => {
                const isMenuOpen = menu?.file.id === file.id
                const isBusy =
                  file.status === 'processing' ||
                  file.uploading ||
                  file.showResult
                const showDelete =
                  isPCWeb &&
                  !isBusy &&
                  (hoveredFileId === file.id || confirmFile?.id === file.id)
                return (
                  <SidebarLongPressItem
                    key={file.id}
                    itemKey={file.id}
                    measureRefs={fileItemRefs}
                    style={[
                      sidebarStyles.fileItem,
                      {
                        backgroundColor: elevatedBg,
                        borderColor: subtleBorder
                      },
                      // 长按菜单打开时高亮当前项
                      isMenuOpen && {
                        backgroundColor: primarySoft,
                        borderColor: primaryBorder
                      }
                    ]}
                    hoverBg={isMenuOpen ? activeItemHoverBg : neutralHoverBg}
                    activeOpacity={1}
                    onMouseEnter={
                      isPCWeb ? () => setHoveredFileId(file.id) : undefined
                    }
                    onMouseLeave={
                      isPCWeb
                        ? () =>
                            setHoveredFileId((cur) =>
                              cur === file.id ? null : cur
                            )
                        : undefined
                    }
                    // 📱 移动端 / H5：长按在手指当前位置弹出“删除文件”操作菜单
                    // 处理中/结果展示时不响应长按（与电脑端 X 按钮的隐藏逻辑一致）
                    onLongPressAt={
                      !isPCWeb && !isBusy
                        ? (offsetX, offsetY) =>
                            openMenuAtFile(file, offsetX, offsetY)
                        : undefined
                    }
                  >
                    <View style={sidebarStyles.fileInfo}>
                      <View style={sidebarStyles.fileTitleRow}>
                        <InputBarIcon
                          name="file-text"
                          size={14}
                          color={file.enabled ? primaryColor : theme.textMuted}
                        />
                        <Text
                          style={[
                            sidebarStyles.fileText,
                            {
                              color: file.enabled ? theme.textMain : theme.textMuted
                            }
                          ]}
                          numberOfLines={1}
                        >
                          {file.name}
                        </Text>
                      </View>
                      <Text
                        style={[
                          sidebarStyles.fileEnabledText,
                          {
                            color: file.enabled
                              ? primaryColor
                              : theme.textMuted
                          }
                        ]}
                      >
                        {file.enabledUpdating
                          ? '保存中…'
                          : file.enabled
                            ? '已启用'
                            : '已停用'}
                      </Text>
                      {file.enabledError ? (
                        <Text style={sidebarStyles.fileErrorText}>
                          {file.enabledError}
                        </Text>
                      ) : null}

                      {/* 处理进度条 / 结果图标 */}
                      {file.status === 'processing' || file.uploading ? (
                        <View style={sidebarStyles.progressRow}>
                          <View style={sidebarStyles.progressTrack}>
                            <View
                              style={[
                                sidebarStyles.progressFill,
                                {
                                  width: `${Math.max(0, Math.min(100, file.progress ?? 0))}%`,
                                  backgroundColor: primaryColor
                                }
                              ]}
                            />
                          </View>
                          <Text
                            style={[
                              sidebarStyles.progressPct,
                              { color: theme.textMuted }
                            ]}
                          >
                            {Math.round(file.progress ?? 0)}%
                          </Text>
                        </View>
                      ) : file.showResult ? (
                        // 完成后短暂显示：进度条 + 成功图标（1.5s 后一起隐藏）
                        <View style={sidebarStyles.progressRow}>
                          <View style={sidebarStyles.progressTrack}>
                            <View
                              style={[
                                sidebarStyles.progressFill,
                                { width: '100%', backgroundColor: successColor }
                              ]}
                            />
                          </View>
                          <Svg
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={successColor}
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={sidebarStyles.resultIcon}
                          >
                            <Path d="M20 6L9 17l-5-5" />
                          </Svg>
                        </View>
                      ) : file.status === 'failed' || file.error ? (
                        <Text style={sidebarStyles.fileErrorText}>处理失败</Text>
                      ) : null}
                    </View>

                    <FileEnabledSwitch
                      accessibilityLabel={`${file.enabled ? '停用' : '启用'}文档 ${file.name}`}
                      disabled={
                        file.status === 'processing' ||
                        file.uploading === true ||
                        file.status === 'failed' ||
                        file.error === true ||
                        file.enabledUpdating === true
                      }
                      onValueChange={(enabled) =>
                        onToggleFileEnabled(file.id, enabled)
                      }
                      value={file.enabled}
                      theme={theme}
                    />

                    {/* 🖥️ 仅电脑端网页固定占位 + opacity 切换，防止 hover 时撑高/挤压布局；移动端 / H5 走长按菜单 */}
                    {isPCWeb && (
                      <View
                        style={[
                          sidebarStyles.deleteSlot,
                          {
                            opacity: showDelete ? 1 : 0,
                            pointerEvents: showDelete ? 'auto' : 'none'
                          }
                        ]}
                      >
                        <HoverTouchable
                          accessibilityRole="button"
                          accessibilityLabel={`删除文件 ${file.name}`}
                          disabled={!showDelete}
                          style={sidebarStyles.deleteBtn}
                          onPress={() => requestDeleteFile(file)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          hoverBg={deleteHoverBg}
                        >
                          <InputBarIcon name="x" size={14} color={theme.textMuted} />
                        </HoverTouchable>
                      </View>
                    )}
                  </SidebarLongPressItem>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* 4. 中部：历史记录列表 */}
        <View
          ref={historySectionRef}
          style={[sidebarStyles.historyContainer, SECTION_NO_CALLOUT_STYLE]}
        >
          <Text
            style={[
              sidebarStyles.categoryTitle,
              { color: theme.textSecondary ?? theme.textMuted }
            ]}
          >
            最近记录
          </Text>
          <ScrollView
            style={sidebarStyles.historyList}
            showsVerticalScrollIndicator={false}
          >
            {conversations.map((conv) => {
              const isActive = conv.id === activeId
              const isMenuOpen = convMenu?.conversation.id === conv.id
              const showDelete =
                isPCWeb &&
                (hoveredConvId === conv.id || confirmConv?.id === conv.id)
              return (
                <SidebarLongPressItem
                  key={conv.id}
                  itemKey={conv.id}
                  measureRefs={convItemRefs}
                  style={[
                    sidebarStyles.historyItem,
                    !isPCWeb && { minHeight: 44, paddingVertical: 11 },
                    { borderColor: 'transparent' },
                    isActive
                      ? {
                          backgroundColor: historyActiveBg,
                          borderColor: historyActiveBorder
                        }
                      : isMenuOpen
                        ? {
                            backgroundColor: menuOpenBg,
                            borderColor: subtleBorder
                          }
                        : null
                  ]}
                  hoverBg={isActive ? activeItemHoverBg : neutralHoverBg}
                  onMouseEnter={
                    isPCWeb ? () => setHoveredConvId(conv.id) : undefined
                  }
                  onMouseLeave={
                    isPCWeb
                      ? () =>
                          setHoveredConvId((cur) =>
                            cur === conv.id ? null : cur
                          )
                      : undefined
                  }
                  onPress={() => onSelectChat(conv.id)}
                  // 📱 移动端 / H5：长按在手指当前位置弹出“删除对话”操作菜单
                  onLongPressAt={
                    !isPCWeb
                      ? (offsetX, offsetY) =>
                          openMenuAtConversation(
                            { id: conv.id, title: conv.title },
                            offsetX,
                            offsetY
                          )
                      : undefined
                  }
                >
                  <Text
                    style={[
                      sidebarStyles.historyText,
                      {
                        color: isActive
                          ? isDarkMode
                            ? '#FFFFFF'
                            : primaryColor
                          : theme.textMain,
                        fontWeight: isActive ? '600' : '400',
                        flex: 1
                      }
                    ]}
                    numberOfLines={1}
                  >
                    {conv.title}
                  </Text>

                  {/* 🖥️ 仅电脑端网页固定占位 + opacity 切换，防止 hover 时撑高/挤压布局；移动端 / H5 走长按菜单 */}
                  {isPCWeb && (
                    <View
                      style={[
                        sidebarStyles.deleteSlot,
                        {
                          opacity: showDelete ? 1 : 0,
                          pointerEvents: showDelete ? 'auto' : 'none'
                        }
                      ]}
                    >
                      <HoverTouchable
                        accessibilityRole="button"
                        accessibilityLabel={`删除对话 ${conv.title}`}
                        disabled={!showDelete}
                        style={sidebarStyles.deleteBtn}
                        onPress={() =>
                          requestDeleteConversation({
                            id: conv.id,
                            title: conv.title
                          })
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        hoverBg={deleteHoverBg}
                      >
                        <InputBarIcon
                          name="x"
                          size={14}
                          color={
                            isActive
                              ? isDarkMode
                                ? '#EBF4FF'
                                : primaryColor
                              : theme.textMuted
                          }
                        />
                      </HoverTouchable>
                    </View>
                  )}
                </SidebarLongPressItem>
              )
            })}
          </ScrollView>
        </View>

        {/* 5. 底部：外观设置与个人信息 */}
        <View
          style={[
            sidebarStyles.sidebarFooter,
            { borderTopColor: subtleBorder }
          ]}
        >
          {role === 'admin' && (
            <HoverTouchable
              accessibilityRole="button"
              accessibilityLabel="管理后台"
              style={[
                sidebarStyles.adminEntry,
                { backgroundColor: elevatedBg, borderColor: subtleBorder },
                !isPCWeb && { minHeight: 44 }
              ]}
              hoverBg={neutralHoverBg}
              onPress={handleOpenAdmin}
            >
              <View style={sidebarStyles.adminEntryLeft}>
                <InputBarIcon name="shield" size={14} color={primaryColor} />
                <Text style={[sidebarStyles.adminEntryText, { color: theme.textMain }]}>
                  管理后台
                </Text>
              </View>
              <Text style={[sidebarStyles.adminEntryHint, { color: theme.textMuted }]}>
                ADMIN
              </Text>
            </HoverTouchable>
          )}

          {/* 角色切换与外观切换共用统一「浅色滑块」分段控件，保持视觉体系一致 */}
          <View style={sidebarStyles.appearanceSection}>
            <View
              style={[
                sidebarStyles.appearanceLabelRow,
                showQuotaBar && sidebarStyles.appearanceLabelRowCompact
              ]}
            >
              <Text
                style={[
                  sidebarStyles.appearanceLabel,
                  { color: theme.textSecondary ?? theme.textMuted }
                ]}
              >
                角色
              </Text>
              {role === 'admin' ? (
                <Text style={[sidebarStyles.quotaText, { color: theme.textMuted }]}>
                  无额度限制
                </Text>
              ) : hasQuota ? (
                <View style={sidebarStyles.quotaTextRow}>
                  <Text style={[sidebarStyles.quotaText, { color: quotaTextColor }]}>
                    今日额度{' '}
                  </Text>
                  <RollingNumber
                    value={device!.usedToday!}
                    color={quotaTextColor}
                  />
                  <Text style={[sidebarStyles.quotaText, { color: quotaTextColor }]}>
                    /{device!.dailyQuota}
                  </Text>
                </View>
              ) : null}
            </View>
            {showQuotaBar ? (
              <AnimatedQuotaBar
                percent={quotaFillPercent}
                color={quotaBarColor}
                trackBg={quotaTrackBg}
              />
            ) : null}
            <SegmentedControl
              options={ROLE_OPTIONS}
              value={effectiveRole}
              onChange={(next) =>
                next === 'admin' ? handleSwitchToAdmin() : handleSwitchToUser()
              }
              isDarkMode={isDarkMode}
              isPCWeb={isPCWeb}
              trackBg={segmentTrackBg}
              trackBorder={subtleBorder}
              hoverBg={neutralHoverBg}
              textMain={theme.textMain}
              textMuted={theme.textMuted}
            />
          </View>

          <View style={[sidebarStyles.appearanceSection, { marginBottom: 0 }]}>
            <Text
              style={[
                sidebarStyles.appearanceLabel,
                sidebarStyles.appearanceLabelStandalone,
                { color: theme.textSecondary ?? theme.textMuted }
              ]}
            >
              外观
            </Text>
            <SegmentedControl
              options={THEME_OPTIONS}
              value={themeMode}
              onChange={onThemeModeChange}
              isDarkMode={isDarkMode}
              isPCWeb={isPCWeb}
              trackBg={segmentTrackBg}
              trackBorder={subtleBorder}
              hoverBg={neutralHoverBg}
              textMain={theme.textMain}
              textMuted={theme.textMuted}
            />
          </View>
        </View>
      </View>

      {/* 📱 长按操作菜单（仅移动端 / H5，紧贴长按位置） */}
      {menu && (
        <FileActionSheet
          fileName={menu.file.name}
          x={menu.x}
          y={menu.y}
          rootW={menu.rootW}
          rootH={menu.rootH}
          onCancel={() => setMenu(null)}
          onDelete={() => requestDeleteFile(menu.file)}
          theme={theme}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 📱 长按操作菜单（对话） */}
      {convMenu && (
        <ConversationActionSheet
          conversationTitle={convMenu.conversation.title}
          x={convMenu.x}
          y={convMenu.y}
          rootW={convMenu.rootW}
          rootH={convMenu.rootH}
          onCancel={() => setConvMenu(null)}
          onDelete={() => requestDeleteConversation(convMenu.conversation)}
          theme={theme}
          isDarkMode={isDarkMode}
        />
      )}

      {/* ⚠️ 删除二次确认弹窗（三端通用） */}
      <ConfirmDeleteDialog
        visible={!!confirmFile}
        fileName={confirmFile?.name ?? ''}
        onCancel={() => setConfirmFile(null)}
        onConfirm={handleConfirmDelete}
        theme={theme}
        isDarkMode={isDarkMode}
      />

      {/* ⚠️ 对话删除二次确认弹窗 */}
      <ConfirmDeleteConversationDialog
        visible={!!confirmConv}
        conversationTitle={confirmConv?.title ?? ''}
        onCancel={() => setConfirmConv(null)}
        onConfirm={handleConfirmDeleteConversation}
        theme={theme}
        isDarkMode={isDarkMode}
      />
    </View>
  )
}
