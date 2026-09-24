import { useState, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
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
  messages: Message[];
}

const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export function useChatManager() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. 初始化：从后端获取会话列表，并加载第一个会话的详情
  useEffect(() => {
    const initChatData = async () => {
      try {
        const sessions: any = await api.getSessions();

        if (sessions && sessions.length > 0) {
          setConversations(sessions);
          const firstId = sessions[0].id;
          setActiveId(firstId);

          // 顺便把第一个会话的具体消息详情查出来
          const detail: any = await api.getSessionDetail(firstId);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === firstId ? { ...c, messages: detail.messages || [] } : c,
            ),
          );
          return;
        }

        // 如果后端没有任何会话，自动创建一个新会话
        const sessionData: any = await api.createSession();
        const defaultConv: Conversation = {
          id: sessionData.id,
          title: sessionData.title || '',
          messages: [
            {
              id: '1',
              role: 'assistant',
              content: '你好！已连接至 AI 智能助手，请输入你想探讨的课题。',
              // time: dayjs().format('HH:mm'),
            },
          ],
        };
        setConversations([defaultConv]);
        setActiveId(sessionData.id);
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
    try {
      const sessionData: any = await api.createSession();

      const newConv: Conversation = {
        id: sessionData.id,
        title: sessionData.title || '',
        messages: [
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: '新会话已开启，请输入你想探讨的课题。',
            // time: dayjs().format('HH:mm'),
          },
        ],
      };

      setConversations((prev) => {
        // 💡 先把新会话加到最前面，然后用 slice 严格限制最多保留 20 个
        // 超过 20 个时，数组末尾最旧的会话会被自动丢弃（先进先出）
        const updated = [newConv, ...prev];
        return updated.length > 20 ? updated.slice(0, 20) : updated;
      });

      setActiveId(sessionData.id);
      return sessionData.id;
    } catch (error) {
      console.error('创建会话失败', error);
    }
  };

  // 3. 切换会话：点击左侧历史记录时，按需从后端加载该会话的详情消息
  const handleSelectChat = async (id: string) => {
    setActiveId(id);
    try {
      const detail: any = await api.getSessionDetail(id);
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === id ? { ...conv, messages: detail.messages || [] } : conv,
        ),
      );
    } catch (error) {
      console.error('获取会话详情失败:', error);
    }
  };

  // 4. 删除会话
  const handleDeleteChat = async (e: any, id: string) => {
    e.stopPropagation();

    try {
      await api.deleteSession(id);
    } catch (error) {
      console.error('删除会话失败:', error);
      return;
    }

    const nextConversations = conversations.filter((c) => c.id !== id);

    if (nextConversations.length === 0) {
      try {
        const sessionData: any = await api.createSession();
        const newConv: Conversation = {
          id: sessionData.id,
          title: sessionData.title || '',
          messages: [
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: '新会话已开启，请输入你想探讨的课题。',
              // time: dayjs().format('HH:mm'),
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
      // 如果切换到了新的当前会话，也可以顺便拉取一下它的详情
      handleSelectChat(nextConversations[0].id);
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

  const updateAiMessageFields = (
    msgId: string,
    fields: { content?: string; thought?: string },
  ) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === activeId) {
          return {
            ...conv,
            messages: conv.messages.map((msg) =>
              msg.id === msgId ? { ...msg, ...fields } : msg,
            ),
          };
        }
        return conv;
      }),
    );
  };

  // const cleanAiMessageText = (rawText: string) => {
  //   if (!rawText) return { thought: '', content: '' };
  //   let thought = '';
  //   let content = rawText;

  //   const fullMatch = rawText.match(/<think>([\s\S]*?)<\/think>/);
  //   if (fullMatch) {
  //     thought = fullMatch[1].trim();
  //     content = rawText.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart();
  //   } else if (rawText.includes('</think>')) {
  //     const parts = rawText.split('</think>');
  //     thought = parts[0].replace(/<think>/g, '').trim();
  //     content = parts.slice(1).join('</think>').trimStart();
  //   } else if (rawText.includes('<think>')) {
  //     const parts = rawText.split('<think>');
  //     content = parts[0].trim();
  //     thought = parts.slice(1).join('<think>').trim();
  //   }

  //   return { thought, content };
  // };

  const runTypewriterEffect = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    thinkingMsgId: string,
  ) => {
    const decoder = new TextDecoder();
    let buffer = '';

    let directThought = '';
    let directContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          const jsonText = trimmedLine.replace('data:', '').trim();
          if (jsonText === '[DONE]') continue;
          if (trimmedLine.startsWith('data:')) {
            try {
              const parsed = JSON.parse(jsonText);
              const delta = parsed.choices?.[0]?.delta || {};

              let chunkThought = '';
              let chunkContent = '';

              if (parsed.type === 'thought') {
                chunkThought =
                  parsed.thought || parsed.content || parsed.text || '';
              } else if (parsed.type === 'content') {
                chunkContent = parsed.content || parsed.text || '';
              } else {
                chunkThought =
                  delta.reasoning_content ||
                  delta.reasoning ||
                  parsed.reasoning_content ||
                  parsed.thought ||
                  '';

                chunkContent =
                  delta.content ||
                  parsed.content ||
                  parsed.text ||
                  parsed.message ||
                  '';
              }

              // 💡 直接累加，不经过任何队列延迟
              if (chunkThought) {
                directThought += chunkThought;
              }

              if (chunkContent) {
                directContent += chunkContent;
              }

              // 💡 收到数据立刻触发更新，后端吐多快前端就刷多快
              updateAiMessageFields(thinkingMsgId, {
                thought: directThought,
                content: directContent || '...',
              });
            } catch (e) {
              if (jsonText) {
                directContent += jsonText;
                updateAiMessageFields(thinkingMsgId, {
                  thought: directThought,
                  content: directContent || '...',
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('流式读取异常:', error);
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
      // time: dayjs().format('HH:mm'),
    };

    const thinkingMsgId = (Date.now() + 1).toString();
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      role: 'assistant',
      content: '...',
      // time: dayjs().format('HH:mm'),
    };

    const currentConv = conversations.find((c) => c.id === activeId);
    const isFirstMessage = currentConv && currentConv.messages.length === 1;

    const newTitle = isFirstMessage
      ? currentInput.slice(0, 14) + '...'
      : currentConv?.title || '';

    if (isFirstMessage) {
      api.updateSessionTitle(activeId, newTitle).catch((err) => {
        console.error('更新会话标题失败:', err);
      });
    }

    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === activeId) {
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
