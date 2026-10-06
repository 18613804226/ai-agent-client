import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
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
import { useImagePicker } from '../src/hooks/useImagePicker';
import { useTheme, useChat, useKnowledge } from '../src/context/appContexts'; // 💡 全局 Context（与 app/_layout 共用）
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
  const { uploadedFiles, handleUploadFile, handleDeleteFile } = useKnowledge();

  // 知识库上传进度（用于全局悬浮进度条）
  const uploadingFiles = uploadedFiles.filter((f) => f.uploading);
  const isUploadingKnowledge = uploadingFiles.length > 0;
  const knowledgeUploadPercent = isUploadingKnowledge
    ? Math.round(
        uploadingFiles.reduce((sum, f) => sum + (f.progress ?? 0), 0) /
          uploadingFiles.length,
      )
    : 0;

  const { keyboardHeightAnim, isKeyboardUp } = useKeyboardAnimation();

  const handleSendWithImages = (overrideText?: string) => {
    // 只发送后端真实存在、已完成索引的文件 ID：
    // 排除本地临时占位 ID（upload_*）、处理中/失败项，避免后端 RAG 解析到不存在的文件
    const knowledgeFileIds = uploadedFiles
      .filter(
        (f) =>
          f.id &&
          !String(f.id).startsWith('upload_') &&
          !f.uploading &&
          !f.error &&
          f.status !== 'failed' &&
          f.status !== 'processing',
      )
      .map((f) => f.id);
    handleSend(overrideText, selectedImages, knowledgeFileIds);
    clearImages();
  };

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
              {/* 🌐 全局知识库上传进度条：抽屉关闭时也能看到 */}
              {isUploadingKnowledge && (
                <View
                  style={[
                    styles.uploadBanner,
                    {
                      backgroundColor: isDarkMode
                        ? 'rgba(40,40,40,0.95)'
                        : 'rgba(255,255,255,0.97)',
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.uploadBannerText, { color: theme.textMain }]}
                  >
                    📁 知识库处理中 {knowledgeUploadPercent}%
                  </Text>
                  <View style={styles.uploadBannerTrack}>
                    <View
                      style={[
                        styles.uploadBannerFill,
                        {
                          width: `${knowledgeUploadPercent}%`,
                          backgroundColor: theme.sendBtnActive || '#3b82f6',
                        },
                      ]}
                    />
                  </View>
                </View>
              )}

              <ChatArea
                key={activeId}
                messages={currentChat?.messages ?? []}
                streamingRenderMsg={streamingRenderMsg}
                theme={theme}
                isMobile={!isPCWeb}
                isKeyboardUp={isKeyboardUp}
                activeId={activeId}
                autoRead={autoRead}
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
  uploadBanner: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    zIndex: 20,
    minWidth: 220,
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  uploadBannerText: {
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'center',
  },
  uploadBannerTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(150,150,150,0.25)',
    overflow: 'hidden',
  },
  uploadBannerFill: {
    height: '100%',
    borderRadius: 3,
  },
});
