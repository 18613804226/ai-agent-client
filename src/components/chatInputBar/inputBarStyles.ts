import { Platform, StyleSheet } from 'react-native'

/**
 * 悬浮输入栏占地常量：pill 高、pill 与提示区域间隙、提示区域高。
 */
export const INPUT_BAR = {
  pillMinH: 56,
  pillPanelGap: 0,
  panelH: 18,
  /** 渐变纱幕高度（不含安全区）：从 pill 中部（pillMinH/2 + panelH）开始
   *              往下渐变为半透，到底部约 90% 不透明（接近全实，仍透一点）。 */
  panelFadeH: 49,
  sheetMargin: 17,
} as const

export const inputBarStyles = StyleSheet.create({
  inputAreaWrapper: {
    // 悬浮层：绝对定位贴在容器底部、不占布局流，消息从输入框/条带底下滚过。
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    overflow: 'hidden'
  },
  previewContainer: {
    maxHeight: 80,
    marginBottom: 8
  },
  previewContentContainer: {
    alignItems: 'center',
    gap: 8
  },
  previewItem: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    // 底色/描边由调用处按主题注入（写死浅色会在暗色主题下发白）
    overflow: 'hidden'
  },
  /** 文档预览 chip：宽条形（文件名长），高度与图片缩略图一致*/
  fileChip: {
    position: 'relative',
    width: 158,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden'
  },
  fileChipTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8
  },
  fileExtBox: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  fileExtText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.3
  },
  fileChipMeta: {
    flex: 1,
    justifyContent: 'center'
  },
  fileChipName: {
    fontSize: 11,
    fontWeight: '500'
  },
  fileChipSize: {
    fontSize: 10,
    marginTop: 1
  },
  previewImageTap: {
    width: '100%',
    height: '100%'
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover'
  },
  deleteBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  deleteBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold'
  },
  inputBar: {
    minHeight: 56,
    flexDirection: 'row',
    // 多行时让左右按钮贴底（而不是浮在 pill 垂直中间）。
    // 单行时 pill 高 = 40(按钮) + 8×2(paddingVertical) = 56 = minHeight，
    // center 与 flex-end 算出来完全一样，所以单行观感零变化。
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 8,
    // 不做投影：白色主题下白底 + 深色阴影显得脏，浅色描边已足够勾勒浮起感。
    // elevation 也永久拿掉：安卓上它生成额外原生层，半透明底下透出白条（已实锤）
  },
  panelTipZone: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)'
  },
  input: {
    flex: 1,
    maxHeight: 280,
    fontSize: 15,
    paddingLeft: 4,
    paddingTop: Platform.OS === 'ios' ? 10 : 9,
    paddingBottom: Platform.OS === 'ios' ? 10 : 9,
    textAlignVertical: 'center',
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        resize: 'none',
        overflowY: 'auto',
        height: 'auto',
        // 锁定行盒：不写 line-height 时浏览器用 normal，它随字体度量变化 ——
        // 汉字回退到系统 CJK 字体后 ascent/descent 更大，混排的 line box 会被
        // 撑高 2~4px；field-sizing:content 直接把内容高度当 textarea 高度，于是
        // 「一输入中文 pill 就变高一截」，纯英文/数字全程同一字体则不会。
        // 22px 按 _layout 注入的 16px 计算字号配（transform scale 后视觉 ≈20.6px），
        // 足以覆盖常见 CJK 字体的自然行盒，旧内核的 scrollHeight 兜底也一并稳定。
        lineHeight: 22,
        fieldSizing: 'content'
      } as any
    })
  },
  inputWithLeftPadding: {
    paddingLeft: 4
  },

  /* ---------- 按住说话（科技感） ---------- */
  voiceHoldWrap: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4
  },
  voiceHoldBtn: {
    flexDirection: 'row',
    width: '100%',
    height: 40,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)'
    // backgroundColor: 'rgba(0, 229, 255, 0.04)',
    // 长按压制样式已由 useSuppressBrowserCallout.suppressStyle 统一提供，这里不重复写
  },
  voiceHoldBtnActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: 'rgba(0, 229, 255, 0.1)',
    boxShadow: '0px 0px 12px rgba(0, 229, 255, 0.27)',
    elevation: 8
  },
  voiceHoldText: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5
  },
  voiceHoldTextActive: {
    color: 'rgba(0, 229, 255, 0.3)',
    ...Platform.select({
      web: { textShadow: '0px 0px 8px rgba(0, 229, 255, 0.1)' } as any,
      default: {
        textShadowColor: 'rgba(0, 229, 255, 0.1)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8
      }
    })
  },
  pulseRing: {
    position: 'absolute',
    width: '100%',
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#00E5FF'
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E5FF',
    boxShadow: '0px 0px 6px #00E5FF'
  },

  /* ---------- 切换按钮 ---------- */
  modeToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },

  /* ---------- 发送按钮 ---------- */
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  footerTip: {
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
    marginTop: 0
  },
  fileHintRow: {
    marginBottom: 4
  },
  /** 传输中遮罩：铺满缩略图 / chip，中间放转圈 */
  uploadMask: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    // 半透明：既能看出「底下是啥」，又明确表示「还没就绪」
    opacity: 0.78
  },
  /** 失败遮罩：图标 + 「重试」提示，点 chip 即重传 */
  uploadMaskError: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    opacity: 0.9
  },
  uploadMaskErrorText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '700'
  },
  hintRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  fileHintText: {
    fontSize: 12,
    lineHeight: 18
  }
})
