import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
interface UploadedFile {
  id: string;
  name: string;
  size?: string;
}

interface SidebarProps {
  conversations: any[];
  activeId: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (e: any, id: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
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

function HoverTouchable({
  style,
  hoverBg = 'rgba(0, 0, 0, 0.06)', // 默认采用新建对话同款的轻量悬停加深/提亮效果
  onPress,
  activeOpacity = 0.7,
  children,
  ...props
}: HoverItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <TouchableOpacity
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
}

export default function Sidebar({
  conversations,
  activeId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isDarkMode,
  onToggleTheme,
  theme,
  uploadedFiles,
  onUploadFile,
  onDeleteFile,
}: SidebarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.sidebarInner,
        { backgroundColor: theme.bgSidebar },
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
                style={[
                  styles.fileItem,
                  {
                    backgroundColor:
                      theme.historyActiveBg || 'rgba(255,255,255,0.05)',
                  },
                ]}
                hoverBg="rgba(150, 150, 150, 0.15)"
                activeOpacity={1}
              >
                <Text
                  style={[styles.fileText, { color: theme.textMain }]}
                  numberOfLines={1}
                >
                  📄 {file.name}
                </Text>
                <TouchableOpacity
                  onPress={() => onDeleteFile(file.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text
                    style={[styles.deleteBtnText, { color: theme.textMuted }]}
                  >
                    <Svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={theme.textMuted} // 直接用你的主题色
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <Path d="M18 6L6 18M6 6l12 12" />
                    </Svg>
                  </Text>
                </TouchableOpacity>
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
                style={[
                  styles.historyItem,
                  isActive && { backgroundColor: theme.historyActiveBg },
                ]}
                hoverBg={theme.historyActiveBg}
                onPress={() => onSelectChat(conv.id)}
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

                {/* 💡 方案：用 HoverTouchable 包裹删除按钮，或者让删除按钮自身响应悬停 */}
                <HoverTouchable
                  style={styles.deleteBtn}
                  onPress={() => onDeleteChat(null, conv.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  // 鼠标移到删除按钮上时，让背景微微亮起（可选）
                  hoverBg={theme.deleteHoverBg || 'rgba(255, 0, 0, 0.1)'}
                >
                  {/* 使用函数返回或者利用子组件状态，但在简易封装中，
                      最简单的办法是：如果 HoverTouchable 不支持直接传 hover 状态给子组件，
                      我们可以写一个内联的 Web 态 hover 样式，或者把 SVG 的颜色交由外部控制 */}
                  <Svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    // 💡 如果当前会话是高亮态，图标用激活色；平时用 muted 色。
                    // Web 端如果想要更细致的 hover 变色，可以通过下面的样式 Hack 搞定
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
              </HoverTouchable>
            );
          })}
        </ScrollView>
      </View>

      {/* 5. 底部：主题切换与个人信息 */}
      <View
        style={[
          styles.sidebarFooter,
          { borderTopColor: theme.border || 'rgba(255,255,255,0.1)' },
        ]}
      >
        <HoverTouchable
          style={styles.footerItem}
          hoverBg={theme.historyActiveBg}
          onPress={onToggleTheme}
        >
          <Text style={{ fontSize: 16 }}>{isDarkMode ? '🌞' : '🌙'}</Text>
          <Text style={[styles.footerText, { color: theme.textMain }]}>
            {isDarkMode ? '浅色模式' : '暗黑模式'}
          </Text>
        </HoverTouchable>
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
  );
}

const styles = StyleSheet.create({
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
  categoryTitle: {
    fontSize: 12,
    marginVertical: 6,
    paddingHorizontal: 4,
    fontWeight: '500',
  },
  fileListContainer: {
    maxHeight: 130,
    marginVertical: 2,
  },
  subScrollContainer: {
    maxHeight: 100,
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
  fileText: {
    fontSize: 13,
    flex: 1,
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
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  footerText: {
    fontSize: 14,
    marginLeft: 10,
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
});
