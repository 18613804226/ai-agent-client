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
import type { UploadedFile } from '../hooks/useKnowledgeFiles'
import { isPCWebWidth } from '../constants/theme'
import type { ThemeMode, RoleMode } from '../context/appContexts'
import { useAuth, useRole } from '../context/appContexts'
import { MyToast } from './GlobalToast'
import HoverTouchable from './HoverTouchable'
import { attachCalloutSuppress } from '../hooks/useSuppressBrowserCallout'
import { sidebarStyles, SECTION_NO_CALLOUT_STYLE } from './sidebar/sidebarStyles'
import { FileEnabledSwitch } from './sidebar/FileEnabledSwitch'
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
      style={[sidebarStyles.sidebarRoot, { backgroundColor: theme.bgSidebar }]}
    >
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
                : insets.top + 10
          }
        ]}
      >
        {/* 1. 顶部：新建对话按钮 */}
        <View style={sidebarStyles.sidebarTop}>
          <HoverTouchable
            style={[sidebarStyles.newChatBtn, { backgroundColor: theme.btnBg }]}
            hoverBg={theme.historyActiveBg}
            onPress={onNewChat}
          >
            <Text style={[sidebarStyles.newChatBtnText, { color: theme.btnText }]}>
              + 发起新对话
            </Text>
          </HoverTouchable>
        </View>

        {/* 2. 中部：知识库上传区块 */}
        <HoverTouchable
          style={[sidebarStyles.uploadSection, { borderColor: theme.uploadBorder }]}
          hoverBg={theme.historyActiveBg}
          onPress={onUploadFile}
        >
          <Text style={[sidebarStyles.uploadText, { color: theme.textMain }]}>
            📁 知识库上传
          </Text>
        </HoverTouchable>
        <Text style={[sidebarStyles.uploadHint, { color: theme.textMuted }]}>
          支持 .txt .pdf .docx .md .js .ts .py 等文本/代码文件
        </Text>

        {/* 3. 已上传文件列表展示区 */}
        {uploadedFiles && uploadedFiles.length > 0 && (
          <View
            ref={fileSectionRef}
            style={[sidebarStyles.fileListContainer, SECTION_NO_CALLOUT_STYLE]}
          >
            <Text style={[sidebarStyles.categoryTitle, { color: theme.textMuted }]}>
              已上传文件 ({uploadedFiles.length})
            </Text>
            <Text style={[sidebarStyles.fileToggleHint, { color: theme.textMuted }]}>
              停用的文档不会随新问题发送
            </Text>
            <ScrollView
              style={sidebarStyles.subScrollContainer}
              showsVerticalScrollIndicator={false}
            >
              {uploadedFiles.map((file) => (
                <SidebarLongPressItem
                  key={file.id}
                  itemKey={file.id}
                  measureRefs={fileItemRefs}
                  style={[
                    sidebarStyles.fileItem,
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
                  <View style={sidebarStyles.fileInfo}>
                    <Text
                      style={[
                        sidebarStyles.fileText,
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
                        sidebarStyles.fileEnabledText,
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
                                backgroundColor:
                                  theme.sendBtnActive || '#3b82f6'
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

                  {/* 🖥️ 仅电脑端网页保留 X 删除；移动端 / H5 走长按菜单。
                     处理中/结果展示时隐藏删除按钮 */}
                  {isPCWeb &&
                    !(
                      file.status === 'processing' ||
                      file.uploading ||
                      file.showResult
                    ) && (
                      <HoverTouchable
                        style={sidebarStyles.deleteBtn}
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
          style={[sidebarStyles.historyContainer, SECTION_NO_CALLOUT_STYLE]}
        >
          <Text style={[sidebarStyles.categoryTitle, { color: theme.textMuted }]}>
            最近记录
          </Text>
          <ScrollView
            style={sidebarStyles.historyList}
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
                    sidebarStyles.historyItem,
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
                      sidebarStyles.historyText,
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
                      style={sidebarStyles.deleteBtn}
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
            sidebarStyles.sidebarFooter,
            { borderTopColor: theme.border || 'rgba(255,255,255,0.1)' }
          ]}
        >
          {role === 'admin' && (
            <HoverTouchable
              accessibilityRole="button"
              accessibilityLabel="管理员登录"
              style={sidebarStyles.adminEntry}
              hoverBg={theme.historyActiveBg}
              onPress={() => {
                onCloseDrawer?.()
                router.push('/admin')
              }}
            >
              {/* <Text style={sidebarStyles.adminEntryIcon}>⚙️</Text> */}
              <Text style={[sidebarStyles.adminEntryText, { color: theme.textMain }]}>
                管理后台
              </Text>
              <Text style={[sidebarStyles.adminEntryHint, { color: theme.textMuted }]}>
                ADMIN
              </Text>
            </HoverTouchable>
          )}
          {/* 💡 角色切换：和「外观」同款的紧凑分段器，不单独成卡。 */}
          <View style={sidebarStyles.appearanceSection}>
            <View style={sidebarStyles.appearanceLabelRow}>
              <Text style={[sidebarStyles.appearanceLabel, { color: theme.textMuted }]}>
                角色
              </Text>
              {role === 'admin' ? (
                <Text style={[sidebarStyles.quotaText, { color: theme.textMuted }]}>
                  无限制
                </Text>
              ) : typeof device?.usedToday === 'number' &&
                typeof device?.dailyQuota === 'number' ? (
                <Text style={[sidebarStyles.quotaText, { color: theme.textMuted }]}>
                  {device.usedToday}/{device.dailyQuota}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                sidebarStyles.appearanceOptions,
                // 用 inputBg（暗色 #1E1F20）而不是 bgApp：抽屉底色现在 = bgApp，
                // 再用 bgApp 会跟抽屉同色、分不开。
                { backgroundColor: theme.inputBg }
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
                      sidebarStyles.appearanceOption,
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
                             // 静默切换，不弹 toast
                           } else {
                             onCloseDrawer?.()
                             router.push('/admin-login')
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
                            // 静默切换，不弹 toast
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
                        sidebarStyles.appearanceOptionText,
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
          <View style={sidebarStyles.appearanceSection}>
            <Text style={[sidebarStyles.appearanceLabel, { color: theme.textMuted }]}>
              外观
            </Text>
            <View
              style={[
                sidebarStyles.appearanceOptions,
                // 同上：抽屉底色 = bgApp，切换器容器得用更亮的 inputBg 才分得开
                { backgroundColor: theme.inputBg }
              ]}
            >
              {(
                [
                  { mode: 'light', label: '浅色', icon: '☀️' },
                  { mode: 'dark', label: '深色', icon: '🌙' },
                  { mode: 'system', label: '跟随系统', icon: '💻' }
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
                      sidebarStyles.appearanceOption,
                      selected && {
                        backgroundColor: theme.historyActiveBg
                      }
                    ]}
                    hoverBg={theme.historyActiveBg}
                    onPress={() => onThemeModeChange(mode)}
                  >
                    <Text style={sidebarStyles.appearanceIcon}>{icon}</Text>
                    <Text
                      style={[
                        sidebarStyles.appearanceOptionText,
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
