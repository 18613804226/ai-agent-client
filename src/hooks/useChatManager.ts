import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform, Vibration } from 'react-native';
import { api } from '../services/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time?: string;
  thought?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages?: Message[];
}

const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

type StreamChunk = { type: 'thought' | 'content'; text: string };

export function useChatManager() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [autoRead, setAutoRead] = useState(false);
  const toggleAutoRead = () => setAutoRead((prev) => !prev);

  // ==================== 流式相关 ====================
  const [streamingRenderMsg, setStreamingRenderMsg] = useState<{
    msgId: string;
    thought: string;
    content: string;
  } | null>(null);

  const queueRef = useRef<StreamChunk[]>([]);
  const currentThoughtRef = useRef('');
  const currentContentRef = useRef('');
  const streamingRenderedTextRef = useRef('');
  const lastMarkdownUpdateRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const isConsumingRef = useRef(false);
  const streamFinishedRef = useRef(false);
  const currentStreamingMsgIdRef = useRef<string>('');

  const autoFollowRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const scrollViewRef = useRef<any>(null);

  const BUFFER_CHAR_THRESHOLD = 8;
  const BUFFER_TIME_THRESHOLD = 50;
  const SCROLL_THROTTLE_MS = 50;
  const MAX_PER_FRAME = 12;

  // 1. 初始化
  useEffect(() => {
    const initChatData = async () => {
      try {
        const sessions: any = await api.getSessions();
        if (sessions && sessions.length > 0) {
          setConversations(sessions);
          const firstId = sessions[0].id;
          setActiveId(firstId);

          const detail: any = await api.getSessionDetail(firstId);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === firstId ? { ...c, messages: detail.messages || [] } : c,
            ),
          );
          return;
        }
        setConversations([]);
        setActiveId('');
      } catch (error) {
        console.error('初始化后端会话失败:', error);
      }
    };
    initChatData();
  }, []);

  const currentChat =
    conversations.find((c) => c.id === activeId) || conversations[0];

  // 2. 创建新会话
  const handleNewChat = async () => {
    const tempId = 'temp_' + Date.now();
    const newConv = { id: tempId, title: '新对话' };

    setConversations((prev) => [newConv, ...prev].slice(0, 20));
    setActiveId(tempId);

    try {
      const sessionData: any = await api.createSession();
      const realId = sessionData.id;

      setConversations((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? { ...c, id: realId, title: sessionData.title || '新对话' }
            : c,
        ),
      );
      setActiveId(realId);
      return realId;
    } catch (error) {
      console.error('创建会话失败', error);
      setConversations((prev) => prev.filter((c) => c.id !== tempId));
    }
  };

  // 3. 切换会话
  const handleSelectChat = async (id: string) => {
    // 切换时清理流式状态，防止串文字
    setStreamingRenderMsg(null);
    queueRef.current = [];
    currentThoughtRef.current = '';
    currentContentRef.current = '';
    streamFinishedRef.current = true;
    isConsumingRef.current = false;
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
    autoFollowRef.current = true;
    setActiveId(id);

    try {
      const detail: any = await api.getSessionDetail(id);
      const messages = detail.messages || [];
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, messages } : c)),
      );
    } catch (error) {
      console.error('获取会话详情失败:', error);
    }
  };

  // 4. 删除会话
  const handleDeleteChat = async (e: any, id: string) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    try {
      await api.deleteSession(id);
    } catch (error) {
      console.error('删除会话失败:', error);
      return;
    }

    const nextConversations = conversations.filter((c) => c.id !== id);
    setConversations(nextConversations);

    if (activeId === id) {
      if (nextConversations.length > 0) {
        setActiveId(nextConversations[0].id);
        handleSelectChat(nextConversations[0].id);
      } else {
        setActiveId('');
      }
    }
  };

  const updateAiMessageFields = useCallback(
    (msgId: string, fields: { content?: string; thought?: string }) => {
      setConversations((prev) =>
        prev.map((conv) => {
          const hasMessage =
            conv.messages?.some((m: any) => m.id === msgId) || false;
          if (!hasMessage) return conv;

          return {
            ...conv,
            messages: (conv.messages || []).map((msg) =>
              msg.id === msgId ? { ...msg, ...fields } : msg,
            ),
          };
        }),
      );
    },
    [],
  );

  const updateStreamingMarkdownState = useCallback(
    (content: string, thought: string, msgId: string) => {
      if (streamFinishedRef.current && queueRef.current.length === 0) {
        // 已结束且队列空，不再更新临时状态
        return;
      }
      setStreamingRenderMsg({
        msgId,
        thought,
        content,
      });
      streamingRenderedTextRef.current = content;
      lastMarkdownUpdateRef.current = Date.now();
    },
    [],
  );

  // ==================== 核心：无空转 + 合并队列的消费者 ====================
  const startSmoothConsumer = useCallback(
    (targetMsgId: string) => {
      if (isConsumingRef.current) return;
      isConsumingRef.current = true;

      let lastScroll = 0;

      const consumeFrame = () => {
        const queue = queueRef.current;
        let remain = MAX_PER_FRAME;

        // 消费队列
        while (remain > 0 && queue.length > 0) {
          const chunk = queue[0];
          const take = Math.min(remain, chunk.text.length);

          if (chunk.type === 'thought') {
            currentThoughtRef.current += chunk.text.slice(0, take);
          } else {
            currentContentRef.current += chunk.text.slice(0, take);
          }

          if (take >= chunk.text.length) {
            queue.shift();
          } else {
            chunk.text = chunk.text.slice(take);
          }
          remain -= take;
        }

        // 缓冲更新 Markdown
        const now = Date.now();
        const deltaChars =
          currentContentRef.current.length -
          streamingRenderedTextRef.current.length;

        if (
          deltaChars >= BUFFER_CHAR_THRESHOLD ||
          now - lastMarkdownUpdateRef.current > BUFFER_TIME_THRESHOLD
        ) {
          updateStreamingMarkdownState(
            currentContentRef.current,
            currentThoughtRef.current,
            targetMsgId,
          );
        }

        // 滚动节流
        if (
          autoFollowRef.current &&
          scrollViewRef.current &&
          now - lastScroll > SCROLL_THROTTLE_MS
        ) {
          scrollViewRef.current.scrollToEnd({ animated: false });
          lastScroll = now;
        }

        // ===== 关键：有数据继续，没数据就停（彻底去掉空转）=====
        if (queue.length > 0) {
          timerRef.current = requestAnimationFrame(consumeFrame);
        } else if (streamFinishedRef.current) {
          // 流结束 + 队列空 → 最终落盘
          isConsumingRef.current = false;
          timerRef.current = null;

          updateStreamingMarkdownState(
            currentContentRef.current,
            currentThoughtRef.current,
            targetMsgId,
          );

          updateAiMessageFields(targetMsgId, {
            thought: currentThoughtRef.current || undefined,
            content: currentContentRef.current,
          });

          setStreamingRenderMsg(null);

          if (autoFollowRef.current && scrollViewRef.current) {
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 60);
          }

          if (Platform.OS !== 'web') {
            Vibration.vibrate(100);
          }
        } else {
          // 队列空但流还没结束 → 停止 RAF，等待新数据唤醒
          isConsumingRef.current = false;
          timerRef.current = null;
        }
      };

      timerRef.current = requestAnimationFrame(consumeFrame);
    },
    [updateStreamingMarkdownState, updateAiMessageFields],
  );

  // 推送并自动唤醒
  const enqueue = useCallback(
    (type: 'thought' | 'content', text: string) => {
      if (!text) return;
      queueRef.current.push({ type, text });

      // 唤醒消费者
      if (!isConsumingRef.current) {
        startSmoothConsumer(currentStreamingMsgIdRef.current);
      }
    },
    [startSmoothConsumer],
  );

  // ==================== SSE 解析公共逻辑 ====================
  const processSSELine = (line: string) => {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('data:')) return;

    const jsonText = trimmedLine.replace('data:', '').trim();
    if (jsonText === '[DONE]') return;

    try {
      const parsed = JSON.parse(jsonText);
      const delta = parsed.choices?.[0]?.delta || {};

      let chunkThought = '';
      let chunkContent = '';

      if (parsed.type === 'thought') {
        chunkThought = parsed.thought || parsed.content || '';
      } else if (parsed.type === 'content') {
        chunkContent = parsed.content || '';
      } else {
        chunkThought =
          delta.reasoning_content || parsed.reasoning_content || '';
        chunkContent = delta.content || parsed.content || '';
      }

      if (chunkThought) enqueue('thought', chunkThought);
      if (chunkContent) enqueue('content', chunkContent);
    } catch {
      // 解析失败忽略
    }
  };

  // ==================== 流式读取 ====================
  const runTypewriterEffect = async (
    thinkingMsgId: string,
    sessionId: string,
    queryText: string,
  ) => {
    // 重置状态
    streamFinishedRef.current = false;
    isConsumingRef.current = false;
    queueRef.current = [];
    currentThoughtRef.current = '';
    currentContentRef.current = '';
    streamingRenderedTextRef.current = '';
    lastMarkdownUpdateRef.current = 0;
    currentStreamingMsgIdRef.current = thinkingMsgId;
    setStreamingRenderMsg(null);

    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }

    startSmoothConsumer(thinkingMsgId);

    const url = `${baseURL}/chat/${sessionId}/stream`;

    // ========== WEB：fetch + ReadableStream ==========
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryText }),
          signal: abortControllerRef.current!.signal,
        });

        if (!response.body) {
          throw new Error('ReadableStream not supported');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            streamFinishedRef.current = true;
            // 唤醒一次，让消费者走结束逻辑
            if (!isConsumingRef.current) {
              startSmoothConsumer(thinkingMsgId);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            processSSELine(line);
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('web stream error', err);
          updateAiMessageFields(thinkingMsgId, {
            content: '服务器开小差了，请检查网络或后端连接。',
          });
          setStreamingRenderMsg(null);
        }
        streamFinishedRef.current = true;
      }
    }
    // ========== 移动端：XHR onprogress ==========
    else {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      let lastReadPos = 0;

      xhr.onprogress = () => {
        const chunkRaw = xhr.responseText.substring(lastReadPos);
        lastReadPos = xhr.responseText.length;
        const lines = chunkRaw.split('\n');

        for (const line of lines) {
          processSSELine(line);
        }
      };

      xhr.onload = () => {
        streamFinishedRef.current = true;
        if (!isConsumingRef.current) {
          startSmoothConsumer(thinkingMsgId);
        }
      };

      xhr.onerror = () => {
        updateAiMessageFields(thinkingMsgId, {
          content: '服务器开小差了，请检查网络或后端连接。',
        });
        setIsGenerating(false);
        setStreamingRenderMsg(null);
        streamFinishedRef.current = true;
      };

      abortControllerRef.current!.signal.addEventListener('abort', () => {
        xhr.abort();
      });

      xhr.send(JSON.stringify({ query: queryText }));
    }
  };

  // ==================== 滚动处理 ====================
  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const offsetY = contentOffset.y;
    const viewH = layoutMeasurement.height;
    const contentH = contentSize.height;
    const isCloseToBottom = offsetY + viewH >= contentH - 50;

    autoFollowRef.current = isCloseToBottom;
    isAtBottomRef.current = isCloseToBottom;
  };

  // ==================== 发送消息 ====================
  const handleSend = async () => {
    if (!inputText.trim()) return;

    let currentActiveId = activeId;
    let isBrandNewSession = false;

    isAtBottomRef.current = true;
    scrollViewRef.current?.scrollToEnd({ animated: true });

    if (!currentActiveId) {
      try {
        const sessionData: any = await api.createSession();
        currentActiveId = sessionData.id;
        setActiveId(currentActiveId);
        isBrandNewSession = true;
      } catch (error) {
        console.error('自动创建会话失败:', error);
        return;
      }
    }

    const currentInput = inputText;
    setInputText('');

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentInput,
    };

    const thinkingMsgId = (Date.now() + 1).toString();
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      role: 'assistant',
      content: '...',
    };

    const currentConv = conversations.find(
      (c: any) => c.id === currentActiveId,
    );
    const isFirst = !currentConv || (currentConv.messages?.length || 0) <= 2;

    const updatedTitle =
      isFirst || !currentConv?.title
        ? currentInput.slice(0, 14) + '...'
        : currentConv.title;

    setConversations((prev: any) => {
      const existsIndex = prev.findIndex((c: any) => c.id === currentActiveId);

      if (existsIndex !== -1) {
        const targetConv = prev[existsIndex];
        const newConv = {
          ...targetConv,
          title: updatedTitle,
          messages: [...(targetConv.messages || []), userMsg, thinkingMsg],
        };
        const nextPrev = [...prev];
        nextPrev[existsIndex] = newConv;
        return nextPrev;
      } else {
        return [
          {
            id: currentActiveId,
            title: updatedTitle,
            messages: [userMsg, thinkingMsg],
          },
          ...prev,
        ];
      }
    });

    if (isBrandNewSession || updatedTitle) {
      api.updateSessionTitle(currentActiveId, updatedTitle).catch((err) => {
        console.error('更新会话标题失败:', err);
      });
    }

    abortControllerRef.current = new AbortController();
    setIsGenerating(true);

    try {
      await runTypewriterEffect(thinkingMsgId, currentActiveId, currentInput);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('发送消息失败:', error);
        updateAiMessageFields(thinkingMsgId, {
          content: '抱歉，服务器开小差了，请检查网络或后端连接。',
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // ==================== 停止生成 ====================
  const handleStopGeneration = () => {
    streamFinishedRef.current = true;

    // 1. 终止网络请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. 取消 RAF
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
    isConsumingRef.current = false;

    // 3. 保存当前已输出内容
    const msgId = currentStreamingMsgIdRef.current;
    if (msgId && (currentContentRef.current || currentThoughtRef.current)) {
      updateAiMessageFields(msgId, {
        thought: currentThoughtRef.current || undefined,
        content: currentContentRef.current || '...',
      });
    }

    // 4. 清空队列和临时状态
    queueRef.current = [];
    setStreamingRenderMsg(null);
    setIsGenerating(false);
  };

  return {
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
    autoRead,
    setAutoRead,
    toggleAutoRead,
    handleScroll,
    isAtBottomRef,
    scrollViewRef,
    autoFollowRef,
    streamingRenderMsg,
  };
}
