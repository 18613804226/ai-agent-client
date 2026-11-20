/** 🖥️ PC 网页端宽度断点（app/index.tsx 与 Sidebar 共用，避免两处漂移） */
export const PC_WEB_BREAKPOINT = 768;

/** 是否为 PC 网页端宽度（> 断点） */
export const isPCWebWidth = (width: number) => width > PC_WEB_BREAKPOINT;

/** 是否为手机 H5 网页端宽度（<= 断点） */
export const isMobileWebWidth = (width: number) => width <= PC_WEB_BREAKPOINT;

/** 统一圆角标尺（px） */
export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** 统一间距标尺（4 的倍数，px） */
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** 语义状态色 */
export const SEMANTIC_COLORS = {
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
} as const;

export const darkTheme = {
  bgApp: '#000',
  // ⚠️ 抽屉底色与 bgApp 完全一致：抽屉滑动时，这两个底色之间**不能有颜色接缝**，
  //    否则 Android 上会露成残影（亮色下 #fff / #F0F4F9 差 15 级才看不出来）。
  //    抽屉与内容的层次交给 drawerOverlay（遮罩）去区分，不靠底色差。
  bgSidebar: '#000',
  /** 抽屉打开时盖在内容上的遮罩：暗色下用深灰，让「黑抽屉」和「被遮罩的内容」分得开 */
  drawerOverlay: 'rgba(30,30,30,0.75)',
  border: '#2A2B2D',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  surfaceElevated: 'rgba(255, 255, 255, 0.04)',
  codeBg: '#141518',
  codeBorder: 'rgba(255, 255, 255, 0.08)',
  primary: '#2F7DE1',
  primaryHover: '#1F5FBF',
  primarySoft: 'rgba(47, 125, 225, 0.16)',
  primaryBorder: 'rgba(47, 125, 225, 0.40)',
  success: SEMANTIC_COLORS.success,
  warning: SEMANTIC_COLORS.warning,
  danger: SEMANTIC_COLORS.danger,
  textMain: '#E6E6E6',
  textPrimary: '#E6E6E6',
  textSecondary: '#A3A7AC',
  textTertiary: '#6E7278',
  textMuted: '#8E918F',
  btnBg: '#28292A',
  btnText: '#E3E3E3',
  historyActiveBg: '#1A4B84',
  historyActiveText: '#D6ECFF',
  bubbleUserBg: '#2568C9',
  bubbleUserText: '#F5F9FF',
  bubbleAiBg: 'transparent',
  bubbleAiText: '#E6E6E6',
  timeUserText: 'rgba(227,227,227,0.6)',
  timeAiText: '#8E918F',
  inputBg: '#1E1F20',
  sendBtnActive: '#2F7DE1',
  sendBtnHover: '#1F5FBF',
  sendBtnDisabled: '#333538',
  uploadBorder: 'rgba(47, 125, 225, 0.45)',
  isDark: true,
};

export type AppTheme = typeof darkTheme;

export const lightTheme: AppTheme = {
  bgApp: '#fff',
  // 与暗色同理：抽屉底色 = 内容底色，层次靠遮罩
  bgSidebar: '#fff',
  drawerOverlay: 'rgba(0,0,0,0.5)',
  border: '#D8DEE4',
  borderSubtle: 'rgba(0, 0, 0, 0.08)',
  borderStrong: 'rgba(0, 0, 0, 0.16)',
  surfaceElevated: '#F6F8FA',
  codeBg: '#F4F6F8',
  codeBorder: 'rgba(0, 0, 0, 0.08)',
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primarySoft: 'rgba(37, 99, 235, 0.10)',
  primaryBorder: 'rgba(37, 99, 235, 0.28)',
  success: SEMANTIC_COLORS.success,
  warning: SEMANTIC_COLORS.warning,
  danger: SEMANTIC_COLORS.danger,
  textMain: '#1F1F1F',
  textPrimary: '#1F1F1F',
  textSecondary: '#5E5E5E',
  textTertiary: '#8C959F',
  textMuted: '#5E5E5E',
  btnBg: '#DEE4EA',
  btnText: '#1F1F1F',
  historyActiveBg: '#DCEAFE',
  historyActiveText: '#0A2558',
  bubbleUserBg: '#DCEAFE',
  bubbleUserText: '#0A2558',
  bubbleAiBg: 'transparent',
  bubbleAiText: '#1F1F1F',
  timeUserText: '#5E5E5E',
  timeAiText: '#5E5E5E',
  inputBg: '#F0F4F9',
  sendBtnActive: '#2563EB',
  sendBtnHover: '#1D4ED8',
  sendBtnDisabled: '#D8DEE4',
  uploadBorder: 'rgba(37, 99, 235, 0.35)',
  isDark: false,
};
