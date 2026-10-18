import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, Image } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'

/** 与 app.json 的 splash.backgroundColor 保持同色：原生启动屏交给 JS 动效时无缝衔接 */
export const BRAND_SPLASH_BG = '#FFFFFF'

/** 入场动画时长（ms）：外层的退场等待要跟它对齐，别提前淡出 */
export const BOOT_ENTER_MS = 460
/** 退场淡出时长（ms） */
export const BOOT_EXIT_MS = 240
/** 图片兜底超时：onLoad 万一不来，也不能让原生启动屏一直挂着 */
const IMG_TIMEOUT_MS = 500

/**
 * 冷启动后的 JS 层品牌启动动效（原生启动屏之后接管）。
 *
 * 为什么还需要这一层：原生启动屏（expo-splash-screen）受平台限制只能是静态图 +
 * 背景色，动不了；真正的启动动画只能等 JS 跑起来后在 React 里做。
 *
 * 两个关键设计：
 *
 * 1. 图片用的是**透明底**方形 logo（assets/boot-logo.png），与原生层 splash.image
 *    同一张。这样淡出时只有深色 logo 在淡，不会把「不透明浅色方块」压到深色内容上
 *    （应用图标 icon-1024.png 必须不透明，那是给 iOS/Launcher 的，不能用在启动屏）。
 *
 * 2. **等图片解码完成**才关原生启动屏、才播入场动画。
 *    RN 的 <Image> 是异步加载的，若不等它，会先看到一片纯色底、logo 晚半拍才
 *    「蹦」出来 —— 那一下特别不协调。等 onLoad（或有兜底超时）再开播，logo 就是
 *    「从无到有淡入」，而不是迟到的弹出。
 *    因为原生启动屏是同一张图 + 同一个底色，等它几毫秒不会露白，衔接仍然无缝。
 */
const BootSplash = memo(function BootSplash({
  exiting = false,
  onEntered
}: {
  exiting?: boolean
  onEntered?: () => void
}) {
  const enter = useSharedValue(0)
  const leave = useSharedValue(0)
  /** 本屏是否已完成布局 */
  const [laidOut, setLaidOut] = useState(false)
  /** 图片是否已解码（或兜底超时已到） */
  const [imgReady, setImgReady] = useState(false)
  /** 只交接一次 */
  const handedOff = useRef(false)

  // ⚠️ 同样必须固定身份：react-native-web 的 Image 把 onLoad/onError 放进了 effect
  // 依赖（dist/exports/Image/index.js:262），内联箭头会让 effect 每次渲染重跑，
  // 触发 abortPendingRequest() + 重新 ImageLoader.load()，图片被反复重载。
  const handleImgLoad = useCallback(() => setImgReady(true), [])
  const handleImgError = useCallback(() => setImgReady(true), [])

  // 布局完成 + 图片解码完成，两个都满足才交接：关原生启动屏 + 开播入场动画
  useEffect(() => {
    if (!laidOut || !imgReady || handedOff.current) return
    handedOff.current = true
    enter.value = withTiming(1, {
      duration: BOOT_ENTER_MS,
      easing: Easing.out(Easing.cubic)
    })
  }, [laidOut, imgReady, enter])

  // 图片兜底：onLoad 丢了/加载失败也不能卡住启动
  useEffect(() => {
    const id = setTimeout(() => setImgReady(true), IMG_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [])

  // 入场播完才通知上层「可以退场了」
  useEffect(() => {
    if (!imgReady) return
    const id = setTimeout(() => onEntered?.(), BOOT_ENTER_MS)
    return () => clearTimeout(id)
  }, [imgReady, onEntered])

  // 退场：整屏淡出（跑 UI 线程，不触发 JS 重渲染）
  useEffect(() => {
    if (!exiting) return
    leave.value = withTiming(1, {
      duration: BOOT_EXIT_MS,
      easing: Easing.inOut(Easing.ease)
    })
  }, [exiting, leave])

  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value }))
  const logoStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.86 + 0.14 * enter.value }]
  }))
  const brandStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (enter.value - 0.3) / 0.7)
  }))

  return (
    <Animated.View
      style={[styles.root, rootStyle, { pointerEvents: 'none' }]}
      onLayout={() => setLaidOut(true)}
    >
      <Animated.View style={logoStyle}>
        <Image
          source={require('../../assets/boot-logo.png')}
          style={styles.logo}
          resizeMode="contain"
          onLoad={handleImgLoad}
          onError={handleImgError}
        />
      </Animated.View>
      {/* <Animated.Text style={[styles.brand, brandStyle]}>
        DieTai-Ai
      </Animated.Text> */}
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BRAND_SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  logo: {
    width: 120,
    height: 120
  },
  brand: {
    marginTop: 14,
    fontSize: 13,
    letterSpacing: 3,
    fontWeight: '600',
    color: '#2F2C3B'
  }
})

export default BootSplash
