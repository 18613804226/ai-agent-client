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
  uploadedFiles: UploadedFile[]; // 💡 新增：文件列表数据
  onUploadFile: () => void; // 💡 新增：点击上传的动作
  onDeleteFile: (id: string) => void; // 💡 新增：删除文件的动作
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
  onUploadFile, // 💡 1. 在这里加上它
  onDeleteFile, // 💡 2. 顺便也加上删除文件方法
}: SidebarProps) {
  // 💡 这里不需要再写 api.getSessions() 了，数据由父组件通过 conversations 传入

  return (
    <View style={[styles.sidebarInner, { backgroundColor: theme.bgSidebar }]}>
      {/* 1. 顶部：新建对话按钮 */}
      <View style={styles.sidebarTop}>
        <TouchableOpacity
          style={[styles.newChatBtn, { backgroundColor: theme.btnBg }]}
          onPress={onNewChat}
        >
          <Text style={[styles.newChatBtnText, { color: theme.btnText }]}>
            + 发起新对话
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. 中部：文件库上传区块（给予适量的固定或自适应高度，不写死 40% 导致过大） */}
      <TouchableOpacity activeOpacity={0.7} onPress={onUploadFile}>
        <View style={[styles.uploadSection, { borderColor: theme.border }]}>
          <Text style={[styles.uploadText, { color: theme.textMain }]}>
            📁 知识库上传
          </Text>
        </View>
      </TouchableOpacity>
      {/* 💡 3. 已上传文件列表展示区 */}
      {uploadedFiles && uploadedFiles.length > 0 && (
        <View style={styles.fileListContainer}>
          <Text
            style={[styles.historyCategoryTitle, { color: theme.textMuted }]}
          >
            已上传文件 ({uploadedFiles.length})
          </Text>
          {uploadedFiles.map((file) => (
            <View
              key={file.id}
              style={[
                styles.fileItem,
                { backgroundColor: theme.historyActiveBg },
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
        </View>
      )}
      {/* 3. 中部：历史记录列表（使用 flex: 1 自动填满剩余中间空间） */}
      <ScrollView
        style={styles.historyList}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.historyCategoryTitle, { color: theme.textMuted }]}>
          最近记录
        </Text>
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
            >
              <Text
                style={[
                  styles.historyText,
                  {
                    color: isActive ? theme.historyActiveText : theme.textMain,
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
      <View style={[styles.sidebarFooter, { borderTopColor: theme.border }]}>
        <TouchableOpacity style={styles.footerItem} onPress={onToggleTheme}>
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

// styles 保持不变...
const styles = StyleSheet.create({
  sidebarInner: { flex: 1, padding: 12, justifyContent: 'space-between' },
  sidebarTop: { marginBottom: 12 },
  newChatBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignItems: 'center',
  },
  newChatBtnText: { fontWeight: '500', fontSize: 14 },
  historyList: { flex: 1, marginVertical: 4 },
  historyCategoryTitle: {
    fontSize: 12,
    marginVertical: 8,
    paddingHorizontal: 8,
  },
  uploadSection: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  historyText: { fontSize: 14 },
  deleteBtn: { padding: 4, marginLeft: 8 },
  deleteBtnText: { fontSize: 16, fontWeight: 'bold' },
  sidebarFooter: { borderTopWidth: 1, paddingTop: 10 },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  footerText: { fontSize: 14, marginLeft: 10 },
  userProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
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
  avatarMiniText: { color: '#000', fontWeight: 'bold', fontSize: 12 },
  userName: { fontSize: 14, fontWeight: '500' },
  fileListContainer: {
    maxHeight: 150, // 限制文件列表最大高度，避免把历史记录挤压太小
    marginVertical: 4,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 3,
  },
  fileText: {
    fontSize: 13,
    flex: 1,
  },
  uploadText: {
    cursor: 'pointer',
  },
});
