import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

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
  return (
    <View style={[styles.sidebarInner, { backgroundColor: theme.bgSidebar }]}>
      {/* 1. 顶部：新建对话按钮 (统一圆角与高度) */}
      <View style={styles.sidebarTop}>
        <TouchableOpacity
          style={[styles.newChatBtn, { backgroundColor: theme.btnBg }]}
          onPress={onNewChat}
          activeOpacity={0.8}
        >
          <Text style={[styles.newChatBtnText, { color: theme.btnText }]}>
            + 发起新对话
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. 中部：知识库上传区块 (优化卡片质感) */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onUploadFile}
        style={[
          styles.uploadSection,
          { borderColor: theme.uploadBorder || '#3b82f6' },
        ]}
      >
        <Text style={[styles.uploadText, { color: theme.textMain }]}>
          📁 知识库上传
        </Text>
      </TouchableOpacity>

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
              <View
                key={file.id}
                style={[
                  styles.fileItem,
                  {
                    backgroundColor:
                      theme.historyActiveBg || 'rgba(255,255,255,0.05)',
                  },
                ]}
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
                    ×
                  </Text>
                </TouchableOpacity>
              </View>
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
              <TouchableOpacity
                key={conv.id}
                style={[
                  styles.historyItem,
                  isActive && { backgroundColor: theme.historyActiveBg },
                ]}
                onPress={() => onSelectChat(conv.id)}
                activeOpacity={0.7}
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
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={(e) => onDeleteChat(e, conv.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text
                    style={[styles.deleteBtnText, { color: theme.textMuted }]}
                  >
                    ×
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
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
        <TouchableOpacity
          style={styles.footerItem}
          onPress={onToggleTheme}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 16 }}>{isDarkMode ? '🌞' : '🌙'}</Text>
          <Text style={[styles.footerText, { color: theme.textMain }]}>
            {isDarkMode ? '浅色模式' : '暗黑模式'}
          </Text>
        </TouchableOpacity>
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
    borderRadius: 16, // 统一精致圆角
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
    padding: 2,
    marginLeft: 6,
  },
  deleteBtnText: {
    fontSize: 15,
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
    borderRadius: 16,
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
