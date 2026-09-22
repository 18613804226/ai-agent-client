import { useState, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { api } from '../services/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

const STORAGE_KEY_CONVS = '@nexus_ai_conversations';
const STORAGE_KEY_ACTIVE_ID = '@nexus_ai_active_id';
const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export function useChatManager() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 初始化加载缓存
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

  // 同步保存到 AsyncStorage
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
      setActiveId(sessionData.id);
      return sessionData.id;
    } catch (error) {
      console.error('创建会话失败:', error);
    }
  };

  const handleSelectChat = (id: string) => {
    setActiveId(id);
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

  const updateAiMessageContent = (msgId: string, newContent: string) => {
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

  const runTypewriterEffect = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
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
              if (isFirstChunk) {
                accumulatedText = '';
                isFirstChunk = false;
              }
              accumulatedText += parsed.content;
              updateAiMessageContent(thinkingMsgId, accumulatedText);
            }
          } catch (e) {
            // 忽略小错误
          }
        }
      }
    }
  };

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

    abortControllerRef.current = new AbortController();
    setIsGenerating(true);

    try {
      const response = await fetch(`${baseURL}/chat/${activeId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentInput }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.body) {
        throw new Error('ReadableStream not supported');
      }

      const reader = response.body.getReader();
      await runTypewriterEffect(reader, thinkingMsgId);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('发送消息失败:', error);
        updateAiMessageContent(
          thinkingMsgId,
          '抱歉，服务器开小差了，请检查网络或后端连接。',
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
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
  };
}
