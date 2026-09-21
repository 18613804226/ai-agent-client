import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Dimensions,
  Keyboard,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootSiblingParent } from 'react-native-root-siblings';
import dayjs from 'dayjs';

import CustomDialog from '../src/components/CustomDialog';
import Sidebar from '../src/components/Sidebar';
import ChatArea from '../src/components/ChatArea';
import ChatInputBar from '../src/components/ChatInputBar';

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
  const [dialogVisible, setDialogVisible] = useState(false);

  const drawerTranslateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;

  // 键盘适配监听
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardHeightAnim, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });

    const subHide = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardHeightAnim, {
        toValue: 0,
        duration: e.duration || 200,
        useNativeDriver: false,
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
      Animated.timing(drawerTranslateX, { toValue: 0, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0.5, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(drawerTranslateX, { toValue: -DRAWER_WIDTH, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
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
          content: '你好！已完美解耦组件，代码结构焕然一新。',
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

  const handleDeleteChat = (e: any, id: string) => {
    e.stopPropagation();
    if (conversations.length <= 1) {
      setDialogVisible(true);
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
          return { ...conv, title: newTitle, messages: [...conv.messages, userMsg] };
        }
        return conv;
      })
    );

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
            return { ...conv, messages: [...conv.messages, aiMsg] };
          }
          return conv;
        })
      );
    }, 1000);
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <RootSiblingParent>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgApp }]}>
        {isMobile && (
          <View style={[styles.mobileTopBar, { backgroundColor: theme.bgSidebar, borderColor: theme.border }]}>
            <TouchableOpacity style={styles.menuToggleBtn} onPress={isMobileSidebarOpen ? closeDrawer : openDrawer}>
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
              <Sidebar
                conversations={conversations}
                activeId={activeId}
                onNewChat={handleNewChat}
                onSelectChat={handleSelectChat}
                onDeleteChat={handleDeleteChat}
                isDarkMode={isDarkMode}
                onToggleTheme={() => setIsDarkMode(!isDarkMode)}
                theme={theme}
              />
            </View>
          )}

          <Animated.View style={[styles.chatMainWrapper, { backgroundColor: theme.bgApp, paddingBottom: isMobile ? keyboardHeightAnim : 0 }]}>
            <View style={styles.chatCenterContainer}>
              <ChatArea messages={currentChat.messages} scrollViewRef={scrollViewRef} theme={theme} />
              <ChatInputBar inputText={inputText} setInputText={setInputText} onSend={handleSend} theme={theme} />
            </View>
          </Animated.View>

          {isMobile && showOverlay && (
            <View style={styles.mobileOverlayContainer}>
              <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeDrawer} />
              </Animated.View>
              <Animated.View style={[styles.sidebarMobileDrawer, { transform: [{ translateX: drawerTranslateX }] }, { borderColor: theme.border }]}>
                <Sidebar
                  conversations={conversations}
                  activeId={activeId}
                  onNewChat={handleNewChat}
                  onSelectChat={handleSelectChat}
                  onDeleteChat={handleDeleteChat}
                  isDarkMode={isDarkMode}
                  onToggleTheme={() => setIsDarkMode(!isDarkMode)}
                  theme={theme}
                />
              </Animated.View>
            </View>
          )}
        </View>
      </SafeAreaView>

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
  border: '#2A2B2D',
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
  inputBg: '#1E1F20',
  sendBtnActive: '#4b92ee',
    sendBtnHover: '#1977f1',
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
  inputBg: '#F0F4F9',
  sendBtnActive: '#4b92ee',
  sendBtnHover: '#1977f1',
  sendBtnDisabled: '#D8DEE4',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  mobileTopBar: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1 },
  menuToggleBtn: { padding: 6 },
  mobileTopTitle: { fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'center' },
  mainLayout: { flex: 1, flexDirection: 'row' },
  sidebarDesktop: { width: 260, borderRightWidth: 1 },
  mobileOverlayContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000' },
  sidebarMobileDrawer: { position: 'absolute', top: 0, left: 0, width: DRAWER_WIDTH, height: '100%', borderRightWidth: 1, zIndex: 101 },
  chatMainWrapper: { flex: 1 },
  chatCenterContainer: { flex: 1, maxWidth: 850, width: '100%', alignSelf: 'center', justifyContent: 'space-between' },
});