import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

interface SidebarProps {
  conversations: any[];
  activeId: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (e: any, id: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  theme: any;
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
}: SidebarProps) {
  return (
    <View style={[styles.sidebarInner, { backgroundColor: theme.bgSidebar }]}>
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
  historyList: { flex: 1 },
  historyCategoryTitle: {
    fontSize: 12,
    marginVertical: 8,
    paddingHorizontal: 8,
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
});
