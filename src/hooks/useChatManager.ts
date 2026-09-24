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
  messages?: Message[];
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
          // 先把会话列表赋上
          setConversations(sessions);
          const firstId = sessions[0].id;
          setActiveId(firstId);

          // 查第一个会话的详情
          const detail: any = await api.getSessionDetail(firstId);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === firstId ? { ...c, messages: detail.messages || [] } : c,
            ),
          );
          return;
        }

        // 如果没有会话，保持空白
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
    try {
      const sessionData: any = await api.createSession();

      const newConv: Conversation = {
        id: sessionData.id,
        title: sessionData.title || '',
        // messages: [
        //   {
        //     id: Date.now().toString(),
        //     role: 'assistant',
        //     content: '新会话已开启，请输入你想探讨的课题。',
        //     // time: dayjs().format('HH:mm'),
        //   },
        // ],
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

    // 如果删的是当前选中的会话
    if (activeId === id) {
      if (nextConversations.length > 0) {
        // 如果还有其他会话，切换到第一个
        setActiveId(nextConversations[0].id);
        handleSelectChat(nextConversations[0].id);
      } else {
        // 💡 如果全部删光了：不自动创建，而是清空 activeId，让右侧输入框/主界面也进入空闲状态
        setActiveId('');
        // 也可以顺便清空右侧的聊天消息状态，根据你的项目逻辑来
      }
    }
  };

  // 💡 修复后的更新 AI 消息内容函数
  const updateAiMessageContent = (msgId: string, chunk: string) => {
    setConversations((prev: any) => {
      return prev.map((conv: any) => {
        // 确保在该会话中找到对应的消息 ID
        const hasMessage =
          conv.messages?.some((m: any) => m.id === msgId) || false;
        if (!hasMessage) return conv;

        return {
          ...conv,
          messages: conv.messages.map((msg: any) => {
            if (msg.id === msgId) {
              // 如果原始内容是 '...'，第一次收到数据时清空并替换，之后进行字符串追加
              const currentContent = msg.content === '...' ? '' : msg.content;
              return {
                ...msg,
                content: currentContent + chunk,
              };
            }
            return msg;
          }),
        };
      });
    });
  };

  const updateAiMessageFields = (
    msgId: string,
    fields: { content?: string; thought?: string },
  ) => {
    setConversations((prev) =>
      prev.map((conv) => {
        // 💡 修复：只要该会话包含了这条消息 ID，不管外层 activeId 此时有没有同步完，直接更新它！
        const hasMessage =
          conv.messages?.some((m: any) => m.id === msgId) || false;
        if (!hasMessage) return conv;

        return {
          ...conv,
          messages: conv.messages.map((msg) =>
            msg.id === msgId ? { ...msg, ...fields } : msg,
          ),
        };
      }),
    );
  };

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
              if (jsonText && jsonText !== '[DONE]') {
                // 如果这段文本还没被加到 directContent 里，才追加
                if (
                  !directContent.endsWith(jsonText) &&
                  !directContent.includes(jsonText)
                ) {
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
      }
    } catch (error) {
      console.error('流式读取异常:', error);
    } finally {
      // 💡 绝对保证：只要流结束或报错，一定解除生成状态和转圈！
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    let currentActiveId = activeId;
    let isBrandNewSession = false;

    // 1. 如果当前没有选中的会话 ID，先调接口创建
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

    // 1. 在外面直接算好标题！不要在 setConversations 里面去改它
    const currentConv = conversations.find(
      (c: any) => c.id === currentActiveId,
    );
    const isFirst = !currentConv || currentConv.messages.length <= 2;

    // 直接用 currentInput 算
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
          messages: [...targetConv.messages, userMsg, thinkingMsg],
        };

        const nextPrev = [...prev];
        nextPrev[existsIndex] = newConv;
        return nextPrev;
      } else {
        // 如果列表里完全没有（刚创建的空会话）
        // updatedTitle = currentInput.slice(0, 14) + '...';
        const newConvItem = {
          id: currentActiveId,
          title: updatedTitle,
          messages: [
            // {
            //   id: 'init-' + Date.now(),
            //   role: 'assistant',
            //   content: '新会话已开启，请输入你想探讨的课题。',
            // },
            userMsg,
            thinkingMsg,
          ],
        };
        return [newConvItem, ...prev];
      }
    });
    // 3. 异步更新后端标题（直接传字符串，因为 api.ts 内部已经帮你包成 { title } 了）
    if (isBrandNewSession || updatedTitle) {
      api.updateSessionTitle(currentActiveId, updatedTitle).catch((err) => {
        console.error('更新会话标题失败:', err);
      });
    }

    // 4. 发起流式请求
    abortControllerRef.current = new AbortController();
    setIsGenerating(true);

    try {
      const response = await fetch(
        `${baseURL}/chat/${currentActiveId}/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: currentInput }),
          signal: abortControllerRef.current.signal,
        },
      );

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
