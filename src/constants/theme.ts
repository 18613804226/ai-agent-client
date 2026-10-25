/** 🖥️ PC 网页端宽度断点（app/index.tsx 与 Sidebar 共用，避免两处漂移） */
export const PC_WEB_BREAKPOINT = 768;

/** 是否为 PC 网页端宽度（> 断点） */
export const isPCWebWidth = (width: number) => width > PC_WEB_BREAKPOINT;

/** 是否为手机 H5 网页端宽度（<= 断点） */
export const isMobileWebWidth = (width: number) => width <= PC_WEB_BREAKPOINT;

export const darkTheme = {
  bgApp: '#000',
  // ⚠️ 抽屉底色与 bgApp 完全一致：抽屉滑动时，这两个底色之间**不能有颜色接缝**，
  //    否则 Android 上会露成残影（亮色下 #fff / #F0F4F9 差 15 级才看不出来）。
  //    抽屉与内容的层次交给 drawerOverlay（遮罩）去区分，不靠底色差。
  bgSidebar: '#000',
  /** 抽屉打开时盖在内容上的遮罩：暗色下用深灰，让「黑抽屉」和「被遮罩的内容」分得开 */
  drawerOverlay: 'rgba(30,30,30,0.75)',
  border: '#2A2B2D',
  textMain: '#E3E3E3',
  textMuted: '#8E918F',
  btnBg: '#28292A',
  btnText: '#E3E3E3',
  historyActiveBg: '#004A77',
  historyActiveText: '#C2E7FF',
  bubbleUserBg: '#004A77',
  bubbleUserText: '#E3E3E3',
  bubbleAiBg: '#1E1F20',
  bubbleAiText: '#E3E3E3',
  timeUserText: 'rgba(227,227,227,0.6)',
  timeAiText: '#8E918F',
  inputBg: '#1E1F20',
  sendBtnActive: '#4b92ee',
  sendBtnHover: '#1977f1',
  sendBtnDisabled: '#333538',
  uploadBorder: '#004a77',
  isDark: true,
};

export const lightTheme = {
  bgApp: '#fff',
  // 与暗色同理：抽屉底色 = 内容底色，层次靠遮罩
  bgSidebar: '#fff',
  drawerOverlay: 'rgba(0,0,0,0.5)',
  border: '#D8DEE4',
  textMain: '#1F1F1F',
  textMuted: '#5E5E5E',
  btnBg: '#DEE4EA',
  btnText: '#1F1F1F',
  historyActiveBg: '#D3E3FD',
  historyActiveText: '#041E49',
  bubbleUserBg: '#D3E3FD',
  bubbleUserText: '#041E49',
  bubbleAiBg: '#F0F4F9',
  bubbleAiText: '#1F1F1F',
  timeUserText: '#5E5E5E',
  timeAiText: '#5E5E5E',
  inputBg: '#F0F4F9',
  sendBtnActive: '#4b92ee',
  sendBtnHover: '#1977f1',
  sendBtnDisabled: '#D8DEE4',
  uploadBorder: '#d3e3fd',
  isDark: false,
};
