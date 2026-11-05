import { Platform, StyleSheet } from 'react-native'

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
    padding: 12,
    justifyContent: 'space-between'
  },
  sidebarTop: {
    marginBottom: 4
  },
  newChatBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center'
  },
  newChatBtnText: {
    fontWeight: '600',
    fontSize: 14
  },
  uploadSection: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center'
  },
  uploadText: {
    fontSize: 13,
    fontWeight: '500'
  },
  uploadHint: {
    fontSize: 11,
    marginTop: 0,
    marginBottom: 0,
    textAlign: 'center'
  },
  categoryTitle: {
    fontSize: 12,
    marginVertical: 6,
    paddingHorizontal: 4,
    fontWeight: '500'
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
    paddingVertical: Platform.OS === 'web' ? 6 : 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginBottom: 4
  },
  fileInfo: {
    flex: 1,
    marginRight: 6
  },
  fileText: {
    fontSize: 13
  },
  fileEnabledText: {
    fontSize: 10,
    marginTop: 2
  },
  fileToggleHint: {
    fontSize: 10,
    marginTop: -4,
    marginBottom: 6,
    paddingHorizontal: 4
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
    color: '#ef4444'
  },
  historyContainer: {
    flex: 1,
    marginVertical: 4
  },
  historyList: {
    flex: 1
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginBottom: 4
  },
  historyText: {
    fontSize: 14
  },
  deleteBtn: {
    padding: 3,
    marginLeft: 6,
    borderRadius: 12
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: '600'
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
    paddingHorizontal: 8,
    marginBottom: 8,
    borderRadius: 15
  },
  adminEntryIcon: {
    fontSize: 15,
    marginRight: 9
  },
  adminEntryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500'
  },
  adminEntryHint: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  appearanceSection: {
    marginBottom: 8
  },
  appearanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4
  },
  quotaText: {
    fontSize: 11,
    fontWeight: '600'
  },
  appearanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 4
  },
  appearanceOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 15
  },
  appearanceOption: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 13
  },
  appearanceIcon: {
    fontSize: 12,
    marginRight: 4
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
    borderRadius: 12,
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
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    boxShadow: '0px 10px 12px rgba(0, 0, 0, 0.4)',
    elevation: 10
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8
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
    gap: 12
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center'
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '600'
  }
})
