import 'punycode';
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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootSiblingParent } from 'react-native-root-siblings';
import dayjs from 'dayjs';
// 💡 引入本地存储
import AsyncStorage from '@react-native-async-storage/async-storage';

import Sidebar from '../src/components/Sidebar';
import ChatArea from '../src/components/ChatArea';
import ChatInputBar from '../src/components/ChatInputBar';
import { api } from '../src/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
const STORAGE_KEY_CONVS = '@nexus_ai_conversations';
const STORAGE_KEY_ACTIVE_ID = '@nexus_ai_active_id';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [screenWidth, setScreenWidth] = useState(
    Dimensions.get('window').width,
  );
  const isMobile = screenWidth < 768;

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  const drawerTranslateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [isKeyboardUp, setIsKeyboardUp] = useState(false);
  // 键盘适配监听
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardUp(true);
      Animated.timing(keyboardHeightAnim, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });

    const subHide = Keyboard.addListener(hideEvent, (e) => {
      setIsKeyboardUp(false);
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
    // 💡 1. 核心：点击打开侧边栏时，瞬间收起键盘
    Keyboard.dismiss();
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
        toValue: 1,
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

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null!);

  // 💡 页面刚加载时：优先从本地 AsyncStorage 读取缓存记录
  useEffect(() => {
    const loadCachedData = async () => {
      try {
        const cachedConvs = await AsyncStorage.getItem(STORAGE_KEY_CONVS);
        const cachedActiveId = await AsyncStorage.getItem(
          STORAGE_KEY_ACTIVE_ID,
        );

        if (cachedConvs) {
          const parsedConvs = JSON.parse(cachedConvs);
          if (parsedConvs.length > 0) {
            setConversations(parsedConvs);
            setActiveId(
              cachedActiveId &&
                parsedConvs.some((c: Conversation) => c.id === cachedActiveId)
                ? cachedActiveId
                : parsedConvs[0].id,
            );
            return;
          }
        }

        // 如果没有本地缓存，则向后端请求创建一个初始会话
        const sessionData: any = await api.createSession('新对话');
        const defaultConv: Conversation = {
          id: sessionData.id,
          title: sessionData.title || '新对话',
          messages: [
            {
              id: '1',
              role: 'assistant',
              content: '你好！已连接至 AI 智能助手，请输入你想探讨的课题。',
              time: dayjs().format('HH:mm'),
            },
          ],
        };
        setConversations([defaultConv]);
        setActiveId(sessionData.id);
      } catch (error) {
        console.error('加载本地缓存或初始化会话失败:', error);
      }
    };
    loadCachedData();
  }, []);

  // 💡 每当 conversations 或 activeId 发生变化时，自动同步保存到本地
  useEffect(() => {
    if (conversations.length > 0) {
      AsyncStorage.setItem(
        STORAGE_KEY_CONVS,
        JSON.stringify(conversations),
      ).catch((err) => console.error('保存会话缓存失败:', err));
    }
  }, [conversations]);

  useEffect(() => {
    if (activeId) {
      AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeId).catch((err) =>
        console.error('保存当前活跃ID缓存失败:', err),
      );
    }
  }, [activeId]);

  const currentChat =
    conversations.find((c) => c.id === activeId) || conversations[0];

  const handleNewChat = async () => {
    try {
      const sessionData: any = await api.createSession(
        `新对话 ${conversations.length + 1}`,
      );

      const newConv: Conversation = {
        id: sessionData.id,
        title: sessionData.title,
        messages: [
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: '新会话已开启，请输入你想探讨的课题。',
            time: dayjs().format('HH:mm'),
          },
        ],
      };

      setConversations((prev) => [newConv, ...prev]);
      if (isMobile) closeDrawer();
      setActiveId(sessionData.id);
      return sessionData.id;
    } catch (error) {
      console.error('创建会话失败:', error);
    }
  };

  const handleSelectChat = (id: string) => {
    setActiveId(id);
    if (isMobile) closeDrawer();
  };

  const handleDeleteChat = async (e: any, id: string) => {
    e.stopPropagation();
    const nextConversations = conversations.filter((c) => c.id !== id);

    if (nextConversations.length === 0) {
      try {
        const sessionData: any = await api.createSession('新对话');
        const newConv: Conversation = {
          id: sessionData.id,
          title: sessionData.title || '新对话',
          messages: [
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: '新会话已开启，请输入你想探讨的课题。',
              time: dayjs().format('HH:mm'),
            },
          ],
        };
        setConversations([newConv]);
        setActiveId(sessionData.id);
      } catch (error) {
        console.error('重建默认会话失败:', error);
      }
      return;
    }

    setConversations(nextConversations);
    if (activeId === id) {
      setActiveId(nextConversations[0].id);
    }
  };

  const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
  // 1. 辅助：延时函数
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // 2. 辅助：更新特定 AI 消息的内容
  const updateAiMessageContent = (
    setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>,
    activeId: string,
    msgId: string,
    newContent: string,
  ) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === activeId) {
          return {
            ...conv,
            messages: conv.messages.map((msg) =>
              msg.id === msgId ? { ...msg, content: newContent } : msg,
            ),
          };
        }
        return conv;
      }),
    );
  };

  // 3. 核心流式打字机动画执行器（带行缓冲区修复）
  // 3. 稳健的流式接收与直接拼接（绝对不乱）
  const runTypewriterEffect = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>,
    activeId: string,
    thinkingMsgId: string,
  ) => {
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let isFirstChunk = true;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('data:')) {
          try {
            const jsonText = trimmedLine.replace('data:', '').trim();
            if (jsonText === '[DONE]') continue;

            const parsed = JSON.parse(jsonText);
            if (parsed.content) {
              // 收到第一个有效字符时，清空“思考中...”
              if (isFirstChunk) {
                accumulatedText = '';
                isFirstChunk = false;
              }

              // 直接顺次拼接后端传来的内容增量
              accumulatedText += parsed.content;

              // 实时更新前端 UI
              updateAiMessageContent(
                setConversations,
                activeId,
                thinkingMsgId,
                accumulatedText,
              );
            }
          } catch (e) {
            // 忽略解析小错误
          }
        }
      }
    }
  };

  // 4. 主控函数 handleSend（变得非常轻量清爽）
  // 1. 在组件内部定义 AbortController 引用和生成状态
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isGenerating, setIsGenerating] = useState(false); // 是否正在生成中

  // 2. 修改后的 handleSend 核心方法（带 AbortController）
  const handleSend = async () => {
    if (!inputText.trim() || !activeId) return;

    const currentInput = inputText;
    setInputText('');

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentInput,
      time: dayjs().format('HH:mm'),
    };

    const thinkingMsgId = (Date.now() + 1).toString();
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      role: 'assistant',
      content: '思考中...',
      time: dayjs().format('HH:mm'),
    };

    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === activeId) {
          const newTitle =
            conv.messages.length === 1
              ? currentInput.slice(0, 14) + '...'
              : conv.title;
          return {
            ...conv,
            title: newTitle,
            messages: [...conv.messages, userMsg, thinkingMsg],
          };
        }
        return conv;
      }),
    );

    // 💡 关键：每次发送前创建一个新的 AbortController，并标记为正在生成
    abortControllerRef.current = new AbortController();
    setIsGenerating(true);

    try {
      const response = await fetch(`${baseURL}/chat/${activeId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentInput }),
        signal: abortControllerRef.current.signal, // 💡 绑定中断信号
      });

      if (!response.body) {
        throw new Error('ReadableStream not supported');
      }

      const reader = response.body.getReader();
      await runTypewriterEffect(
        reader,
        setConversations,
        activeId,
        thinkingMsgId,
      );
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('用户手动终止了生成');
        // 如果被终止，把“思考中...”或者残缺的内容稍微处理下或保留
      } else {
        console.error('发送消息失败:', error);
        updateAiMessageContent(
          setConversations,
          activeId,
          thinkingMsgId,
          '抱歉，服务器开小差了，请检查网络或后端连接。',
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // 💡 3. 点击“停止生成”按钮时触发的方法
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(); // 瞬间掐断网络，触发后端 req.on('close')
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  };

  const theme = isDarkMode
    ? { ...darkTheme, isDark: true }
    : { ...lightTheme, isDark: false };

  return (
    <RootSiblingParent>
      <View style={[styles.container, { backgroundColor: theme.bgApp }]}>
        {isMobile && (
          <View
            style={[
              styles.mobileTopBar,
              {
                backgroundColor: theme.bgSidebar,
                borderColor: theme.border,
                // 💡 针对安卓，给一个固定的顶部安全高度（通常是 24~32 或直接适配状态栏）
                paddingTop: Platform.OS === 'ios' ? insets.top : 24,
                height: 48 + (Platform.OS === 'ios' ? insets.top : 24),
              },
            ]}
          >
            <TouchableOpacity
              style={styles.menuToggleBtn}
              onPress={isMobileSidebarOpen ? closeDrawer : openDrawer}
            >
              <Text style={{ fontSize: 18, color: theme.textMain }}>☰</Text>
            </TouchableOpacity>
            <Text
              style={[styles.mobileTopTitle, { color: theme.textMain }]}
              numberOfLines={1}
            >
              {currentChat?.title || '加载中...'}
            </Text>
            <View style={{ width: 30 }} />
          </View>
        )}

        <View style={styles.mainLayout}>
          {!isMobile && (
            <View
              style={[styles.sidebarDesktop, { borderColor: theme.border }]}
            >
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

          {/* 💡 替换 KeyboardAvoidingView，改用我们精准控制的动画底部偏移 */}
          <Animated.View
            style={[
              styles.chatMainWrapper,
              {
                // 安卓下利用键盘高度动画向上顶起，iOS 继续靠自身机制或动画
                transform: [
                  {
                    translateY:
                      Platform.OS === 'android'
                        ? Animated.multiply(keyboardHeightAnim, -1)
                        : 0,
                  },
                ],
              },
            ]}
          >
            <View style={styles.chatCenterContainer}>
              <ChatArea
                messages={currentChat?.messages || []}
                scrollViewRef={scrollViewRef}
                theme={theme}
                isMobile={isMobile} // 💡 像这样把你的 isMobile 状态传给它
              />
              <ChatInputBar
                inputText={inputText}
                setInputText={setInputText}
                onSend={handleSend}
                theme={theme}
                onStop={handleStopGeneration}
                isGenerating={isGenerating}
                isKeyboardUp={isKeyboardUp}
              />
            </View>
          </Animated.View>

          {isMobile && showOverlay && (
            <View style={styles.mobileOverlayContainer}>
              <Animated.View
                style={[styles.backdrop, { opacity: backdropOpacity }]}
              >
                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={1}
                  onPress={closeDrawer}
                />
              </Animated.View>
              <Animated.View
                style={[
                  styles.sidebarMobileDrawer,
                  { transform: [{ translateX: drawerTranslateX }] },
                  { borderColor: theme.border },
                ]}
              >
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
      </View>
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
  mobileTopBar: {
    // height: 48 + 24, // 💡 增加高度以避开手机顶部状态栏
    // paddingTop: 24, // 💡 让标题文字下移，不和手机时间、电量重叠
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    zIndex: 10, // 💡 保证顶部栏在聊天区之上，但在抽屉之下
  },
  menuToggleBtn: { padding: 6 },
  mobileTopTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  mainLayout: { flex: 1, flexDirection: 'row' },
  sidebarDesktop: { width: 260, borderRightWidth: 1 },
  mobileOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1000,
  },
  sidebarMobileDrawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DRAWER_WIDTH,
    height: '100%',
    borderRightWidth: 1,
    zIndex: 1001,
  },
  chatMainWrapper: { flex: 1, backgroundColor: 'transparent', zIndex: 1 },
  chatCenterContainer: {
    flex: 1,
    maxWidth: 850,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'column', // 确保是上下垂直排列
  },
});
