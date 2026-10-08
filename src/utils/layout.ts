import { Platform } from 'react-native';

/**
 * Web 专用：给每条消息行做布局隔离（contain: layout style）。
 * 某条气泡自己长高时，不让浏览器把「同一条滚动内容里的其它块」也拉进布局计算，
 * 重排范围就锁在这一条消息里。原生样式表没有这个属性，仅 Web 生效。
 */
export const WEB_ROW_CONTAINMENT =
  Platform.OS === 'web' ? ({ contain: 'layout style' } as any) : null;
