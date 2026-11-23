import { Platform, StyleSheet } from 'react-native'
import { RADIUS, SEMANTIC_COLORS, SPACING } from '../../constants/theme'

/**
 * 📱 H5/OPPO：列表区块（已上传文件 / 最近记录）防长按样式——只禁选中与
 * 系统 callout 菜单，不带 touchAction:none（保留区块内拖动滚动）。
 * 覆盖区块内的标题/提示等裸文字（样式经继承作用到所有子孙）。
 */
export const SECTION_NO_CALLOUT_STYLE = Platform.select({
  web: {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  } as any,
  default: {},
})

// 📱 长按菜单卡片尺寸（用于夹取在容器范围内）
export const CTX_CARD_W = 168
export const CTX_CARD_H = 150 // 估算：标题 + 两个选项

export const sidebarStyles = StyleSheet.create({
  sidebarRoot: {
    flex: 1
  },
  sidebarInner: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: 'space-between'
  },
  sidebarTop: {
    marginBottom: SPACING.xs
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1
  },
  newChatBtnText: {
    fontWeight: '600',
    fontSize: 14
  },
  uploadSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: SPACING.sm,
    borderRadius: 22,
    borderWidth: 1
  },
  uploadIconBadge: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  uploadTextGroup: {
    flex: 1,
    minWidth: 0
  },
  uploadText: {
    fontSize: 13,
    fontWeight: '600'
  },
  uploadHint: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 6
  },
  fileListContainer: {
    maxHeight: 200,
    marginVertical: 2
  },
  subScrollContainer: {
    maxHeight: 190
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 6
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 6
  },
  fileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  fileText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    minWidth: 0
  },
  fileEnabledText: {
    fontSize: 10,
    marginTop: 2,
    marginLeft: 20
  },
  fileToggleHint: {
    fontSize: 10,
    marginTop: -4,
    marginBottom: 6,
    paddingHorizontal: 6
  },
  fileEnabledSwitch: {
    marginLeft: 2,
    marginRight: 2,
    width: 40,
    height: 24,
    justifyContent: 'center'
  },
  fileSwitchDisabled: {
    opacity: 0.55
  },
  fileSwitchTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center'
  },
  fileSwitchThumb: {
    position: 'absolute',
    left: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff'
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(150, 150, 150, 0.25)',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 3
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  progressPct: {
    fontSize: 10,
    marginLeft: 6,
    minWidth: 30,
    textAlign: 'right'
  },
  resultIcon: {
    marginLeft: 6
  },
  fileErrorText: {
    fontSize: 11,
    marginTop: 3,
    marginLeft: 20,
    color: SEMANTIC_COLORS.danger
  },
  historyContainer: {
    flex: 1,
    marginVertical: SPACING.xs
  },
  historyList: {
    flex: 1
  },
  historyItem: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 3,
    overflow: 'hidden'
  },
  historyText: {
    fontSize: 14
  },
  deleteSlot: {
    width: 24,
    height: 24,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? ({
          transitionProperty: 'opacity',
          transitionDuration: '0.12s',
          transitionTimingFunction: 'ease'
        } as any)
      : null)
  },
  deleteBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill
  },
  sidebarFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4
  },
  adminEntry: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 10,
    borderRadius: RADIUS.lg,
    borderWidth: 1
  },
  adminEntryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1
  },
  adminEntryText: {
    fontSize: 13,
    fontWeight: '500'
  },
  adminEntryHint: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  appearanceSection: {
    marginBottom: 10
  },
  appearanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4
  },
  appearanceLabelRowCompact: {
    marginBottom: 4
  },
  quotaText: {
    fontSize: 11,
    fontWeight: '600'
  },
  quotaBarTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginHorizontal: 4,
    marginBottom: 7
  },
  quotaBarFill: {
    height: '100%',
    borderRadius: 2
  },
  appearanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2
  },
  appearanceLabelStandalone: {
    marginBottom: 6,
    paddingHorizontal: 4
  },
  appearanceOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 18,
    borderWidth: 1
  },
  appearanceTrackInner: {
    position: 'relative',
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 3
  },
  appearanceThumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 14,
    borderWidth: 1,
    pointerEvents: 'none'
  },
  appearanceThumbLightShadow: {
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)'
  },
  appearanceOption: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1
  },
  appearanceOptionText: {
    fontSize: 12,
    fontWeight: '500'
  },
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999
  },
  sheetCard: {
    position: 'absolute',
    width: CTX_CARD_W,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingVertical: 4,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.25)',
    elevation: 6
  },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6
  },
  sheetItem: {
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  sheetItemText: {
    fontSize: 14,
    fontWeight: '500'
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  confirmBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  },
  confirmCard: {
    width: '80%',
    maxWidth: 320,
    padding: SPACING.xl,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    boxShadow: '0px 10px 12px rgba(0, 0, 0, 0.4)',
    elevation: 10
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: SPACING.sm
  },
  confirmDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20
  },
  confirmBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: SPACING.md
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center'
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '600'
  }
})
