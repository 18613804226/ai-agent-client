import 'punycode';
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Platform,
  Dimensions,
  Keyboard,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { RootSiblingParent } from 'react-native-root-siblings';

import Sidebar from '../src/components/Sidebar';
import ChatArea from '../src/components/ChatArea';
import ChatInputBar from '../src/components/ChatInputBar';
import { MobileHeader } from '../src/components/MobileHeader';
import { MobileDrawer } from '../src/components/MobileDrawer';

import { darkTheme, lightTheme } from '../src/constants/theme';
import { useKeyboardAnimation } from '../src/hooks/useKeyboardAnimation';
import { useChatManager } from '../src/hooks/useChatManager';
import GlobalToastContainer from '../src/components/GlobalToast';
import { useKnowledgeFiles } from '../src/hooks/useKnowledgeFiles'; // 💡 引入刚才写的 Hook
const { uploadedFiles, handleUploadFile, handleDeleteFile } =
  useKnowledgeFiles();
const DRAWER_WIDTH = 280;

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

  const { keyboardHeightAnim, isKeyboardUp } = useKeyboardAnimation();
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
  } = useChatManager();

  const scrollViewRef = useRef<ScrollView>(null!);

  // 屏幕尺寸变化监听
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

  const openDrawer = () => {
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

  const theme = isDarkMode
    ? { ...darkTheme, isDark: true }
    : { ...lightTheme, isDark: false };

  return (
    <RootSiblingParent>
      <View style={[styles.container, { backgroundColor: theme.bgApp }]}>
        {isMobile && (
          <MobileHeader
            theme={theme}
            insetsTop={insets.top}
            title={currentChat?.title}
            isDrawerOpen={isMobileSidebarOpen}
            onToggleDrawer={isMobileSidebarOpen ? closeDrawer : openDrawer}
          />
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
                messages={currentChat?.messages || []}
                scrollViewRef={scrollViewRef}
                theme={theme}
                isMobile={isMobile}
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

          <MobileDrawer
            showOverlay={showOverlay}
            backdropOpacity={backdropOpacity}
            drawerTranslateX={drawerTranslateX}
            theme={theme}
            conversations={conversations}
            activeId={activeId}
            isDarkMode={isDarkMode}
            onClose={closeDrawer}
            onNewChat={() => {
              handleNewChat();
              if (isMobile) closeDrawer();
            }}
            onSelectChat={(id) => {
              handleSelectChat(id);
              if (isMobile) closeDrawer();
            }}
            onDeleteChat={handleDeleteChat}
            onToggleTheme={() => setIsDarkMode(!isDarkMode)}
            uploadedFiles={uploadedFiles}
            onUploadFile={handleUploadFile}
            onDeleteFile={handleDeleteFile}
          />
        </View>
      </View>
      <GlobalToastContainer />
    </RootSiblingParent>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mainLayout: { flex: 1, flexDirection: 'row' },
  sidebarDesktop: { width: 260, borderRightWidth: 1 },
  chatMainWrapper: { flex: 1, backgroundColor: 'transparent', zIndex: 1 },
  chatCenterContainer: {
    flex: 1,
    maxWidth: 850,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'column',
  },
});
