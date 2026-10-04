import React, {
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
// runOnJS 在 Reanimated 4 / react-native-worklets 0.10 已标记 @deprecated，
// 官方替代品是 scheduleOnRN（参数直接展开传，不需要再包一层函数）
import { scheduleOnRN } from "react-native-worklets";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** 宽屏时卡片不再无限拉宽 */
const MAX_CARD_WIDTH = 760;
/** 翻页：位移超过卡片宽度的这个比例，或速度超过阈值，就切页 */
const PAGE_DISTANCE_RATIO = 0.22;
const PAGE_VELOCITY = 500;
const ZERO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

interface ImageViewerProps {
  visible: boolean;
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

/** 单页图片：捏合缩放 / 双击放大 / 放大后拖动平移（单击不响应） */
const ViewerPage = memo(function ViewerPage({
  uri,
  pageIndex,
  active,
  width,
  height,
  left,
  zoomed,
  onZoomChange,
}: {
  uri: string;
  pageIndex: number;
  active: boolean;
  width: number;
  height: number;
  /** 在横排里的绝对位置（配合只渲染 ±1 页的窗口策略） */
  left: number;
  /** 本页是否处于放大状态：决定「拖动平移」要不要接管手势 */
  zoomed: boolean;
  onZoomChange: (pageIndex: number, zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [loading, setLoading] = useState(false);

  // 手势回调跑在 UI 线程：本地能调的函数必须带 'worklet'，
  // 碰到 JS 侧回调要经过 scheduleOnRN
  const resetZoom = (page: number) => {
    "worklet";
    scale.value = withTiming(1, { duration: 180 });
    savedScale.value = 1;
    tx.value = withTiming(0, { duration: 180 });
    ty.value = withTiming(0, { duration: 180 });
    savedTx.value = 0;
    savedTy.value = 0;
    scheduleOnRN(onZoomChange, page, false);
  };

  // 翻到本页时复位，避免带着上一页的放大状态进来
  useEffect(() => {
    if (!active) return;
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
  }, [active, savedScale, savedTx, savedTy, scale, tx, ty]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(
        Math.max(savedScale.value * e.scale, 1),
        MAX_SCALE,
      );
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        resetZoom(pageIndex);
        return;
      }
      savedScale.value = scale.value;
      scheduleOnRN(onZoomChange, pageIndex, true);
    });

  // ⚠️ 必须用 enabled(zoomed) 门控：
  // 未放大时若让这个 Pan 激活，它会把横向拖动抢走，外层翻页手势就收不到了。
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .minDistance(6)
    // 双指缩放时跟随「所有手指的平均点」，否则缩放与拖动会互相打架
    .averageTouches(true)
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) return;
      // 超出边界弹回去（卡片尺寸即最大可见范围）
      const boundX = Math.max(0, (width * scale.value - width) / 2);
      const boundY = Math.max(0, (height * scale.value - height) / 2);
      const nextX = Math.min(Math.max(tx.value, -boundX), boundX);
      const nextY = Math.min(Math.max(ty.value, -boundY), boundY);
      tx.value = withTiming(nextX, { duration: 180 });
      ty.value = withTiming(nextY, { duration: 180 });
      savedTx.value = nextX;
      savedTy.value = nextY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((e) => {
      if (scale.value > 1) {
        resetZoom(pageIndex);
        return;
      }
      // 以双击点为中心放大
      const nextX = -(e.x - width / 2) * (DOUBLE_TAP_SCALE - 1);
      const nextY = -(e.y - height / 2) * (DOUBLE_TAP_SCALE - 1);
      scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 200 });
      savedScale.value = DOUBLE_TAP_SCALE;
      tx.value = withTiming(nextX, { duration: 200 });
      ty.value = withTiming(nextY, { duration: 200 });
      savedTx.value = nextX;
      savedTy.value = nextY;
      scheduleOnRN(onZoomChange, pageIndex, true);
    });

  // 注意：这里刻意不挂单击手势 —— 点图片不关闭预览。
  // 关闭只发生在：点遮罩 / 关闭钮 / web 的 Esc / Android 返回键。
  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View
        style={[styles.page, { width, height, left }]}
        collapsable={false}
      >
        <Animated.Image
          source={{ uri }}
          style={[styles.image, imageStyle]}
          resizeMode="contain"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
        />
        {loading ? (
          <View style={styles.pageLoading} pointerEvents="none">
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
});

export default function ImageViewer({
  visible,
  images,
  index,
  onClose,
  onIndexChange,
}: ImageViewerProps) {
  const { width, height } = useWindowDimensions();
  // 注意：不能用 useSafeAreaInsets()——它要求树上存在 SafeAreaProvider，
  // 而本项目（expo-router Drawer）并没有提供，缺失时会直接抛错。这里读 context + 兜底。
  const insets = useContext(SafeAreaInsetsContext) ?? ZERO_INSETS;

  /** 非 null = 该页处于放大状态：此时禁掉翻页手势 */
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);

  // 翻页位移：始终等于「当前视觉位置」，一个值搞定拖动和回弹
  const pagerX = useSharedValue(0);
  const startPagerX = useSharedValue(0);
  const startIndex = useSharedValue(0);
  const openedRef = useRef(false);
  /** 本次 index 变化是否由翻页手势自己发起（是的话别去动正在跑的动画） */
  const fromPagerRef = useRef(false);

  const safeIndex = Math.min(
    Math.max(index, 0),
    Math.max(images.length - 1, 0),
  );

  // 四周留白：避开刘海 / home 条，桌面端再放大一些
  const gutter = width >= 768 ? 48 : 16;
  const padTop = Math.max(insets.top, 12) + 20;
  const padBottom = Math.max(insets.bottom, 12) + 20;
  const cardWidth = Math.max(Math.min(width - gutter * 2, MAX_CARD_WIDTH), 1);
  const cardHeight = Math.max(height - padTop - padBottom, 200);

  // 只渲染当前页左右各一页
  const windowStart = Math.max(0, safeIndex - 1);
  const windowEnd = Math.min(images.length - 1, safeIndex + 1);

  const handleZoomChange = useCallback((pageIndex: number, zoomed: boolean) => {
    setZoomedIndex(zoomed ? pageIndex : null);
  }, []);

  const commitIndex = useCallback(
    (next: number) => {
      // 只有真的换页了才标记：被边界 clamp 回去时不能留下脏标记，
      // 否则下一次键盘翻页会被误判成「手势自己发的」而不对齐
      if (next !== safeIndex) fromPagerRef.current = true;
      onIndexChange(next);
    },
    [onIndexChange, safeIndex],
  );

  /**
   * 自己实现翻页手势，而不是交给横向 ScrollView：
   *  1) ScrollView 会被子级 Pan 手势抢走触摸；
   *  2) react-native-web 的 ScrollView 压根不支持鼠标拖动滚动，
   *     只有 wheel / 滚动条 / 键盘，鼠标拖拽翻页在 web 上不可能生效。
   */
  const pagerPan = Gesture.Pan()
    .enabled(zoomedIndex === null)
    .minDistance(8)
    .onBegin(() => {
      // 打断还在跑的动画，并记下起点（否则会按动画中途的位置算页码）
      cancelAnimation(pagerX);
      startPagerX.value = pagerX.value;
      startIndex.value = safeIndex;
    })
    .onUpdate((e) => {
      // 到头时加阻尼，给出「没有下一页」的手感
      const from = startIndex.value;
      const atStart = from === 0 && e.translationX > 0;
      const atEnd = from >= images.length - 1 && e.translationX < 0;
      pagerX.value =
        startPagerX.value +
        (atStart || atEnd ? e.translationX * 0.3 : e.translationX);
    })
    // 用 onFinalize 而不是 onEnd：手指没超过 minDistance 时手势是 fail 状态，
    // onEnd 不会触发，位移就停在半路；onFinalize 一定会兜住并对齐回整页
    .onFinalize((e) => {
      const from = startIndex.value;
      const threshold = cardWidth * PAGE_DISTANCE_RATIO;
      const dx = e?.translationX ?? 0;
      const vx = e?.velocityX ?? 0;

      let next = from;
      if (dx <= -threshold || vx <= -PAGE_VELOCITY) next = from + 1;
      else if (dx >= threshold || vx >= PAGE_VELOCITY) next = from - 1;

      const clamped = Math.min(
        Math.max(next, 0),
        Math.max(images.length - 1, 0),
      );
      // 单个弹簧动画并把手指的初速度交进去 → 衔接动量，
      // 不会出现「先抽搐一下、再慢慢滑过去」
      pagerX.value = withSpring(-clamped * cardWidth, {
        velocity: vx,
        damping: 40,
        stiffness: 250,
        mass: 0.7,
        overshootClamping: true,
      });
      scheduleOnRN(commitIndex, clamped);
    });

  // 打开 / 外部改 index（键盘翻页）时把整排图片对齐到目标页
  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      fromPagerRef.current = false;
      return;
    }
    // 翻页手势自己刚改的 index：弹簧正在跑，绝不能 cancelAnimation 再换成
    // 不带初速度的 withTiming —— 那一下 JS 往返正是「滑快了掉帧」的主因
    if (fromPagerRef.current) {
      fromPagerRef.current = false;
      setZoomedIndex(null);
      return;
    }
    const target = -safeIndex * cardWidth;
    cancelAnimation(pagerX);
    if (!openedRef.current) {
      // 首次打开直接就位，避免先闪一下第一页再滑过去
      openedRef.current = true;
      pagerX.value = target;
    } else {
      pagerX.value = withTiming(target, { duration: 200 });
    }
    setZoomedIndex(null);
  }, [visible, safeIndex, cardWidth, pagerX]);

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pagerX.value }],
  }));

  // web：Esc 关闭、← → 翻页
  useEffect(() => {
    if (Platform.OS !== "web" || !visible || typeof document === "undefined") {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && safeIndex > 0) {
        onIndexChange(safeIndex - 1);
      } else if (e.key === "ArrowRight" && safeIndex < images.length - 1) {
        onIndexChange(safeIndex + 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, safeIndex, images.length, onClose, onIndexChange]);

  if (!visible || images.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Android 上 Modal 是独立 window，手势需要自己的 RNGH 根节点 */}
      <GestureHandlerRootView style={styles.backdrop}>
        {/* 卡片之外的区域：点击关闭（盖在卡片下面，不影响卡内手势） */}
        <Pressable style={styles.backdropFill} onPress={onClose} />

        <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
          <GestureDetector gesture={pagerPan}>
            <View
              style={[
                styles.viewport,
                { width: cardWidth, height: cardHeight },
              ]}
            >
              <Animated.View
                style={[styles.pagerRow, pagerStyle, { width: cardWidth, height: cardHeight }]}
              >
                {/* 只挂载当前页 ±1：每一页都是一张全屏大图，
                    全量挂载会让滑动时每帧合成 N张大图 → 掉帧 */}
                {images.slice(windowStart, windowEnd + 1).map((uri, i) => {
                  const pageIndex = windowStart + i;
                  return (
                    <ViewerPage
                      key={`${pageIndex}-${uri.slice(0, 24)}`}
                      uri={uri}
                      pageIndex={pageIndex}
                      active={pageIndex === safeIndex}
                      width={cardWidth}
                      height={cardHeight}
                      left={pageIndex * cardWidth}
                      zoomed={zoomedIndex === pageIndex}
                      onZoomChange={handleZoomChange}
                    />
                  );
                })}
              </Animated.View>
            </View>
          </GestureDetector>

          {/* 卡片内顶部：序号 + 关闭（小圆钮，落在图片留白处） */}
          <View style={styles.cardTopBar} pointerEvents="box-none">
            <Text style={styles.counter}>
              {safeIndex + 1} / {images.length}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.closeBtnPressed,
                Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null,
              ]}
            >
              <Feather name="x" size={20} color="#ffffff" />
            </Pressable>
          </View>

          {images.length > 1 ? (
            <View style={styles.hintWrap} pointerEvents="none">
              <Text style={styles.hint}>双击放大 · 左右拖动切换</Text>
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.66)",
  },
  backdropFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#151618",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 18,
  },
  viewport: {
    overflow: "hidden",
  },
  pagerRow: {
    position: "relative",
  },
  page: {
    position: "absolute",
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  pageLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  counter: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    // 图片可能是纯白，序号必须自带深色底才看得清
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.5)",
    overflow: "hidden",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    // 白底图上浅色按钮会消失，这里用深色实底 + 淡描边
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  closeBtnPressed: {
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  hintWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
    alignItems: "center",
  },
  hint: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    overflow: "hidden",
  },
});
