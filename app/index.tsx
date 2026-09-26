import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Platform,
  ScrollView,
  PanResponder,
  Animated,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootSiblingParent } from 'react-native-root-siblings';
import { DrawerActions } from 'expo-router/react-navigation';
import { useNavigation } from 'expo-router';

import Sidebar from '../src/components/Sidebar';
import ChatArea from '../src/components/ChatArea';
import ChatInputBar from '../src/components/ChatInputBar';
import { MobileHeader } from '../src/components/MobileHeader';

import { useKeyboardAnimation } from '../src/hooks/useKeyboardAnimation';
import GlobalToastContainer from '../src/components/GlobalToast';
import { useKnowledgeFiles } from '../src/hooks/useKnowledgeFiles';
import { useImagePicker } from '../src/hooks/useImagePicker';
import { useTheme, useChat } from './_layout'; // 💡 1. 引入根布局的 useTheme 和全局 useChat
import { speakMessage, stopSpeech } from '../src/utils/speech';
import CustomActionSheet from '../src/components/CustomActionSheet';
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();

  // 从 Context 获取全局主题
  const { isDarkMode, toggleTheme, theme } = useTheme();

  // 💡 2. 核心修改：直接从全局共享的 Context 获取聊天状态，不再私自调用 useChatManager()！
  const {
    conversations,
    activeId,
    currentChat,
    inputText,
    setInputText,
    isGenerating,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleSend,
    handleStopGeneration,
    autoRead, // 💡 新增
    toggleAutoRead,
    isAtBottomRef,
    scrollViewRef,
    handleScroll,
    streamingRenderMsg,
  } = useChat();

  const {
    selectedImages,
    setSelectedImages,
    handlePickImage,
    clearImages,
    isSheetVisible, // 👈 必须返回这个
    setIsSheetVisible, // 👈 必须返回这个
    handlePickDocument, // 👈 使用新名字
    openCamera,
    openImageLibrary,
  } = useImagePicker();
  // 定义你的菜单列表（和截图里的风格一致）
  const menuItems = [
    ...(Platform.OS !== 'web'
      ? [
          {
            id: 'camera',
            icon: '📸',
            label: '拍照',
            onPress: openCamera,
          },
        ]
      : []),
    {
      id: 'library',
      icon: '🖼️',
      label: '从相册选择',
      onPress: openImageLibrary, // 👈 均打开图片库
    },
    {
      id: 'file',
      icon: '📎',
      label: '上传文件',
      onPress: handlePickDocument,
    },
    // { id: 'canvas', icon: '🎨', label: 'Canvas', onPress: () => {} }
  ];
  const { uploadedFiles, handleUploadFile, handleDeleteFile } =
    useKnowledgeFiles();
  const { keyboardHeightAnim, isKeyboardUp } = useKeyboardAnimation();

  const handleSendWithImages = () => {
    // 这里你可以把 selectedImages 传给后端或你的全局状态
    console.log('准备发送文字:', inputText);
    console.log('准备发送图片:', selectedImages);

    handleSend(); // 调用原发送
    clearImages(); // 发送完毕后清空图片
  };

  // 组装消息，流式消息临时替换
  const allMessages = useMemo(() => {
    const msgList = currentChat?.messages ?? [];
    if (!streamingRenderMsg) return msgList;

    return msgList.map((msg) => {
      if (msg.id === streamingRenderMsg.msgId) {
        return {
          ...msg,
          content: streamingRenderMsg.content,
          thought: streamingRenderMsg.thought,
          isStreaming: true,
        };
      }
      return msg;
    });
  }, [currentChat?.messages, streamingRenderMsg]);

  // 💡 三端精准判断
  const screenWidth = Dimensions.get('window').width;
  const isPCWeb = Platform.OS === 'web' && screenWidth > 768; // 电脑端网页
  const isMobileWeb = Platform.OS === 'web' && screenWidth <= 768; // 手机 H5 网页

  // 💡 针对三端各自配置不同的悬浮菜单坐标样式
  const sheetPositionStyle = isPCWeb
    ? { bottom: 94, left: 'calc(50% - 270px)' } // 🖥️ PC 网页端：依据居中输入框进行精确定位
    : isMobileWeb
      ? { bottom: 94, left: 16 } // 📱 手机 H5 端：依据移动网页的 + 号定位
      : { bottom: 94, left: 20 };

  const openDrawer = () => {
    if (!isPCWeb) {
      navigation.dispatch(DrawerActions.openDrawer());
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isPCWeb) return false;
        return (
          gestureState.dx > 5 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 0.5
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!isPCWeb && gestureState.dx > 20) {
          openDrawer();
        }
      },
    }),
  ).current;

  // 💡 用一个状态锁记录当前消息是否已经朗读过，防止重复触发
  const hasSpokenMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 如果总开关没开，或者当前 AI 还在生成中（正在吐字），就直接返回，不触发朗读
    if (!autoRead || isGenerating) {
      return;
    }

    const messages = currentChat?.messages || [];
    const lastMsg = messages[messages.length - 1];

    // 条件：
    // 1. 最后一条消息必须是 AI 回复的
    // 2. 这条消息必须有实质内容
    // 3. 这条消息还没被朗读过
    if (
      lastMsg &&
      lastMsg.role === 'assistant' &&
      lastMsg.content &&
      hasSpokenMessageIdRef.current !== lastMsg.id
    ) {
      // 锁定当前消息 ID，确保整段回复只朗读一次
      hasSpokenMessageIdRef.current = lastMsg.id;

      // 延迟一小会儿等 UI 完全渲染稳定，然后朗读整段完整的内容
      const timer = setTimeout(() => {
        speakMessage(lastMsg.content);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [currentChat?.messages, isGenerating, autoRead]);

  return (
    <RootSiblingParent>
      <View
        style={[styles.container, { backgroundColor: theme.bgApp }]}
        {...panResponder.panHandlers}
      >
        {!isPCWeb && (
          <MobileHeader
            theme={theme}
            insetsTop={insets.top}
            title={currentChat?.title}
            isDrawerOpen={false}
            onToggleDrawer={openDrawer}
            onNewChat={handleNewChat}
            autoRead={autoRead} // 💡 传递状态给顶栏
            onToggleAutoRead={toggleAutoRead} // 💡 传递切换方法给顶栏
          />
        )}

        <View style={styles.mainLayout}>
          {isPCWeb && (
            <View
              style={[
                styles.sidebarDesktop,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.bgSidebar,
                },
              ]}
            >
              <Sidebar
                conversations={conversations}
                activeId={activeId}
                onNewChat={handleNewChat}
                onSelectChat={handleSelectChat}
                onDeleteChat={handleDeleteChat}
                isDarkMode={isDarkMode}
                onToggleTheme={toggleTheme}
                theme={theme}
                uploadedFiles={uploadedFiles}
                onUploadFile={handleUploadFile}
                onDeleteFile={handleDeleteFile}
              />
            </View>
          )}

          <Animated.View
            style={[
              styles.chatMainWrapper,
              {
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
                key={activeId}
                messages={allMessages}
                streamingRenderMsg={streamingRenderMsg}
                theme={theme}
                isMobile={!isPCWeb}
                isKeyboardUp={isKeyboardUp}
                activeId={activeId}
              />
              <ChatInputBar
                inputText={inputText}
                setInputText={setInputText}
                onSend={handleSendWithImages}
                theme={theme}
                onStop={handleStopGeneration}
                isGenerating={isGenerating}
                isKeyboardUp={isKeyboardUp}
                selectedImages={selectedImages} // 👈 传入图片状态
                setSelectedImages={setSelectedImages} // 👈 传入修改方法
                onPickImage={handlePickImage} // 👈 绑定在这里
              />
              <CustomActionSheet
                visible={isSheetVisible} // 传显隐状态
                onClose={() => setIsSheetVisible(false)} // 传关闭方法
                isDarkMode={isDarkMode}
                theme={theme}
                items={menuItems}
                positionStyle={sheetPositionStyle}
              />
            </View>
          </Animated.View>
        </View>
      </View>
      <GlobalToastContainer />
    </RootSiblingParent>
  );
}

const styles = StyleSheet.create({
  // 💡 修改 container：在 Web 端开启 fixed 布局，锁死整个视口，禁止外部滚动
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          position: 'fixed' as any,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          overscrollBehavior: 'none' as any, // 禁止 iOS 浏览器回弹露白
        }
      : {}),
  },
  mainLayout: { flex: 1, flexDirection: 'row' },
  sidebarDesktop: {
    width: 280,
    height: '100%',
    borderRightWidth: 0,
  },
  chatMainWrapper: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  chatCenterContainer: {
    flex: 1,
    maxWidth: 850,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'column',
  },
});
