import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  useWindowDimensions,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { UploadedFile } from '../hooks/useKnowledgeFiles';
import { isPCWebWidth } from '../constants/theme';
import type { ThemeMode } from '../context/appContexts';

interface SidebarProps {
  conversations: any[];
  activeId: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (e: any, id: string) => void;
  isDarkMode: boolean;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  theme: any;
  uploadedFiles: UploadedFile[];
  onUploadFile: () => void;
  onDeleteFile: (id: string) => void;
}

// 💡 统一的 Hover 组件：全部采用“新建对话按钮”同款的悬停变色逻辑（悬停时叠加统一的半透明遮罩/高亮层）
interface HoverItemProps {
  style?: any;
  hoverBg?: string;
  onPress?: () => void;
  activeOpacity?: number;
  children: React.ReactNode;
  [key: string]: any;
}

const HoverTouchable = React.forwardRef<any, HoverItemProps>(
  function HoverTouchable(
    {
      style,
      hoverBg = 'rgba(0, 0, 0, 0.06)', // 默认采用新建对话同款的轻量悬停加深/提亮效果
      onPress,
      activeOpacity = 0.7,
      children,
      ...props
    },
    ref,
  ) {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <TouchableOpacity
        ref={ref}
        style={[
          style,
          Platform.OS === 'web' && {
            transitionProperty: 'background-color',
            transitionDuration: '0.15s',
            transitionTimingFunction: 'ease',
            cursor: 'pointer',
          },
          Platform.OS === 'web' && isHovered && { backgroundColor: hoverBg },
        ]}
        onPress={onPress}
        activeOpacity={activeOpacity}
        // @ts-ignore
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
  },
);

// 📱 长按菜单卡片尺寸（用于夹取在容器范围内）
const CTX_CARD_W = 168;
const CTX_CARD_H = 150; // 估算：标题 + 两个选项

// 获取组件在「窗口/视口」中的位置。
// 原生优先 measureInWindow；Web 端 DOM 节点回退到 getBoundingClientRect，
// 保证与容器坐标系一致，避免滚动偏移导致菜单位置偏下。
function measureWindowPos(
  node: any,
  cb: (x: number, y: number, w: number, h: number) => void,
) {
  if (!node) {
    cb(0, 0, 0, 0);
    return;
  }
  if (typeof node.measureInWindow === 'function') {
    node.measureInWindow((x: number, y: number, w: number, h: number) =>
      cb(x, y, w, h),
    );
    return;
  }
  if (typeof node.getBoundingClientRect === 'function') {
    const r = node.getBoundingClientRect();
    cb(r.left, r.top, r.width, r.height);
    return;
  }
  if (typeof node.measure === 'function') {
    node.measure(
      (_x: number, _y: number, w: number, h: number, px: number, py: number) =>
        cb(px, py, w, h),
    );
    return;
  }
  cb(0, 0, 0, 0);
}

// 📱 移动端 / H5 端：长按文件后在当前位置弹出的小型操作菜单。
// 直接渲染在侧边栏根容器内（与文件项同一坐标系），不再用独立 Modal，避免坐标系偏差。
interface FileActionSheetProps {
  fileName: string;
  /** 相对侧边栏根容器的位置 */
  x: number;
  y: number;
  rootW: number;
  rootH: number;
  onCancel: () => void;
  onDelete: () => void;
  theme: any;
  isDarkMode: boolean;
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
  isDarkMode,
}: FileActionSheetProps) {
  // 优先向触摸点右下方展开；靠近右/下边缘时翻转到左/上方，
  // 保证菜单完整可见且始终贴着手指
  const left = x + CTX_CARD_W > rootW - 8 ? Math.max(8, x - CTX_CARD_W) : x;
  const top = y + CTX_CARD_H > rootH - 8 ? Math.max(8, y - CTX_CARD_H) : y;

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <Pressable
        style={[
          styles.sheetCard,
          {
            left,
            top,
            backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
            borderColor: theme.border,
          },
        ]}
        onPress={(e) => e.stopPropagation()}
      >
        <Text
          style={[styles.sheetTitle, { color: theme.textMuted }]}
          numberOfLines={1}
        >
          {fileName}
        </Text>
        <TouchableOpacity style={styles.sheetItem} onPress={onDelete}>
          <Text style={[styles.sheetItemText, { color: '#ef4444' }]}>删除</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sheetItem} onPress={onCancel}>
          <Text style={[styles.sheetItemText, { color: theme.textMain }]}>
            取消
          </Text>
        </TouchableOpacity>
      </Pressable>
    </View>
  );
}

// 📱 移动端 / H5 端：长按对话后在当前位置弹出的小型操作菜单
interface ConversationActionSheetProps {
  conversationTitle: string;
  /** 相对侧边栏根容器的位置 */
  x: number;
  y: number;
  rootW: number;
  rootH: number;
  onCancel: () => void;
  onDelete: () => void;
  theme: any;
  isDarkMode: boolean;
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
  isDarkMode,
}: ConversationActionSheetProps) {
  const left = x + CTX_CARD_W > rootW - 8 ? Math.max(8, x - CTX_CARD_W) : x;
  const top = y + CTX_CARD_H > rootH - 8 ? Math.max(8, y - CTX_CARD_H) : y;

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <Pressable
        style={[
          styles.sheetCard,
          {
            left,
            top,
            backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
            borderColor: theme.border,
          },
        ]}
        onPress={(e) => e.stopPropagation()}
      >
        <Text
          style={[styles.sheetTitle, { color: theme.textMuted }]}
          numberOfLines={1}
        >
          {conversationTitle}
        </Text>
        <TouchableOpacity style={styles.sheetItem} onPress={onDelete}>
          <Text style={[styles.sheetItemText, { color: '#ef4444' }]}>删除</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sheetItem} onPress={onCancel}>
          <Text style={[styles.sheetItemText, { color: theme.textMain }]}>
            取消
          </Text>
        </TouchableOpacity>
      </Pressable>
    </View>
  );
}

// ⚠️ 三端统一的二次确认弹窗（文件）
interface ConfirmDeleteDialogProps {
  visible: boolean;
  fileName: string;
  onCancel: () => void;
  onConfirm: () => void;
  theme: any;
  isDarkMode: boolean;
}

function ConfirmDeleteDialog({
  visible,
  fileName,
  onCancel,
  onConfirm,
  theme,
  isDarkMode,
}: ConfirmDeleteDialogProps) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.confirmOverlay}>
        <Pressable style={styles.confirmBackdrop} onPress={onCancel} />
        <View
          style={[
            styles.confirmCard,
            {
              backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
              borderColor: theme.border,
            },
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
        </View>
      </View>
    </Modal>
  );
}

// ⚠️ 对话删除二次确认弹窗
interface ConfirmDeleteConversationDialogProps {
  visible: boolean;
  conversationTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
  theme: any;
  isDarkMode: boolean;
}

function ConfirmDeleteConversationDialog({
  visible,
  conversationTitle,
  onCancel,
  onConfirm,
  theme,
  isDarkMode,
}: ConfirmDeleteConversationDialogProps) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.confirmOverlay}>
        <Pressable style={styles.confirmBackdrop} onPress={onCancel} />
        <View
          style={[
            styles.confirmCard,
            {
              backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
              borderColor: theme.border,
            },
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
        </View>
      </View>
    </Modal>
  );
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
}: SidebarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // 📱 记录每个文件项的 ref，用于长按时测量实际屏幕坐标
  const fileItemRefs = useRef<Record<string, any>>({});
  // 📱 记录每个对话项的 ref
  const convItemRefs = useRef<Record<string, any>>({});
  // 侧边栏根容器 ref，用于把菜单坐标换算到根容器坐标系
  const sidebarRef = useRef<any>(null);

  // 🖥️ 与 app/index.tsx 保持一致的三端判断：仅电脑端网页保留 X 删除
  const isPCWeb = Platform.OS === 'web' && isPCWebWidth(width);

  // 长按操作菜单（文件）
  const [menu, setMenu] = useState<{
    file: UploadedFile;
    x: number;
    y: number;
    rootW: number;
    rootH: number;
  } | null>(null);
  const [confirmFile, setConfirmFile] = useState<UploadedFile | null>(null);

  // 长按操作菜单（对话）
  const [convMenu, setConvMenu] = useState<{
    conversation: { id: string; title: string };
    x: number;
    y: number;
    rootW: number;
    rootH: number;
  } | null>(null);
  const [confirmConv, setConfirmConv] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // 统一的删除入口：先关掉菜单，再弹二次确认
  const requestDeleteFile = (file: UploadedFile) => {
    setMenu(null);
    setConfirmFile(file);
  };

  const requestDeleteConversation = (conversation: {
    id: string;
    title: string;
  }) => {
    setConvMenu(null);
    setConfirmConv(conversation);
  };

  // 📱 长按某文件项：在手指当前位置打开操作菜单
  // offsetX/offsetY 为触摸点相对文件项左上角的偏移
  const openMenuAtFile = (
    file: UploadedFile,
    offsetX: number,
    offsetY: number,
  ) => {
    // 长按弹出菜单时给一下轻震动反馈
    Vibration.vibrate(50);
    const node = fileItemRefs.current[file.id];
    const root = sidebarRef.current;
    measureWindowPos(node, (ix, iy, _iw, _ih) => {
      measureWindowPos(root, (rx, ry, rw, rh) => {
        setMenu({
          file,
          x: ix - rx + offsetX,
          y: iy - ry + offsetY,
          rootW: rw,
          rootH: rh,
        });
      });
    });
  };

  // 📱 长按某对话项：在手指当前位置打开操作菜单
  const openMenuAtConversation = (
    conversation: { id: string; title: string },
    offsetX: number,
    offsetY: number,
  ) => {
    Vibration.vibrate(50);
    const node = convItemRefs.current[conversation.id];
    const root = sidebarRef.current;
    measureWindowPos(node, (ix, iy, _iw, _ih) => {
      measureWindowPos(root, (rx, ry, rw, rh) => {
        setConvMenu({
          conversation,
          x: ix - rx + offsetX,
          y: iy - ry + offsetY,
          rootW: rw,
          rootH: rh,
        });
      });
    });
  };

  const handleConfirmDelete = () => {
    if (confirmFile) onDeleteFile(confirmFile.id);
    setConfirmFile(null);
  };

  const handleConfirmDeleteConversation = () => {
    if (confirmConv) onDeleteChat(null, confirmConv.id);
    setConfirmConv(null);
  };

  return (
    <View
      ref={sidebarRef}
      style={[styles.sidebarRoot, { backgroundColor: theme.bgSidebar }]}
    >
      <View
        style={[
          styles.sidebarInner,
          {
            paddingTop: Platform.OS === 'web' ? 40 : insets.top + 10,
          },
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
          <View style={styles.fileListContainer}>
            <Text style={[styles.categoryTitle, { color: theme.textMuted }]}>
              已上传文件 ({uploadedFiles.length})
            </Text>
            <ScrollView
              style={styles.subScrollContainer}
              showsVerticalScrollIndicator={false}
            >
              {uploadedFiles.map((file) => (
                <HoverTouchable
                  key={file.id}
                  ref={(el: any) => {
                    fileItemRefs.current[file.id] = el;
                  }}
                  style={[
                    styles.fileItem,
                    {
                      backgroundColor: theme.btnBg || 'rgba(255,255,255,0.05)',
                    },
                    // 长按菜单打开时高亮当前项
                    menu?.file.id === file.id && {
                      backgroundColor: theme.historyActiveBg,
                    },
                  ]}
                  hoverBg={theme.historyActiveBg}
                  activeOpacity={1}
                  // 📱 移动端 / H5：长按在手指当前位置弹出“删除文件”操作菜单
                  // 处理中/结果展示时不响应长按（与电脑端 X 按钮的隐藏逻辑一致）
                  onLongPress={
                    !isPCWeb &&
                    !(
                      file.status === 'processing' ||
                      file.uploading ||
                      file.showResult
                    )
                      ? (e: any) =>
                          openMenuAtFile(
                            file,
                            e.nativeEvent?.locationX ?? 0,
                            e.nativeEvent?.locationY ?? 0,
                          )
                      : undefined
                  }
                  delayLongPress={350}
                >
                  <View style={styles.fileInfo}>
                    <Text
                      style={[styles.fileText, { color: theme.textMain }]}
                      numberOfLines={1}
                    >
                      📄 {file.name}
                    </Text>

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
                                  theme.sendBtnActive || '#3b82f6',
                              },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.progressPct,
                            { color: theme.textMuted },
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
                              { width: '100%', backgroundColor: '#22c55e' },
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

                  {/* 🖥️ 仅电脑端网页保留 X 删除；移动端 / H5 走长按菜单。
                    处理中/结果展示时隐藏删除按钮 */}
                  {isPCWeb &&
                    !(
                      file.status === 'processing' ||
                      file.uploading ||
                      file.showResult
                    ) && (
                      <TouchableOpacity
                        onPress={() => requestDeleteFile(file)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text
                          style={[
                            styles.deleteBtnText,
                            { color: theme.textMuted },
                          ]}
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
                          >
                            <Path d="M18 6L6 18M6 6l12 12" />
                          </Svg>
                        </Text>
                      </TouchableOpacity>
                    )}
                </HoverTouchable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 4. 中部：历史记录列表 */}
        <View style={styles.historyContainer}>
          <Text style={[styles.categoryTitle, { color: theme.textMuted }]}>
            最近记录
          </Text>
          <ScrollView
            style={styles.historyList}
            showsVerticalScrollIndicator={false}
          >
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <HoverTouchable
                  key={conv.id}
                  ref={(el: any) => {
                    convItemRefs.current[conv.id] = el;
                  }}
                  style={[
                    styles.historyItem,
                    isActive && { backgroundColor: theme.historyActiveBg },
                    // 长按菜单打开时高亮当前项
                    convMenu?.conversation.id === conv.id && {
                      backgroundColor: theme.historyActiveBg,
                    },
                  ]}
                  hoverBg={theme.historyActiveBg}
                  onPress={() => onSelectChat(conv.id)}
                  // 📱 移动端 / H5：长按在手指当前位置弹出“删除对话”操作菜单
                  onLongPress={
                    !isPCWeb
                      ? (e: any) =>
                          openMenuAtConversation(
                            { id: conv.id, title: conv.title },
                            e.nativeEvent?.locationX ?? 0,
                            e.nativeEvent?.locationY ?? 0,
                          )
                      : undefined
                  }
                  delayLongPress={350}
                >
                  <Text
                    style={[
                      styles.historyText,
                      {
                        color: isActive
                          ? theme.historyActiveText
                          : theme.textMain,
                      },
                      { flex: 1 },
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
                          title: conv.title,
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
                </HoverTouchable>
              );
            })}
          </ScrollView>
        </View>

        {/* 5. 底部：外观设置与个人信息 */}
        <View
          style={[
            styles.sidebarFooter,
            { borderTopColor: theme.border || 'rgba(255,255,255,0.1)' },
          ]}
        >
          <View style={styles.appearanceSection}>
            <Text style={[styles.appearanceLabel, { color: theme.textMuted }]}>
              外观
            </Text>
            <View
              style={[
                styles.appearanceOptions,
                { backgroundColor: theme.bgApp },
              ]}
            >
              {(
                [
                  { mode: 'light', label: '浅色', icon: '☀️' },
                  { mode: 'dark', label: '深色', icon: '🌙' },
                  { mode: 'system', label: '跟随系统', icon: '◐' },
                ] as const
              ).map(({ mode, label, icon }) => {
                const selected = themeMode === mode;
                return (
                  <HoverTouchable
                    key={mode}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${label}模式`}
                    style={[
                      styles.appearanceOption,
                      selected && {
                        backgroundColor: theme.historyActiveBg,
                      },
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
                            : theme.textMuted,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </HoverTouchable>
                );
              })}
            </View>
          </View>
          <View style={styles.userProfile}>
            <View style={styles.avatarMini}>
              <Text style={styles.avatarMiniText}>王</Text>
            </View>
            <Text
              style={[styles.userName, { color: theme.textMain }]}
              numberOfLines={1}
            >
              王 toto
            </Text>
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
  );
}

const styles = StyleSheet.create({
  sidebarRoot: {
    flex: 1,
  },
  sidebarInner: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  sidebarTop: {
    marginBottom: 4,
  },
  newChatBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  newChatBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
  uploadSection: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  uploadText: {
    fontSize: 13,
    fontWeight: '500',
  },
  uploadHint: {
    fontSize: 11,
    marginTop: 0,
    marginBottom: 0,
    textAlign: 'center',
  },
  categoryTitle: {
    fontSize: 12,
    marginVertical: 6,
    paddingHorizontal: 4,
    fontWeight: '500',
  },
  fileListContainer: {
    maxHeight: 200,
    marginVertical: 2,
  },
  subScrollContainer: {
    maxHeight: 190,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginBottom: 4,
  },
  fileInfo: {
    flex: 1,
    marginRight: 6,
  },
  fileText: {
    fontSize: 13,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(150, 150, 150, 0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  progressPct: {
    fontSize: 10,
    marginLeft: 6,
    minWidth: 30,
    textAlign: 'right',
  },
  resultIcon: {
    marginLeft: 6,
  },
  fileErrorText: {
    fontSize: 11,
    marginTop: 3,
    color: '#ef4444',
  },
  historyContainer: {
    flex: 1,
    marginVertical: 4,
  },
  historyList: {
    flex: 1,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginBottom: 4,
  },
  historyText: {
    fontSize: 14,
  },
  deleteBtn: {
    padding: 3,
    marginLeft: 6,
    borderRadius: 12,
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sidebarFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  appearanceSection: {
    marginBottom: 8,
  },
  appearanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  appearanceOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 12,
  },
  appearanceOption: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 9,
  },
  appearanceIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  appearanceOptionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  userProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  avatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#8AB4F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarMiniText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  userName: {
    fontSize: 14,
    fontWeight: '500',
  },
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  sheetCard: {
    position: 'absolute',
    width: CTX_CARD_W,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.25)',
    elevation: 6,
  },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  sheetItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sheetItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  confirmCard: {
    width: '80%',
    maxWidth: 320,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    boxShadow: '0px 10px 12px rgba(0, 0, 0, 0.4)',
    elevation: 10,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  confirmDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  confirmBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
