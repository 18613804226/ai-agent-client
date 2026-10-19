import React, { useState, useRef, useEffect } from 'react'
import {
  Animated,
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  useWindowDimensions,
  Vibration
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { useRouter } from 'expo-router'
import type { UploadedFile } from '../hooks/useKnowledgeFiles'
import { isPCWebWidth } from '../constants/theme'
import type { ThemeMode, RoleMode } from '../context/appContexts'
import { useAuth, useRole } from '../context/appContexts'
import { MyToast } from './GlobalToast'
import HoverTouchable from './HoverTouchable'
import { useSuppressBrowserCallout, attachCalloutSuppress } from '../hooks/useSuppressBrowserCallout'
import Reanimated from 'react-native-reanimated'
import { PopAnim, POP_CSS_FALLBACK } from './PopAnim'

/**
 * 📱 H5/OPPO：列表区块（已上传文件 / 最近记录）防长按样式——只禁选中与
 * 系统 callout 菜单，不带 touchAction:none（保留区块内拖动滚动）。
 * 覆盖区块内的标题/提示等裸文字（样式经继承作用到所有子孙）。
 */
const SECTION_NO_CALLOUT_STYLE = Platform.select({
  web: {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  } as any,
  default: {},
})

/**
 * 长按菜单卡片统一动画外壳（文件 / 对话共用）：
 * 淡入 + 轻微放大 + 微上移，spring 回弹；定位/颜色调用方照常传。
 */
function SheetCardAnim({
  style,
  children
}: {
  style?: any
  children: React.ReactNode
}) {
  return (
    <PopAnim kind="dialog">
      {(animStyle) => (
        <Reanimated.View style={[style, POP_CSS_FALLBACK, animStyle]}>
          {children}
        </Reanimated.View>
      )}
    </PopAnim>
  )
}

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
}

// 💡 统一的 Hover 组件：全部采用“新建对话按钮”同款的悬停变色逻辑（悬停时叠加统一的半透明遮罩/高亮层）
interface HoverItemProps {
  style?: any
  hoverBg?: string
  onPress?: () => void
  activeOpacity?: number
  children: React.ReactNode
  [key: string]: any
}

interface FileEnabledSwitchProps {
  value: boolean
  disabled: boolean
  onValueChange: (value: boolean) => void
  accessibilityLabel: string
  theme: any
}

function FileEnabledSwitch({
  value,
  disabled,
  onValueChange,
  accessibilityLabel,
  theme
}: FileEnabledSwitchProps) {
  const thumbPosition = useRef(new Animated.Value(value ? 18 : 0)).current

  useEffect(() => {
    Animated.timing(thumbPosition, {
      toValue: value ? 18 : 0,
      duration: 150,
      useNativeDriver: Platform.OS !== 'web'
    }).start()
  }, [thumbPosition, value])

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="启用状态会保存到服务器，并决定文档是否参与检索"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[styles.fileEnabledSwitch, disabled && styles.fileSwitchDisabled]}
    >
      <View
        style={[
          styles.fileSwitchTrack,
          {
            backgroundColor: value
              ? theme.sendBtnActive
              : theme.isDark
                ? '#3A3B3D'
                : theme.border
          }
        ]}
      >
        <Animated.View
          style={[
            styles.fileSwitchThumb,
            // boxShadow 三端通用（原生新架构亦支持），替代已废弃的 shadow*
            { boxShadow: theme.isDark ? '0px 1px 3px 0px rgba(0,0,0,0.8)' : '0px 1px 3px 0px rgba(255,255,255,0.8)' },
            { transform: [{ translateX: thumbPosition }] }
          ]}
        />
      </View>
    </Pressable>
  )
}

// 📱 长按菜单卡片尺寸（用于夹取在容器范围内）
const CTX_CARD_W = 168
const CTX_CARD_H = 150 // 估算：标题 + 两个选项

/**
 * 侧边栏长按项统一按压外壳（文件 / 对话共用）：
 *  - 长按 350ms 弹自家删除菜单（与原来 onLongPress + delayLongPress 语义一致）
 *  - web 端挂 useSuppressBrowserCallout：压住 OPPO 等浏览器长按弹系统菜单，
 *    否则系统菜单会盖住自家菜单、还抢长按事件
 *  - onPress 照常透传（点选不受影响）
 */
function SidebarLongPressItem({
  itemKey,
  measureRefs,
  style,
  hoverBg,
  activeOpacity = 1,
  onPress,
  onLongPressAt,
  children
}: {
  itemKey: string
  measureRefs: React.MutableRefObject<Record<string, any>>
  style?: any
  hoverBg?: string
  activeOpacity?: number
  onPress?: () => void
  /** 长按触发：offsetX/offsetY 为触摸点相对项左上角的偏移 */
  onLongPressAt?: (offsetX: number, offsetY: number) => void
  children: React.ReactNode
}) {
  // 📱 H5/OPPO：条目上启用输入层压制（touchstart preventDefault），
  // 国产浏览器不认 contextmenu 拦截，只有掐掉触摸序列才能压住长按系统菜单；
  // 条目本身 touchAction 已是 none（拖动从条目发起不滚动列表），无额外代价。
  const callout = useSuppressBrowserCallout(itemKey, { blockTouch: true })
  return (
    <HoverTouchable
      ref={(el: any) => {
        measureRefs.current[itemKey] = el
        ;(callout.ref as any).current = el
      }}
      style={[style, callout.suppressStyle]}
      hoverBg={hoverBg}
      activeOpacity={activeOpacity}
      onPress={onPress}
      onLongPress={
        onLongPressAt
          ? (e: any) =>
              onLongPressAt(
                e.nativeEvent?.locationX ?? 0,
                e.nativeEvent?.locationY ?? 0
              )
          : undefined
      }
      delayLongPress={350}
      // @ts-ignore RNW 透传到 DOM 的 onContextMenu
      onContextMenu={callout.contextMenuGuard}
    >
      {children}
    </HoverTouchable>
  )
}

// 获取组件在「窗口/视口」中的位置。
// 原生优先 measureInWindow；Web 端 DOM 节点回退到 getBoundingClientRect，
// 保证与容器坐标系一致，避免滚动偏移导致菜单位置偏下。
function measureWindowPos(
  node: any,
  cb: (x: number, y: number, w: number, h: number) => void
) {
  if (!node) {
    cb(0, 0, 0, 0)
    return
  }
  if (typeof node.measureInWindow === 'function') {
    node.measureInWindow((x: number, y: number, w: number, h: number) =>
      cb(x, y, w, h)
    )
    return
  }
  if (typeof node.getBoundingClientRect === 'function') {
    const r = node.getBoundingClientRect()
    cb(r.left, r.top, r.width, r.height)
    return
  }
  if (typeof node.measure === 'function') {
    node.measure(
      (_x: number, _y: number, w: number, h: number, px: number, py: number) =>
        cb(px, py, w, h)
    )
    return
  }
  cb(0, 0, 0, 0)
}

// 📱 移动端 / H5 端：长按文件后在当前位置弹出的小型操作菜单。
// 直接渲染在侧边栏根容器内（与文件项同一坐标系），不再用独立 Modal，避免坐标系偏差。
interface FileActionSheetProps {
  fileName: string
  /** 相对侧边栏根容器的位置 */
  x: number
  y: number
  rootW: number
  rootH: number
  onCancel: () => void
  onDelete: () => void
  theme: any
  isDarkMode: boolean
}

function FileActionSheet({
  fileName,
  x,
  y,
  rootW,
  rootH,
  onCancel,
  onDelete,
  theme,
  isDarkMode
}: FileActionSheetProps) {
  // 优先向触摸点右下方展开；靠近右/下边缘时翻转到左/上方，
  // 保证菜单完整可见且始终贴着手指
  const left = x + CTX_CARD_W > rootW - 8 ? Math.max(8, x - CTX_CARD_W) : x
  const top = y + CTX_CARD_H > rootH - 8 ? Math.max(8, y - CTX_CARD_H) : y

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <SheetCardAnim
        style={[
          styles.sheetCard,
          {
            left,
            top,
            backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
            borderColor: theme.border
          }
        ]}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Text
            style={[styles.sheetTitle, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {fileName}
          </Text>
          <TouchableOpacity style={styles.sheetItem} onPress={onDelete}>
            <Text style={[styles.sheetItemText, { color: '#ef4444' }]}>
              删除
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetItem} onPress={onCancel}>
            <Text style={[styles.sheetItemText, { color: theme.textMain }]}>
              取消
            </Text>
          </TouchableOpacity>
        </Pressable>
      </SheetCardAnim>
    </View>
  )
}

// 📱 移动端 / H5 端：长按对话后在当前位置弹出的小型操作菜单
interface ConversationActionSheetProps {
  conversationTitle: string
  /** 相对侧边栏根容器的位置 */
  x: number
  y: number
  rootW: number
  rootH: number
  onCancel: () => void
  onDelete: () => void
  theme: any
  isDarkMode: boolean
}

function ConversationActionSheet({
  conversationTitle,
  x,
  y,
  rootW,
  rootH,
  onCancel,
  onDelete,
  theme,
  isDarkMode
}: ConversationActionSheetProps) {
  const left = x + CTX_CARD_W > rootW - 8 ? Math.max(8, x - CTX_CARD_W) : x
  const top = y + CTX_CARD_H > rootH - 8 ? Math.max(8, y - CTX_CARD_H) : y

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <SheetCardAnim
        style={[
          styles.sheetCard,
          {
            left,
            top,
            backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
            borderColor: theme.border
          }
        ]}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Text
            style={[styles.sheetTitle, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {conversationTitle}
          </Text>
          <TouchableOpacity style={styles.sheetItem} onPress={onDelete}>
            <Text style={[styles.sheetItemText, { color: '#ef4444' }]}>
              删除
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetItem} onPress={onCancel}>
            <Text style={[styles.sheetItemText, { color: theme.textMain }]}>
              取消
            </Text>
          </TouchableOpacity>
        </Pressable>
      </SheetCardAnim>
    </View>
  )
}

// ⚠️ 三端统一的二次确认弹窗（文件）
interface ConfirmDeleteDialogProps {
  visible: boolean
  fileName: string
  onCancel: () => void
  onConfirm: () => void
  theme: any
  isDarkMode: boolean
}

function ConfirmDeleteDialog({
  visible,
  fileName,
  onCancel,
  onConfirm,
  theme,
  isDarkMode
}: ConfirmDeleteDialogProps) {
  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onCancel}
    >
      <View style={styles.confirmOverlay}>
        <Pressable style={styles.confirmBackdrop} onPress={onCancel} />
        <SheetCardAnim
          style={[
            styles.confirmCard,
            {
              backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
              borderColor: theme.border
            }
          ]}
        >
          <Text style={[styles.confirmTitle, { color: theme.textMain }]}>
            删除文件
          </Text>
          <Text style={[styles.confirmDesc, { color: theme.textMuted }]}>
            确定要删除「{fileName}」吗？删除后将无法恢复。
          </Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: theme.btnBg }]}
              onPress={onCancel}
            >
              <Text style={[styles.confirmBtnText, { color: theme.textMain }]}>
                取消
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: '#ef4444' }]}
              onPress={onConfirm}
            >
              <Text style={[styles.confirmBtnText, { color: '#fff' }]}>
                删除
              </Text>
            </TouchableOpacity>
          </View>
        </SheetCardAnim>
      </View>
    </Modal>
  )
}

// ⚠️ 对话删除二次确认弹窗
interface ConfirmDeleteConversationDialogProps {
  visible: boolean
  conversationTitle: string
  onCancel: () => void
  onConfirm: () => void
  theme: any
  isDarkMode: boolean
}

function ConfirmDeleteConversationDialog({
  visible,
  conversationTitle,
  onCancel,
  onConfirm,
  theme,
  isDarkMode
}: ConfirmDeleteConversationDialogProps) {
  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onCancel}
    >
      <View style={styles.confirmOverlay}>
        <Pressable style={styles.confirmBackdrop} onPress={onCancel} />
        <SheetCardAnim
          style={[
            styles.confirmCard,
            {
              backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
              borderColor: theme.border
            }
          ]}
        >
          <Text style={[styles.confirmTitle, { color: theme.textMain }]}>
            删除对话
          </Text>
          <Text style={[styles.confirmDesc, { color: theme.textMuted }]}>
            确定要删除「{conversationTitle}」吗？删除后将无法恢复。
          </Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: theme.btnBg }]}
              onPress={onCancel}
            >
              <Text style={[styles.confirmBtnText, { color: theme.textMain }]}>
                取消
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: '#ef4444' }]}
              onPress={onConfirm}
            >
              <Text style={[styles.confirmBtnText, { color: '#fff' }]}>
                删除
              </Text>
            </TouchableOpacity>
          </View>
        </SheetCardAnim>
      </View>
    </Modal>
  )
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
  drawerOpen
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

  // ⚠️ 抽屉关闭时把长按菜单/二次确认一起收掉：
  // Drawer 关闭不会卸载 Sidebar（状态全留在内存），不清理的话下次打开弹窗还飘在那。
  // 桌面常驻侧边栏不传 drawerOpen（undefined），这里直接跳过不影响。
  useEffect(() => {
    if (drawerOpen === false) {
      setMenu(null)
      setConvMenu(null)
      setConfirmFile(null)
      setConfirmConv(null)
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

  return (
    <View
      ref={sidebarRef}
      style={[styles.sidebarRoot, { backgroundColor: theme.bgSidebar }]}
    >
      <View
        style={[
          styles.sidebarInner,
          {
            // Web：PC 端留 40；H5 无状态栏，只留设计里的 +10 基础留白（原 40 离顶太远）
            paddingTop:
              Platform.OS === 'web'
                ? isPCWeb
                  ? 40
                  : 10
                : insets.top + 10
          }
        ]}
      >
        {/* 1. 顶部：新建对话按钮 */}
        <View style={styles.sidebarTop}>
          <HoverTouchable
            style={[styles.newChatBtn, { backgroundColor: theme.btnBg }]}
            hoverBg={theme.historyActiveBg}
            onPress={onNewChat}
          >
            <Text style={[styles.newChatBtnText, { color: theme.btnText }]}>
              + 发起新对话
            </Text>
          </HoverTouchable>
        </View>

        {/* 2. 中部：知识库上传区块 */}
        <HoverTouchable
          style={[styles.uploadSection, { borderColor: theme.uploadBorder }]}
          hoverBg={theme.historyActiveBg}
          onPress={onUploadFile}
        >
          <Text style={[styles.uploadText, { color: theme.textMain }]}>
            📁 知识库上传
          </Text>
        </HoverTouchable>
        <Text style={[styles.uploadHint, { color: theme.textMuted }]}>
          支持 .txt .pdf .docx .md .js .ts .py 等文本/代码文件
        </Text>

        {/* 3. 已上传文件列表展示区 */}
        {uploadedFiles && uploadedFiles.length > 0 && (
          <View
            ref={fileSectionRef}
            style={[styles.fileListContainer, SECTION_NO_CALLOUT_STYLE]}
          >
            <Text style={[styles.categoryTitle, { color: theme.textMuted }]}>
              已上传文件 ({uploadedFiles.length})
            </Text>
            <Text style={[styles.fileToggleHint, { color: theme.textMuted }]}>
              停用的文档不会随新问题发送
            </Text>
            <ScrollView
              style={styles.subScrollContainer}
              showsVerticalScrollIndicator={false}
            >
              {uploadedFiles.map((file) => (
                <SidebarLongPressItem
                  key={file.id}
                  itemKey={file.id}
                  measureRefs={fileItemRefs}
                  style={[
                    styles.fileItem,
                    {
                      backgroundColor: theme.btnBg || 'rgba(255,255,255,0.05)'
                    },
                    // 长按菜单打开时高亮当前项
                    menu?.file.id === file.id && {
                      backgroundColor: theme.historyActiveBg
                    }
                  ]}
                  hoverBg={theme.historyActiveBg}
                  activeOpacity={1}
                  // 📱 移动端 / H5：长按在手指当前位置弹出“删除文件”操作菜单
                  // 处理中/结果展示时不响应长按（与电脑端 X 按钮的隐藏逻辑一致）
                  onLongPressAt={
                    !isPCWeb &&
                    !(
                      file.status === 'processing' ||
                      file.uploading ||
                      file.showResult
                    )
                      ? (offsetX, offsetY) =>
                          openMenuAtFile(file, offsetX, offsetY)
                      : undefined
                  }
                >
                  <View style={styles.fileInfo}>
                    <Text
                      style={[
                        styles.fileText,
                        {
                          color: file.enabled ? theme.textMain : theme.textMuted
                        }
                      ]}
                      numberOfLines={1}
                    >
                      📄 {file.name}
                    </Text>
                    <Text
                      style={[
                        styles.fileEnabledText,
                        {
                          color: file.enabled
                            ? theme.sendBtnActive
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
                      <Text style={styles.fileErrorText}>
                        {file.enabledError}
                      </Text>
                    ) : null}

                    {/* 处理进度条 / 结果图标 */}
                    {file.status === 'processing' || file.uploading ? (
                      <View style={styles.progressRow}>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.max(0, Math.min(100, file.progress ?? 0))}%`,
                                backgroundColor:
                                  theme.sendBtnActive || '#3b82f6'
                              }
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.progressPct,
                            { color: theme.textMuted }
                          ]}
                        >
                          {Math.round(file.progress ?? 0)}%
                        </Text>
                      </View>
                    ) : file.showResult ? (
                      // 完成后短暂显示：进度条 + 成功图标（1.5s 后一起隐藏）
                      <View style={styles.progressRow}>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: '100%', backgroundColor: '#22c55e' }
                            ]}
                          />
                        </View>
                        <Svg
                          width={14}
                          height={14}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={styles.resultIcon}
                        >
                          <Path d="M20 6L9 17l-5-5" />
                        </Svg>
                      </View>
                    ) : file.status === 'failed' || file.error ? (
                      <Text style={styles.fileErrorText}>处理失败</Text>
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

                  {/* 🖥️ 仅电脑端网页保留 X 删除；移动端 / H5 走长按菜单。
                    处理中/结果展示时隐藏删除按钮 */}
                  {isPCWeb &&
                    !(
                      file.status === 'processing' ||
                      file.uploading ||
                      file.showResult
                    ) && (
                      <HoverTouchable
                        style={styles.deleteBtn}
                        onPress={() => requestDeleteFile(file)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        hoverBg={theme.deleteHoverBg || 'rgba(255, 0, 0, 0.1)'}
                      >
                        <Svg
                          width={14}
                          height={14}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={theme.textMuted}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={
                            Platform.OS === 'web'
                              ? ({ cursor: 'pointer' } as any)
                              : undefined
                          }
                        >
                          <Path d="M18 6L6 18M6 6l12 12" />
                        </Svg>
                      </HoverTouchable>
                    )}
                </SidebarLongPressItem>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 4. 中部：历史记录列表 */}
        <View
          ref={historySectionRef}
          style={[styles.historyContainer, SECTION_NO_CALLOUT_STYLE]}
        >
          <Text style={[styles.categoryTitle, { color: theme.textMuted }]}>
            最近记录
          </Text>
          <ScrollView
            style={styles.historyList}
            showsVerticalScrollIndicator={false}
          >
            {conversations.map((conv) => {
              const isActive = conv.id === activeId
              return (
                <SidebarLongPressItem
                  key={conv.id}
                  itemKey={conv.id}
                  measureRefs={convItemRefs}
                  style={[
                    styles.historyItem,
                    isActive && { backgroundColor: theme.historyActiveBg },
                    // 长按菜单打开时高亮当前项
                    convMenu?.conversation.id === conv.id && {
                      backgroundColor: theme.historyActiveBg
                    }
                  ]}
                  hoverBg={theme.historyActiveBg}
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
                      styles.historyText,
                      {
                        color: isActive
                          ? theme.historyActiveText
                          : theme.textMain
                      },
                      { flex: 1 }
                    ]}
                    numberOfLines={1}
                  >
                    {conv.title}
                  </Text>

                  {/* 🖥️ 仅电脑端网页保留 X 删除；移动端 / H5 走长按菜单 */}
                  {isPCWeb && (
                    <HoverTouchable
                      style={styles.deleteBtn}
                      onPress={() =>
                        requestDeleteConversation({
                          id: conv.id,
                          title: conv.title
                        })
                      }
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      hoverBg={theme.deleteHoverBg || 'rgba(255, 0, 0, 0.1)'}
                    >
                      <Svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={
                          isActive ? theme.historyActiveText : theme.textMuted
                        }
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={
                          Platform.OS === 'web'
                            ? ({ cursor: 'pointer' } as any)
                            : undefined
                        }
                      >
                        <Path d="M18 6L6 18M6 6l12 12" />
                      </Svg>
                    </HoverTouchable>
                  )}
                </SidebarLongPressItem>
              )
            })}
          </ScrollView>
        </View>

        {/* 5. 底部：外观设置与个人信息 */}
        <View
          style={[
            styles.sidebarFooter,
            { borderTopColor: theme.border || 'rgba(255,255,255,0.1)' }
          ]}
        >
          {role === 'admin' && (
            <HoverTouchable
              accessibilityRole="button"
              accessibilityLabel="管理员登录"
              style={styles.adminEntry}
              hoverBg={theme.historyActiveBg}
              onPress={() => router.push('/admin')}
            >
              {/* <Text style={styles.adminEntryIcon}>⚙️</Text> */}
              <Text style={[styles.adminEntryText, { color: theme.textMain }]}>
                管理后台
              </Text>
              <Text style={[styles.adminEntryHint, { color: theme.textMuted }]}>
                ADMIN
              </Text>
            </HoverTouchable>
          )}
          {/* 💡 角色切换：和「外观」同款的紧凑分段器，不单独成卡。 */}
          <View style={styles.appearanceSection}>
            <View style={styles.appearanceLabelRow}>
              <Text style={[styles.appearanceLabel, { color: theme.textMuted }]}>
                角色
              </Text>
              {role === 'admin' ? (
                <Text style={[styles.quotaText, { color: theme.textMuted }]}>
                  无限制
                </Text>
              ) : typeof device?.usedToday === 'number' &&
                typeof device?.dailyQuota === 'number' ? (
                <Text style={[styles.quotaText, { color: theme.textMuted }]}>
                  {device.usedToday}/{device.dailyQuota}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.appearanceOptions,
                { backgroundColor: theme.bgApp }
              ]}
            >
              {(
                [
                  { value: 'user', label: 'User' },
                  { value: 'admin', label: 'Admin' }
                ] as { value: RoleMode; label: string }[]
              ).map(({ value, label }) => {
const selected = effectiveRole === value
                return (
                  <HoverTouchable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                    style={[
                      styles.appearanceOption,
                      selected && {
                        backgroundColor: theme.historyActiveBg
                      }
                    ]}
                    hoverBg={theme.historyActiveBg}
                    onPress={async () => {
                      if (pendingRole) return; // 切换中，忽略重复点击
                      if (value === 'admin') {
                        if (role === 'admin') return;
                        // 乐观反馈：先高亮 Admin，再去免密激活；失败/无缓存再回滚
                        setPendingRole('admin');
                        try {
                          const ok = await activateAdmin();
                          if (ok) {
                            MyToast.show('已切换为管理员');
                          } else {
                            router.push('/admin-login');
                          }
                        } finally {
                          setPendingRole(null);
                        }
                        return;
                      }
                      if (role === 'admin') {
                        setPendingRole('user');
                        try {
                          await logoutToDevice();
                          MyToast.show('已切换为普通用户');
                        } catch {
                          MyToast.show('切换失败，请检查网络');
                        } finally {
                          setPendingRole(null);
                        }
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.appearanceOptionText,
                        {
                          color: selected
                            ? theme.historyActiveText
                            : theme.textMuted
                        }
                      ]}
                    >
                      {label}
                    </Text>
                  </HoverTouchable>
                )
              })}
            </View>
          </View>
          <View style={styles.appearanceSection}>
            <Text style={[styles.appearanceLabel, { color: theme.textMuted }]}>
              外观
            </Text>
            <View
              style={[
                styles.appearanceOptions,
                { backgroundColor: theme.bgApp }
              ]}
            >
              {(
                [
                  { mode: 'light', label: '浅色', icon: '' },
                  { mode: 'dark', label: '深色', icon: '' },
                  { mode: 'system', label: '跟随系统', icon: '' }
                ] as const
              ).map(({ mode, label, icon }) => {
                const selected = themeMode === mode
                return (
                  <HoverTouchable
                    key={mode}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${label}模式`}
                    style={[
                      styles.appearanceOption,
                      selected && {
                        backgroundColor: theme.historyActiveBg
                      }
                    ]}
                    hoverBg={theme.historyActiveBg}
                    onPress={() => onThemeModeChange(mode)}
                  >
                    <Text style={styles.appearanceIcon}>{icon}</Text>
                    <Text
                      style={[
                        styles.appearanceOptionText,
                        {
                          color: selected
                            ? theme.historyActiveText
                            : theme.textMuted
                        }
                      ]}
                    >
                      {label}
                    </Text>
                  </HoverTouchable>
                )
              })}
            </View>
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

const styles = StyleSheet.create({
  sidebarRoot: {
    flex: 1
  },
  sidebarInner: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between'
  },
  sidebarTop: {
    marginBottom: 4
  },
  newChatBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center'
  },
  newChatBtnText: {
    fontWeight: '600',
    fontSize: 14
  },
  uploadSection: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center'
  },
  uploadText: {
    fontSize: 13,
    fontWeight: '500'
  },
  uploadHint: {
    fontSize: 11,
    marginTop: 0,
    marginBottom: 0,
    textAlign: 'center'
  },
  categoryTitle: {
    fontSize: 12,
    marginVertical: 6,
    paddingHorizontal: 4,
    fontWeight: '500'
  },
  fileListContainer: {
    maxHeight: 200,
    marginVertical: 2
  },
  subScrollContainer: {
    maxHeight: 190
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Platform.OS === 'web' ? 6 : 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginBottom: 4
  },
  fileInfo: {
    flex: 1,
    marginRight: 6
  },
  fileText: {
    fontSize: 13
  },
  fileEnabledText: {
    fontSize: 10,
    marginTop: 2
  },
  fileToggleHint: {
    fontSize: 10,
    marginTop: -4,
    marginBottom: 6,
    paddingHorizontal: 4
  },
  fileEnabledSwitch: {
    marginLeft: 2,
    marginRight: 2,
    width: 40,
    height: 24,
    justifyContent: 'center'
  },
  fileSwitchDisabled: {
    opacity: 0.55
  },
  fileSwitchTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center'
  },
  fileSwitchThumb: {
    position: 'absolute',
    left: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff'
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(150, 150, 150, 0.25)',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 3
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  progressPct: {
    fontSize: 10,
    marginLeft: 6,
    minWidth: 30,
    textAlign: 'right'
  },
  resultIcon: {
    marginLeft: 6
  },
  fileErrorText: {
    fontSize: 11,
    marginTop: 3,
    color: '#ef4444'
  },
  historyContainer: {
    flex: 1,
    marginVertical: 4
  },
  historyList: {
    flex: 1
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginBottom: 4
  },
  historyText: {
    fontSize: 14
  },
  deleteBtn: {
    padding: 3,
    marginLeft: 6,
    borderRadius: 12
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: '600'
  },
  sidebarFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4
  },
  adminEntry: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
    borderRadius: 15
  },
  adminEntryIcon: {
    fontSize: 15,
    marginRight: 9
  },
  adminEntryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500'
  },
  adminEntryHint: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  appearanceSection: {
    marginBottom: 8
  },
  appearanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4
  },
  quotaText: {
    fontSize: 11,
    fontWeight: '600'
  },
  appearanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 4
  },
  appearanceOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 15
  },
  appearanceOption: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 13
  },
  appearanceIcon: {
    fontSize: 12,
    marginRight: 4
  },
  appearanceOptionText: {
    fontSize: 12,
    fontWeight: '500'
  },
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999
  },
  sheetCard: {
    position: 'absolute',
    width: CTX_CARD_W,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.25)',
    elevation: 6
  },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6
  },
  sheetItem: {
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  sheetItemText: {
    fontSize: 14,
    fontWeight: '500'
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  confirmBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  },
  confirmCard: {
    width: '80%',
    maxWidth: 320,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    boxShadow: '0px 10px 12px rgba(0, 0, 0, 0.4)',
    elevation: 10
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8
  },
  confirmDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20
  },
  confirmBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center'
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '600'
  }
})
