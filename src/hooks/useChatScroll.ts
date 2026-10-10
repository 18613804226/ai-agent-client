import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useChat } from '../context/appContexts';
import {
  CHAT_INVERSION_STYLE,
  INVERTED_CHAT_LIST,
  chatDistanceFromBottom,
  scrollChatToBottom,
} from '../utils/chatScroll';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';
import type { Message, StreamingRenderMsg } from '../types/chat';

/** 程序化「平滑贴底」动画的保护窗口（ms） */
const PIN_ANIM_MS = 900;

interface UseChatScrollOptions {
  activeId: string;
  streamingRenderMsg: StreamingRenderMsg | null;
  displayMessages: Message[];
}

/**
 * 聊天列表的全部滚动逻辑（原生 inverted / Web 普通列表两套策略都在这里）。
 * 根组件只负责把返回值铺到 ScrollView 上。
 */
export function useChatScroll({
  activeId,
  streamingRenderMsg,
  displayMessages,
}: UseChatScrollOptions) {
  const {
    scrollViewRef,
    autoFollowRef,
    handleScroll: originalHandleScroll,
  } = useChat();
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  /**
   * 平滑贴底动画进行中的截止时间戳。
   * 动画期间 onScroll 会一路报「离底还有几千像素」，那不是用户上滑，
   * 不能据此关掉 autoFollow，也不该闪出「回到底部」按钮（切长会话时尤其明显）。
   */
  const pinAnimUntilRef = useRef(0);
  /** 内容总高度（onContentSizeChange 给），切会话时用来算「视觉顶部」的 offset */
  const contentHeightRef = useRef(0);
  /** ScrollView 视口高度（外层 View 的 onLayout 给） */
  const viewportHeightRef = useRef(0);
  /** 上一次滚动位置，用于识别 Web 用户是否正向底部滚动 */
  const lastScrollOffsetRef = useRef<number | null>(null);
  /** 外层聊天列表当前原生 offset（原生 inverted：0 = 视觉底部），UI 线程可读 */
  const outerOffsetSV = useSharedValue(0);
  /** 外层可滚动最大 offset（内容高 - 视口高），供思考框贴边联动钳制 */
  const outerMaxSV = useSharedValue(0);
  /** 切会话后只做一次「从最旧滑到最新」的进场动画（下一次内容尺寸变化时消费掉） */
  const pendingEntryAnimRef = useRef(false);

  /**
   * 贴底（消费级 App 的做法）：同步定位，不走动画、不排队。
   * - web：直接写 scrollTop。读 scrollHeight 会强制浏览器完成布局，
   *        所以「量」和「定」发生在同一帧的同一个任务里，paint 之前完成 → 不会看到先长后跳。
   * - native inverted：offset 0 就是视觉底部，`scrollTo({ y: 0 })` 原生自己 clamp。
   *   吐字期**根本不用走这里**（内容往上长，offset 一直是 0，天然贴底），
   *   这里只承担「进页面/切会话/点回到底部/发消息」这些低频的程序化贴底。
   */
  const pinToBottom = useCallback((animated = false) => {
    const ref: any = scrollViewRef.current;
    if (!ref) return;

    // 平滑滚动需要一段时间才到位，这段时间内忽略 onScroll 的「离底很远」
    if (animated) pinAnimUntilRef.current = Date.now() + PIN_ANIM_MS;

    if (Platform.OS === 'web') {
      const node =
        (typeof ref.getScrollableNode === 'function' &&
          ref.getScrollableNode()) ||
        (typeof ref.getInnerViewNode === 'function' &&
          ref.getInnerViewNode()) ||
        null;
      if (node) {
        if (animated) {
          // ⚠️ 不能用 node.scrollTo({ top, behavior })：
          // react-native-web 把 node.scrollTo 覆盖成了自己的 (y, x, animated) 签名
          // （ScrollView/index.js 里 `node.scrollTo = this.scrollTo`），
          // 传 { top, behavior } 会被解析成 x/y 全 undefined → 一路兜底成 { x:0, y:0 }
          // → 平滑滚到顶部。必须用它自己挂上来的 scrollToEnd（内部读 scrollHeight）。
          ref.scrollToEnd?.({ animated: true });
        } else {
          // 吐字过程中 —— 同步定位，零动画、零滞迟
          node.scrollTop = node.scrollHeight;
        }
        return;
      }
    }

    // 原生 inverted：offset 0 就是视觉底部；Web：react-native-web 的 scrollToEnd
    scrollChatToBottom(ref, animated);
  }, []);

  /**
   * 切会话/首次进入的「从最旧滑到最新」进场动画。
   *
   * 原生 inverted 下 offset 0 就是底部，进场本来没有任何滚动可做（视觉上直接到底）。
   * 为了保留以前普通列表里那段平滑进场（"切换的时候到底的动画"），这里手动演一遍：
   * 先瞬移到视觉顶部（= 最大 offset = 内容高 - 视口高），下一帧再平滑滚回 0。
   */
  const playEntryScroll = useCallback(() => {
    const ref: any = scrollViewRef.current;
    const maxOffset = Math.max(
      0,
      contentHeightRef.current - viewportHeightRef.current,
    );
    if (!ref || maxOffset <= 0) return;
    pinAnimUntilRef.current = Date.now() + PIN_ANIM_MS;
    ref.scrollTo?.({ x: 0, y: maxOffset, animated: false });
    requestAnimationFrame(() => {
      ref.scrollTo?.({ x: 0, y: 0, animated: true });
    });
  }, [scrollViewRef]);

  // 进页面 / 切会话 → 重置自动跟随，等内容布局完成后贴到底部。
  // - 原生 inverted：底部是自动的，只需安排一次进场动画（内容尺寸一就绪就演，见
  //   handleContentSizeChange）；
  // - Web：等内容布局完成后平滑贴底（useLayoutEffect + scrollTop 那条路）。
  useEffect(() => {
    autoFollowRef.current = true;
    lastScrollOffsetRef.current = null;
    if (INVERTED_CHAT_LIST) {
      pendingEntryAnimRef.current = true;
      return;
    }
    pinAnimUntilRef.current = Date.now() + PIN_ANIM_MS;
    const id = setTimeout(() => pinToBottom(true), 50);
    return () => clearTimeout(id);
  }, [activeId, pinToBottom, autoFollowRef]);

  const handleScroll = useCallback(
    (event: any) => {
      originalHandleScroll?.(event);

      const y = event?.nativeEvent?.contentOffset?.y;
      if (typeof y === 'number') outerOffsetSV.value = y;
      const previousY = lastScrollOffsetRef.current;
      if (typeof y === 'number') lastScrollOffsetRef.current = y;

      // 程序化平滑贴底动画进行中：此时的高 distance 是动画本身，不是用户上滑
      if (Date.now() < pinAnimUntilRef.current) return;

      // 原生 inverted：离底距离 = contentOffset.y；Web：contentSize - viewport - offset
      const distanceFromBottom = chatDistanceFromBottom(event?.nativeEvent);

      // 上滑超过 120px 才显示按钮
      setShowScrollToBottom(distanceFromBottom > 120);

      // 迟滞区间 [40, 120]：远离底部才脱钩，滑回底部附近才重新跟随。
      // 这样吐字时那几十毫秒的高度误差不会误判成「用户上滑了」而突然停住。
      // ⚠️ 必须保留「重新跟随」这条分支：只置 false 不复位的话，
      //    用户碰一次列表，本轮会话的吐字就再也吸不了底。
      // ⚠️ autoFollowRef 是唯一权威值：原生 inverted 下贴底本身是自动的，
      //    它只决定「回到底部」按钮的显隐和吐字期要不要额外插手（见 followBottom）。
      if (autoFollowRef.current) {
        if (distanceFromBottom > 120) autoFollowRef.current = false;
      } else if (
        distanceFromBottom < 40 &&
        (Platform.OS !== 'web' ||
          (typeof y === 'number' &&
            typeof previousY === 'number' &&
            y > previousY))
      ) {
        autoFollowRef.current = true;
      }
    },
    [originalHandleScroll, autoFollowRef],
  );

  /**
   * 跟随贴底（**Web 专用**）：
   * - 吐字中（streamingRenderMsg 非空）→ 同步定位（animated=false），零动画、零滞迟。
   * - 其余时刻（进页面 / 切会话 / 消息落盘）→ 平滑动画（animated=true），保留「到底」的过渡。
   *   ⚠️ 切会话时历史消息是**异步**落盘的（handleSelectChat → getSessionDetail →
   *   setConversations 换新数组 → displayMessages 换新引用），这里若用同步定位，
   *   会把进场那段平滑滚动直接掐断成瞬移 —— 表现就是「切换的时候到底的动画没有了」。
   *
   * 原生端在 inverted 布局下**不需要任何跟随贴底**：视觉底部就是 offset 0，
   * 内容长高时 offset 不动就等于一直贴在底部（这正是零抖动的来源），
   * 所以这里直接返回；原生端的贴底只发生在「进页面/切会话/点回到底部/发消息」
   * 这些低频路径上（见 pinToBottom / playEntryScroll）。
   */
  const followBottom = useCallback(() => {
    if (INVERTED_CHAT_LIST) return;
    if (!autoFollowRef.current) return;
    if (streamingRenderMsg) {
      pinToBottom(false);
      return;
    }
    pinToBottom(true);
  }, [pinToBottom, streamingRenderMsg, autoFollowRef]);

  // 吐字期/新消息：自动吸底（用户未上滑时）—— **仅 Web**。
  // （原生 inverted 下 followBottom 第一行就 return：内容是往上长的，贴底不需要动作。）
  //
  // ⚠️ 必须是 layout effect（DOM commit 之后、浏览器 paint 之前同步执行）：
  //   - 在这里读 scrollHeight 会顺带完成本次 DOM 变更的布局（浏览器这一帧本来也要算，
  //     只是被提前到 paint 之前），紧接着写 scrollTop，于是这一帧画出来的就是
  //     「已经贴底」的状态，看不到先长高再滚一下；
  //   - 换成 useEffect（paint 之后）就变成「先把长高的内容画出来，再滚一下」，
  //     吐字 60fps 下每帧都这样 → 肉眼看到的就是底部忽上忽下。
  //   - onContentSizeChange 也救不了：react-native-web 的实现走
  //     UIManager.measure → setTimeout(0)（见 node_modules/react-native-web/dist/
  //     exports/UIManager/index.js 的 measureLayout），回调落在下一个宏任务里，
  //     同样晚于 paint。所以它现在只当兜底（见下面 ScrollView 上的回调）。
  useIsomorphicLayoutEffect(() => {
    followBottom();
  }, [displayMessages, followBottom]);

  // 流式结束的收尾贴底：只吃「streamingRenderMsg 从有→无」这一下。
  // 收尾时内容高度还会再动一次（尾巴 → 最终 markdown、思考框折叠），极少数情况下
  // 会把 offset 顶离 0（原生 inverted）或停在半路（web），而原生端 followBottom
  // 第一行 return 不会自己补齐 → 底部就留下一小段空白。这里在吐完那刻强制硬贴一次。
  // 是一次性低频命令（每条回答一次，不是每帧），不破坏 inverted 吐字期的零命令原则。
  const wasStreamingRef = useRef(false);
  const isStreamingNow = !!streamingRenderMsg;
  useEffect(() => {
    const finished = !isStreamingNow && wasStreamingRef.current;
    wasStreamingRef.current = isStreamingNow;
    if (!finished) return;
    pinToBottom(false);
    if (INVERTED_CHAT_LIST) {
      // 原生：内容尺寸回调可能晚一帧，下一帧再兜一次，确保 offset 回到 0。
      requestAnimationFrame(() => pinToBottom(false));
    }
  }, [isStreamingNow, pinToBottom]);

  // 关掉浏览器的「滚动锚定」：它会和逐帧写 scrollTop 互相抢，表现为贴底后又自己弹一下。
  // RNW 的样式表透传不到这个属性，直接写 DOM（此时 ref 已在本轮 commit 里挂好）。
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const ref: any = scrollViewRef.current;
    const node =
      (ref && typeof ref.getScrollableNode === 'function'
        ? ref.getScrollableNode()
        : null) || null;
    if (node && node.style) node.style.overflowAnchor = 'none';
  }, []);

  // 鼠标向上滚动时先于 ScrollView 的 onScroll 关闭自动贴底，避免吐字 layout
  // effect 抢在滚动事件后执行，把用户刚滚上去的位置又拉回底部。
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const ref: any = scrollViewRef.current;
    const node =
      (ref && typeof ref.getScrollableNode === 'function'
        ? ref.getScrollableNode()
        : null) || null;
    if (!node) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) autoFollowRef.current = false;
    };
    node.addEventListener('wheel', handleWheel, { passive: true });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [activeId, autoFollowRef, scrollViewRef]);

  // 用户手指一碰上去 → 立即取消自动跟随（两端一致：原生也走 JS 的 onScrollBeginDrag）
  const handleScrollBeginDrag = useCallback(() => {
    autoFollowRef.current = false;
  }, [autoFollowRef]);

  // 点「回到底部」→ 重新开启自动跟随 + 平滑贴底
  const handleScrollToBottom = useCallback(() => {
    autoFollowRef.current = true;
    setShowScrollToBottom(false);
    // pinToBottom(animated=true) 内部会开「动画保护窗口」（pinAnimUntilRef）
    pinToBottom(true);
  }, [pinToBottom, autoFollowRef]);

  /**
   * onContentSizeChange：内容尺寸变化（图片/字体加载、思考框折叠、吐字换行…）。
   *
   * - 原生（inverted）：内容长高时 offset 保持 0 就已经贴在底部，**不需要任何滚动命令**，
   *   这里只做两件与贴底无关的事：记录内容高度（进场动画要用），以及消费一次
   *   「切会话后的进场动画」。吐字期一条迟到命令都没有 —— 抖动被结构性地删掉了。
   * - Web（普通列表）：保持原兜底逻辑。⚠️ 它在 react-native-web 上经过
   *   UIManager.measure → setTimeout(0)，落在下一个宏任务里、晚于 paint，
   *   所以只当兜底（主路径是上面的 useLayoutEffect + scrollTop）。
   */
  const handleContentSizeChange = useCallback(
    (_width?: number, height?: number) => {
      if (typeof height === 'number' && height > 0) {
        contentHeightRef.current = height;
        outerMaxSV.value = Math.max(0, height - viewportHeightRef.current);
      }

      if (INVERTED_CHAT_LIST) {
        // 进场动画：等新会话的内容高度就绪后再演一次（每次切会话只演一次）
        if (pendingEntryAnimRef.current) {
          pendingEntryAnimRef.current = false;
          playEntryScroll();
        }
        return;
      }

      if (!autoFollowRef.current) return;
      // 程序化平滑贴底动画在途：此时的高 distance 是动画本身，插手会把它掐成瞬移
      if (Date.now() < pinAnimUntilRef.current) return;

      const ref: any = scrollViewRef.current;
      const node =
        ref && typeof ref.getScrollableNode === 'function'
          ? ref.getScrollableNode()
          : null;
      if (
        node &&
        typeof node.scrollTop === 'number' &&
        node.scrollHeight - node.clientHeight - node.scrollTop <= 1
      ) {
        return; // 已经在底部，什么都不用做
      }
      pinToBottom(false);
    },
    [pinToBottom, autoFollowRef, scrollViewRef, playEntryScroll],
  );

  /** 外层 View 的 onLayout：记录视口高度并更新思考框贴边联动的上限 */
  const viewportOnLayout = useCallback(
    (e: any) => {
      const h = e.nativeEvent.layout.height;
      viewportHeightRef.current = h;
      outerMaxSV.value = Math.max(0, contentHeightRef.current - h);
    },
    [outerMaxSV],
  );

  const scrollViewProps: Record<string, any> = {
    onScroll: handleScroll,
    onScrollBeginDrag: handleScrollBeginDrag,
    scrollEventThrottle: 32,
    onContentSizeChange: handleContentSizeChange,
    // 原生端吐字时用不到贴底，但滚动手感保持原样
    ...(INVERTED_CHAT_LIST ? { decelerationRate: 'fast' } : null),
    // Android 翻转布局：长按选中文本时系统会走 requestChildRectangleOnScreen 把选区
    // 「滚进可视区」，但坐标是普通坐标系，落到 scale(-1) 镜像的 ScrollView 上就映射成
    // 大幅度跳动。该 prop 让 ReactScrollView.requestChildRectangleOnScreen 直接返回 false，
    // 从源头吞掉这次系统补正，原生跨段选择能力不受影响。
    ...(Platform.OS === 'android' ? { scrollsChildToFocus: false } : null),
  };

  const scrollViewStyle: any = [
    // 翻转 ScrollView 自身：offset 0 = 视觉底部，吐字期零滚动命令
    INVERTED_CHAT_LIST ? CHAT_INVERSION_STYLE : null,
    // RNW 才认这两个滚动条样式
    Platform.OS === 'web'
      ? {
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.3) transparent',
        }
      : null,
  ];

  return {
    scrollViewProps,
    scrollViewStyle,
    showScrollToBottom,
    handleScrollToBottom,
    outerOffsetSV,
    outerMaxSV,
    viewportOnLayout,
  };
}
