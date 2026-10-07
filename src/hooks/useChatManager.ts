import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform, Vibration } from 'react-native';
import { api } from '../services/api';
import {
  chatDistanceFromBottom,
  scrollChatToBottom,
} from '../utils/chatScroll';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time?: string;
  thought?: string;
  systemNote?: boolean;
  images?: string[];
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
  const timerRef = useRef<number | null>(null);
  const isConsumingRef = useRef(false);
  const streamFinishedRef = useRef(false);
  const currentStreamingMsgIdRef = useRef<string>('');
  /**
   * 流世代号：每开始/中止一轮流式 +1。
   * cancelAnimationFrame 存在极小概率漏掉「已入队待执行」的那一帧，
   * 旧帧若复活会把新流的队列用旧 msgId 吐掉（isConsumingRef 为 true 时
   * enqueue 也不会再唤醒），表现就是新消息一直「思考中...」。
   */
  const streamEpochRef = useRef(0);
  /** handleSend 轮次令牌：旧轮的 finally 不允许覆盖新一轮的状态 */
  const sendRunRef = useRef(0);

  // ==================== 吐字引擎状态 ====================
  /** 队列里还没吐出来的字数 */
  const queueCharsRef = useRef(0);
  /** 小数余额：不足 1 字的吐字量留到下一帧，避免高频帧率下丢字 */
  const charCarryRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const lastPushTimeRef = useRef(0);

  const autoFollowRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const scrollViewRef = useRef<any>(null);

  // ==================== 吐字参数 ====================
  /**
   * 空闲吐字速度（字/秒）：只在「模型本身比这慢」或「队列快吐完」时生效，
   * 负责给出匀速打字的手感。
   */
  const CHARS_PER_SEC = 99;
  /**
   * 积压超过该值就进入追赶。
   * 原来是 120：等于自己先攒 120 字的缓冲 ≈ 0.3~1.2s 的延迟，白等；
   * 20 字 ≈ 0.1s，肉眼分辨不出。
   */
  const CATCH_UP_CHARS = 20;
  /**
   * 追赶倍率（单位：字/秒 每 1 字积压）。
   * 稳定态：吐字速度 = 倍率 × 积压 = 到达速度，于是
   * **平均延迟 ≈ 1 / 倍率 秒**：×2 → 0.5s（原来的观感就是「慢半拍」），
   * ×7 → ≈0.14s（等同于不延迟）。
   * 想更不延迟就调大（10 → ≈0.1s），代价是单帧增量变大、台阶更容易看见。
   */
  const CATCH_UP_RAMP = 7;
  /** 追赶速度上限（字/秒）：防止高速流下越追越猛。 */
  const MAX_CATCH_UP_SPEED = 1600;
  /**
   * 流式中单帧吐字上限：16 字 ≈ 0.8 行。
   * 它同时是「主线程卡顿时的保险丝」和「流式期的视觉上限」：
   * 16 字 × 60fps ≈ 960 字/秒，已经比绝大多数模型的输出速度还快。
   */
  const MAX_PER_FRAME = 16;
  /** 流已结束时的收尾基准速度（字/秒）：队列快空时用它，最后几个字仍是「打字」出来的。 */
  const FINISH_SPEED = 420;
  /** 收尾追赶倍率：流都结束了就没必要再慢慢吐，积压越多收得越快。 */
  const FINISH_RAMP = 14;
  /** 收尾速度上限（字/秒）。 */
  const MAX_FINISH_SPEED = 1920;
  /**
   * 收尾时单帧上限：32 字 ≈ 1.5 行。
   * 流已结束、用户在等落盘，这时候「快」比「稳」重要。
   */
  const FINISH_MAX_PER_FRAME = 32;
  /** 每帧推一次 React 状态（≈60fps）：每帧都多吐至少一个字，肉眼看不出台阶 */
  const FRAME_PUSH_INTERVAL = 16;
  /** 单帧时间上限，防止切后台回来一帧吐几百字 */
  const MAX_FRAME_GAP = 100;
  const FIRST_FRAME_GAP = 16;

  /** 清空吐字状态机（切换会话 / 新一轮流式开始时调用） */
  const resetTypewriter = useCallback(() => {
    streamEpochRef.current += 1;
    streamFinishedRef.current = false;
    isConsumingRef.current = false;
    queueRef.current = [];
    queueCharsRef.current = 0;
    charCarryRef.current = 0;
    lastFrameTimeRef.current = 0;
    lastPushTimeRef.current = 0;
    currentThoughtRef.current = '';
    currentContentRef.current = '';
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * 中止在途的一轮流式（切会话 / 新建会话 / 重复发送时调用）。
   * 不弹「用户中止对话」标记 —— 那是 handleStopGeneration 专属的语义。
   * 关键点：必须 abort 网络请求。只 resetTypewriter 是不够的，
   * 旧流的 onprogress 会继续 enqueue，在 isConsumingRef=false 时用旧 msgId
   * 复活吐字链，落盘时那条消息已被 getSessionDetail 覆盖 → 永久「思考中...」。
   */
  const abortActiveStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    streamFinishedRef.current = true;
    streamEpochRef.current += 1;
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
    isConsumingRef.current = false;
    queueRef.current = [];
    queueCharsRef.current = 0;
    charCarryRef.current = 0;
    lastFrameTimeRef.current = 0;
    lastPushTimeRef.current = 0;
    currentStreamingMsgIdRef.current = '';
    setStreamingRenderMsg(null);
    setIsGenerating(false);
  }, []);

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
    // 新会话不继承旧会话在途的流（abortActiveStream 内含 setIsGenerating(false)）
    abortActiveStream();

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
    // 切换时中止在途流式并清理流式状态，防止串文字 / 旧消息卡在「思考中...」
    abortActiveStream();
    resetTypewriter();
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
    (
      msgId: string,
      fields: { content?: string; thought?: string; systemNote?: boolean },
    ) => {
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

  /** 追加一条消息到当前会话（用于「用户中止对话」提示等） */
  const appendMessage = useCallback(
    (msg: Partial<Message>) => {
      const id =
        msg.id ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeId
            ? {
                ...conv,
                messages: [...(conv.messages || []), { ...msg, id } as Message],
              }
            : conv,
        ),
      );
      return id;
    },
    [activeId],
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
    },
    [],
  );

  // ==================== 核心：匀速吐字 + 无空转的队列消费者 ====================
  const startSmoothConsumer = useCallback(
    (targetMsgId: string) => {
      if (isConsumingRef.current) return;
      isConsumingRef.current = true;

      /** 本条吐字链所属的流世代号：与 streamEpochRef 不符即说明这轮流已被放弃 */
      const myEpoch = streamEpochRef.current;

      /** 吐字收尾：队列排空 + 流已结束 → 落盘，UI 一次性切到最终态 */
      const finish = () => {
        isConsumingRef.current = false;
        timerRef.current = null;

        const thought = currentThoughtRef.current;
        const content = currentContentRef.current;

        if (thought || content) {
          updateAiMessageFields(targetMsgId, {
            thought: thought || undefined,
            content,
          });
        } else {
          // 空回复必须写成一条系统标记行，不能留空 content：
          // ChatArea 判定 hasContent=false && hasThought=false → isThinking=true，
          // 那颗气泡会永远转「思考中...」（服务端 finalCleanReply 被清洗成空、
          // 只回 thought、subject$.error 等情况都会走到这里）。
          updateAiMessageFields(targetMsgId, {
            content: '（模型未返回内容）',
            systemNote: true,
          });
        }

        setStreamingRenderMsg(null);
      };

      const consumeFrame = (frameTime?: number) => {
        // 已被新一轮流式接管 → 旧链直接退出。
        // 注意别在这里改 isConsumingRef / timerRef：它们现在属于新链。
        if (streamEpochRef.current !== myEpoch) return;

        try {
          stepFrame(frameTime);
        } catch (err) {
          // 绝不能让 RAF 链带着 isConsumingRef=true 断掉：
          // 之后所有 enqueue 都会因为「已在消费」而不再唤醒 → 永久卡住
          console.error('吐字引擎异常，强制收尾:', err);
          queueRef.current = [];
          queueCharsRef.current = 0;
          streamFinishedRef.current = true;
          finish();
        }
      };

      /** 单帧消费：按时间算预算 → 从队列头取字 → 每帧推一次 React 状态 */
      const stepFrame = (frameTime?: number) => {
        const queue = queueRef.current;

        // ===== 关键：没数据就停，彻底去掉空转 =====
        if (queue.length === 0) {
          if (streamFinishedRef.current) {
            finish();
          } else {
            // 队列空但流还没结束 → 停掉 RAF，等新数据再唤醒
            isConsumingRef.current = false;
            timerRef.current = null;
          }
          return;
        }

        // ===== 按时间算本帧该吐多少字 =====
        const now =
          typeof frameTime === 'number' && frameTime > 0
            ? frameTime
            : Date.now();
        const gap =
          lastFrameTimeRef.current === 0
            ? FIRST_FRAME_GAP
            : Math.min(now - lastFrameTimeRef.current, MAX_FRAME_GAP);
        lastFrameTimeRef.current = now;

        const backlog = queueCharsRef.current;
        let speed = CHARS_PER_SEC;
        /** 本帧吐字上限：收尾期放宽（流已结束，用户已在等落盘） */
        let perFrameLimit = MAX_PER_FRAME;
        if (streamFinishedRef.current) {
          // 流已结束：按积压提速收尾，避免长回答在结尾干等
          speed = Math.min(
            FINISH_SPEED + backlog * FINISH_RAMP,
            MAX_FINISH_SPEED,
          );
          perFrameLimit = FINISH_MAX_PER_FRAME;
        } else if (backlog > CATCH_UP_CHARS) {
          // 积压：按积压量提速，保证消费速度始终 ≥ 到达速度
          speed = Math.min(
            Math.max(backlog * CATCH_UP_RAMP, CHARS_PER_SEC),
            MAX_CATCH_UP_SPEED,
          );
        }

        charCarryRef.current += (gap / 1000) * speed;
        let budget = Math.floor(charCarryRef.current);
        charCarryRef.current -= budget;
        if (budget <= 0) {
          // 还没到吐字时间，等下一帧
          timerRef.current = requestAnimationFrame(consumeFrame);
          return;
        }
        budget = Math.min(budget, perFrameLimit);

        // ===== 从队列头按帧消费 =====
        let remain = budget;
        while (remain > 0 && queue.length > 0) {
          const chunk = queue[0];
          const take = Math.min(remain, chunk.text.length);

          if (chunk.type === 'thought') {
            currentThoughtRef.current += chunk.text.slice(0, take);
          } else {
            currentContentRef.current += chunk.text.slice(0, take);
          }
          queueCharsRef.current -= take;

          if (take >= chunk.text.length) {
            queue.shift();
          } else {
            chunk.text = chunk.text.slice(take);
          }
          remain -= take;
        }

        // ===== 每帧推一次 React 状态（约 60fps），每帧只追加、不重排 =====
        if (now - lastPushTimeRef.current >= FRAME_PUSH_INTERVAL) {
          lastPushTimeRef.current = now;
          updateStreamingMarkdownState(
            currentContentRef.current,
            currentThoughtRef.current,
            targetMsgId,
          );
        }

        if (queue.length === 0 && streamFinishedRef.current) {
          finish();
          return;
        }
        timerRef.current = requestAnimationFrame(consumeFrame);
      };

      timerRef.current = requestAnimationFrame(consumeFrame);
    },
    [updateStreamingMarkdownState, updateAiMessageFields],
  );

  // 推送并自动唤醒
  const enqueue = useCallback(
    (type: 'thought' | 'content', text: string) => {
      if (!text) return;
      // 没有活跃 msgId = 当前没有在跑的流（旧流 abort 后可能还来最后几片）
      if (!currentStreamingMsgIdRef.current) return;
      queueRef.current.push({ type, text });
      queueCharsRef.current += text.length;

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
    images: string[] = [],
    knowledgeFileIds: string[] = [],
  ) => {
    // 重置状态
    resetTypewriter();
    currentStreamingMsgIdRef.current = thinkingMsgId;
    setStreamingRenderMsg(null);

    // 本轮流的世代号：中途被中止/被新一轮顶替后，旧流残片一律丢弃，
    // 否则两条流共用同一个队列会互相串字
    const myEpoch = streamEpochRef.current;
    const handleLine = (line: string) => {
      if (streamEpochRef.current !== myEpoch) return;
      processSSELine(line);
    };

    startSmoothConsumer(thinkingMsgId);

    const url = `${baseURL}/chat/${sessionId}/stream`;

    // images 已经在 handleSend 中上传，返回的是后端 URL 列表，直接使用
    const imageUrls = images;

    // ========== WEB：fetch + ReadableStream ==========
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: queryText,
            images: imageUrls,
            fileIds: knowledgeFileIds,
          }),
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
            handleLine(line);
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
      // 让 runTypewriterEffect「真正」等到 XHR 结束再返回。
      // 之前分支里 xhr.send() 之后 async 函数就结束了 → handleSend 的
      // finally 立刻执行 setIsGenerating(false) → 停止按钮在流式期间
      // 就切回「发送」状态、点击无效。
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', 'application/json');
        let lastReadPos = 0;
        /**
         * SSE 半行缓冲：XHR 的 progress 按网络包切分，不会对齐 \n。
         * 之前是直接 split 后把最后一段（半行）一起丢掉、lastReadPos 又已前移，
         * 那条 data: 事件就整条没了（下一片以半行开头，JSON.parse 再次失败）
         * → 真机丢字/丢段，极端情况下丢光 → 气泡卡在「思考中...」。
         */
        let buffer = '';

        const settle = () => resolve();

        /** flush=true 时把残留的最后一段也按整行处理（收尾用） */
        const drainSSE = (flush = false) => {
          const lines = buffer.split('\n');
          buffer = flush ? '' : lines.pop() || '';
          for (const line of lines) {
            handleLine(line);
          }
        };

        xhr.onprogress = () => {
          buffer += xhr.responseText.substring(lastReadPos);
          lastReadPos = xhr.responseText.length;
          drainSSE();
        };

        xhr.onload = () => {
          drainSSE(true);
          streamFinishedRef.current = true;
          if (!isConsumingRef.current) {
            startSmoothConsumer(thinkingMsgId);
          }
          settle();
        };

        xhr.onerror = () => {
          updateAiMessageFields(thinkingMsgId, {
            content: '服务器开小差了，请检查网络或后端连接。',
          });
          setStreamingRenderMsg(null);
          streamFinishedRef.current = true;
          settle();
        };

        abortControllerRef.current!.signal.addEventListener('abort', () => {
          xhr.abort();
          // XMLHttpRequest 的 abort 事件不会触发 onload/onerror，
          // 所以要在这里 settle，让 runTypewriterEffect 的 await 回来，
          // 确保 handleSend 的 finally 也能完整执行收尾。
          streamFinishedRef.current = true;
          settle();
        });

        xhr.send(
          JSON.stringify({
            query: queryText,
            images: imageUrls,
            fileIds: knowledgeFileIds,
          }),
        );
      });
    }
  };

  // ==================== 滚动处理 ====================
  const handleScroll = (event: any) => {
    // 原生端是 inverted 列表（offset 0 就是视觉底部），离底距离的算法两端不同，
    // 统一走 utils/chatScroll 里的 chatDistanceFromBottom。
    const isCloseToBottom = chatDistanceFromBottom(event?.nativeEvent) <= 50;

    // autoFollowRef 归 ChatArea 独占写入（它要和「回到底部」按钮用同一个阈值），
    // 这里别再抢着写，否则两个阈值打架会让自动跟随在吐字时来回抖。
    isAtBottomRef.current = isCloseToBottom;
  };

  // ==================== 发送消息 ====================
  /**
   * @param overrideText 可选。传入时优先发送该文本（用于语音识别等「即时发送」场景），
   *                     否则发送输入框当前内容。
   * @param images 可选。选中的图片 base64/URL 数组，发送前会上传到后端。
   * @param knowledgeFileIds 可选。选中的知识库文件 ID 数组，告知后端用于 RAG 上下文。
   */
  const handleSend = async (
    overrideText?: string,
    images: string[] = [],
    knowledgeFileIds: string[] = [],
  ) => {
    const textToSend = overrideText ?? inputText;

    // 如果没有文字内容但有图片，仍然可以发送
    if (!textToSend.trim() && images.length === 0) return;

    // 同一时刻只允许一轮流式：先把上一轮彻底中止（语音连发 / 快速连点），
    // 否则两条流共用一个队列会互相串字，旧流的 onload 还会提前结束新一轮
    abortActiveStream();
    const myRun = ++sendRunRef.current;

    let currentActiveId = activeId;
    let isBrandNewSession = false;

    isAtBottomRef.current = true;
    // 原生 inverted：offset 0 = 底部；Web：scrollToEnd
    scrollChatToBottom(scrollViewRef.current, true);

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

    const currentInput = textToSend;
    setInputText('');

    // 上传图片到后端，获取 URL 用于聊天气泡回显
    let uploadedImageUrls: string[] = [];
    if (images.length > 0) {
      uploadedImageUrls = await api.uploadImages(images);
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentInput,
      images: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
    };

    const thinkingMsgId = (Date.now() + 1).toString();
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      role: 'assistant',
      content: '',
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

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);

    try {
      await runTypewriterEffect(
        thinkingMsgId,
        currentActiveId,
        currentInput,
        uploadedImageUrls,
        knowledgeFileIds,
      );
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('发送消息失败:', error);
        updateAiMessageFields(thinkingMsgId, {
          content: '抱歉，服务器开小差了，请检查网络或后端连接。',
        });
      }
    } finally {
      // 已被新一轮 send / 停止按钮接管时，这一轮不许再改共享状态，
      // 否则会把新流的 controller 置空（停止按钮失效）或提前切回「发送」
      if (sendRunRef.current === myRun) {
        setIsGenerating(false);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        Vibration.vibrate(100);
      }
    }
  };

  // ==================== 停止生成 ====================
  const handleStopGeneration = () => {
    // 让本轮 send 的 finally 失效：状态由下面统一收尾
    sendRunRef.current += 1;

    // 1. 先把已经吐出来的内容落盘（abortActiveStream 会清空这些 ref）
    const msgId = currentStreamingMsgIdRef.current;
    const hasOutput = !!(
      currentContentRef.current || currentThoughtRef.current
    );
    if (msgId && hasOutput) {
      updateAiMessageFields(msgId, {
        thought: currentThoughtRef.current || undefined,
        content: currentContentRef.current || '...',
      });
    }

    // 2. 终止网络请求 + 杀吐字链 + 清队列
    abortActiveStream();

    // 3. 标记「用户中止对话」。一个字都没吐出来时直接把那条占位消息改成标记行，
    //    否则它带着 content:'...' 会被 ChatArea 判成 isThinking → 永久「思考中...」
    if (msgId && !hasOutput) {
      updateAiMessageFields(msgId, {
        content: '-------- 用户中止对话 --------',
        systemNote: true,
      });
    } else {
      appendMessage({
        role: 'assistant',
        content: '-------- 用户中止对话 --------',
        systemNote: true,
      });
    }
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
