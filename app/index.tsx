import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
  ScrollView,
  Dimensions,
  Keyboard,
  Animated, // 💡 使用 React Native 自带的稳健动画库
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootSiblingParent } from 'react-native-root-siblings';
import dayjs from 'dayjs';
import Toast from 'react-native-root-toast';
import CustomDialog from '../src/components/CustomDialog';
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

const DRAWER_WIDTH = 280;

export default function ChatScreen() {
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const isMobile = screenWidth < 768;

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // 💡 使用内置 Animated 实现丝滑抽屉与背景淡入
  const drawerTranslateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;

  // 键盘弹出动画监听
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardHeightAnim, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });

    const subHide = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardHeightAnim, {
        toValue: 0,
        duration: e.duration || 200,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [keyboardHeightAnim]);

  const openDrawer = () => {
    setShowOverlay(true);
    setIsMobileSidebarOpen(true);
    Animated.parallel([
      Animated.timing(drawerTranslateX, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0.5,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(drawerTranslateX, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowOverlay(false);
      setIsMobileSidebarOpen(false);
    });
  };

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
      if (window.width >= 768) {
        setShowOverlay(false);
        setIsMobileSidebarOpen(false);
      }
    });
    return () => subscription?.remove();
  }, []);

  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: '1',
      title: 'React Native 稳定动画方案',
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: '你好！已完美接入内置动画引擎，支持抽屉平滑滑入、删除对话与键盘完美跟随。',
          time: dayjs().format('HH:mm'),
        },
      ],
    },
  ]);

  const [activeId, setActiveId] = useState<string>('1');
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  const currentChat = conversations.find((c) => c.id === activeId) || conversations[0];

  const handleNewChat = () => {
    const newConv: Conversation = {
      id: Date.now().toString(),
      title: `新对话 ${conversations.length + 1}`,
      messages: [
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: '新会话已开启，请输入你想探讨的课题。',
          time: dayjs().format('HH:mm'),
        },
      ],
    };
    setConversations([newConv, ...conversations]);
    setActiveId(newConv.id);
    if (isMobile) closeDrawer();
  };

  const handleSelectChat = (id: string) => {
    setActiveId(id);
    if (isMobile) closeDrawer();
  };
  const [dialogVisible, setDialogVisible] = useState(false);
  // 💡 历史对话删除逻辑
  const handleDeleteChat = (e: any, id: string) => {
    e.stopPropagation();

    if (conversations.length <= 1) {
      setDialogVisible(true); // 💡 触发弹窗显示
      return;
    }

    const nextConversations = conversations.filter((c) => c.id !== id);
    setConversations(nextConversations);

    if (activeId === id) {
      setActiveId(nextConversations[0].id);
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      time: dayjs().format('HH:mm'),
    };

    const currentInput = inputText;
    setInputText('');

    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === activeId) {
          const newTitle = conv.messages.length === 1 ? currentInput.slice(0, 14) + '...' : conv.title;
          return {
            ...conv,
            title: newTitle,
            messages: [...conv.messages, userMsg],
          };
        }
        return conv;
      })
    );

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `正在处理您的请求：“${currentInput}”...`,
        time: dayjs().format('HH:mm'),
      };

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === activeId) {
            return {
              ...conv,
              messages: [...conv.messages, aiMsg],
            };
          }
          return conv;
        })
      );
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 1000);
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  const renderSidebarContent = () => (
    <View style={[styles.sidebarInner, { backgroundColor: theme.bgSidebar }]}>
      <View style={styles.sidebarTop}>
        <TouchableOpacity style={[styles.newChatBtn, { backgroundColor: theme.btnBg }]} onPress={handleNewChat}>
          <Text style={[styles.newChatBtnText, { color: theme.btnText }]}>+ 发起新对话</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
        <Text style={[styles.historyCategoryTitle, { color: theme.textMuted }]}>最近记录</Text>
        {conversations.map((conv) => {
          const isActive = conv.id === activeId;
          return (
            <TouchableOpacity
              key={conv.id}
              style={[styles.historyItem, isActive && { backgroundColor: theme.historyActiveBg }]}
              onPress={() => handleSelectChat(conv.id)}
            >
              <Text
                style={[styles.historyText, { color: isActive ? theme.historyActiveText : theme.textMain }, { flex: 1 }]}
                numberOfLines={1}
              >
                {conv.title}
              </Text>

              {/* 💡 历史对话删除按钮 */}
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={(e) => handleDeleteChat(e, conv.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.deleteBtnText, { color: theme.textMuted }]}>×</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.sidebarFooter, { borderTopColor: theme.border }]}>
        <TouchableOpacity style={styles.footerItem} onPress={() => setIsDarkMode(!isDarkMode)}>
          <Text style={{ fontSize: 16 }}>{isDarkMode ? '🌞' : '🌙'}</Text>
          <Text style={[styles.footerText, { color: theme.textMain }]}>
            {isDarkMode ? '浅色模式' : '暗黑模式'}
          </Text>
        </TouchableOpacity>
        <View style={styles.userProfile}>
          <View style={styles.avatarMini}>
            <Text style={styles.avatarMiniText}>王</Text>
          </View>
          <Text style={[styles.userName, { color: theme.textMain }]} numberOfLines={1}>王 toto</Text>
        </View>
      </View>
    </View>
  );

  const renderChatContent = () => (
    <Animated.View
      style={[
        styles.chatMainWrapper,
        { backgroundColor: theme.bgApp },
        { paddingBottom: isMobile ? keyboardHeightAnim : 0 },
      ]}
    >
      <View style={styles.chatCenterContainer}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {currentChat.messages.map((item) => {
            const isUser = item.role === 'user';
            return (
              <View
                key={item.id}
                style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}
              >
                {/* {!isUser && (
                  <View style={[styles.avatarAi, { backgroundColor: theme.aiAvatarBg }]}>
                    <Text style={styles.avatarText}>✦</Text>
                  </View>
                )} */}

                <View
                  style={[
                    styles.bubble,
                    isUser
                      ? [styles.bubbleUser, { backgroundColor: theme.bubbleUserBg }]
                      : [styles.bubbleAi, { backgroundColor: theme.bubbleAiBg, borderColor: theme.border }],
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      { color: isUser ? theme.bubbleUserText : theme.bubbleAiText },
                    ]}
                  >
                    {item.content}
                  </Text>
                  <Text
                    style={[
                      styles.timeText,
                      { color: isUser ? theme.timeUserText : theme.timeAiText },
                    ]}
                  >
                    {item.time}
                  </Text>
                </View>

                {/* {isUser && (
                  <View style={styles.avatarUser}>
                    <Text style={styles.avatarText}>我</Text>
                  </View>
                )} */}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.inputAreaWrapper}>
          <View style={[styles.inputBar, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <TextInput
              style={[styles.input, { color: theme.textMain }]}
              placeholder="问问 AI 智能体..."
              placeholderTextColor={theme.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              textAlignVertical="center"
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                { backgroundColor: inputText.trim() ? theme.sendBtnActive : theme.sendBtnDisabled },
              ]}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Text style={styles.sendButtonText}>↑</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.footerTip, { color: theme.textMuted }]}>
            AI 智能体可能会产生错误信息。
          </Text>
        </View>
      </View>
    </Animated.View>
  );

  return (
    <RootSiblingParent>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgApp }]}>
        {isMobile && (
          <View style={[styles.mobileTopBar, { backgroundColor: theme.bgSidebar, borderColor: theme.border }]}>
            <TouchableOpacity
              style={styles.menuToggleBtn}
              onPress={() => {
                if (isMobileSidebarOpen) {
                  closeDrawer();
                } else {
                  openDrawer();
                }
              }}
            >
              <Text style={{ fontSize: 18, color: theme.textMain }}>☰</Text>
            </TouchableOpacity>
            <Text style={[styles.mobileTopTitle, { color: theme.textMain }]} numberOfLines={1}>
              {currentChat.title}
            </Text>
            <View style={{ width: 30 }} />
          </View>
        )}

        <View style={styles.mainLayout}>
          {!isMobile && (
            <View style={[styles.sidebarDesktop, { borderColor: theme.border }]}>
              {renderSidebarContent()}
            </View>
          )}

          {renderChatContent()}

          {isMobile && showOverlay && (
            <View style={styles.mobileOverlayContainer}>
              <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={1}
                  onPress={closeDrawer}
                />
              </Animated.View>

              <Animated.View style={[styles.sidebarMobileDrawer, { transform: [{ translateX: drawerTranslateX }] }, { borderColor: theme.border }]}>
                {renderSidebarContent()}
              </Animated.View>
            </View>
          )}
        </View>
      </SafeAreaView>
      {/* 💡 引入封装好的高档大厂弹窗组件 */}
      <CustomDialog
        visible={dialogVisible}
        title="提示"
        message="保留至少一个对话，无法继续删除。"
        confirmText="知道了"
        onConfirm={() => setDialogVisible(false)}
        isDarkMode={isDarkMode}
        theme={theme}
      />
    </RootSiblingParent>

  );
}

const darkTheme = {
  bgApp: '#131314',
  bgSidebar: '#1E1F20',
  border: '#333538',
  textMain: '#E3E3E3',
  textMuted: '#8E918F',
  btnBg: '#28292A',
  btnText: '#E3E3E3',
  historyActiveBg: '#004A77',
  historyActiveText: '#C2E7FF',
  bubbleUserBg: '#004A77',
  bubbleUserText: '#E3E3E3',
  bubbleAiBg: '#1E1F20',
  bubbleAiText: '#E3E3E3',
  timeUserText: 'rgba(227,227,227,0.6)',
  timeAiText: '#8E918F',
  aiAvatarBg: '#8AB4F8',
  inputBg: '#1E1F20',
  sendBtnActive: '#8AB4F8',
  sendBtnDisabled: '#333538',
};

const lightTheme = {
  bgApp: '#F9FBFD',
  bgSidebar: '#F0F4F9',
  border: '#D8DEE4',
  textMain: '#1F1F1F',
  textMuted: '#5E5E5E',
  btnBg: '#DEE4EA',
  btnText: '#1F1F1F',
  historyActiveBg: '#D3E3FD',
  historyActiveText: '#041E49',
  bubbleUserBg: '#D3E3FD',
  bubbleUserText: '#041E49',
  bubbleAiBg: '#F0F4F9',
  bubbleAiText: '#1F1F1F',
  timeUserText: '#5E5E5E',
  timeAiText: '#5E5E5E',
  aiAvatarBg: '#1A73E8',
  inputBg: '#F0F4F9',
  sendBtnActive: '#1A73E8',
  sendBtnDisabled: '#D8DEE4',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mobileTopBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  menuToggleBtn: {
    padding: 6,
  },
  mobileTopTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebarDesktop: {
    width: 260,
    borderRightWidth: 1,
  },
  mobileOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  sidebarMobileDrawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DRAWER_WIDTH,
    height: '100%',
    borderRightWidth: 1,
    zIndex: 101,
  },
  sidebarInner: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  sidebarTop: {
    marginBottom: 12,
  },
  newChatBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignItems: 'center',
  },
  newChatBtnText: {
    fontWeight: '500',
    fontSize: 14,
  },
  historyList: {
    flex: 1,
  },
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
  historyText: {
    fontSize: 14,
  },
  deleteBtn: {
    padding: 4,
    marginLeft: 8,
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sidebarFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  footerText: {
    fontSize: 14,
    marginLeft: 10,
  },
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
  avatarMiniText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  userName: {
    fontSize: 14,
    fontWeight: '500',
  },
  chatMainWrapper: {
    flex: 1,
  },
  chatCenterContainer: {
    flex: 1,
    maxWidth: 850,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'space-between',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAi: {
    justifyContent: 'flex-start',
  },
  avatarAi: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarUser: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#34A853',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  bubble: {
    maxWidth: '75%',
    padding: 14,
    borderRadius: 16,
  },
  bubbleUser: {
    borderTopRightRadius: 4,
  },
  bubbleAi: {
    borderTopLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  timeText: {
    fontSize: 10,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  inputAreaWrapper: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
  inputBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    fontSize: 15,
    paddingVertical: 6,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  footerTip: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});