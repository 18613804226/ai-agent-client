import { Platform } from 'react-native';
import * as Device from 'expo-device';

export interface DeviceMeta {
  platform?: string;
  model?: string;
  osVersion?: string;
}

/**
 * Web 端从 userAgent 粗解析浏览器名。解析不出返回 'Web'。
 */
function parseWebBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/CriOS\//.test(ua)) return 'Chrome (iOS)';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Web';
}

/**
 * Web 端从 userAgent 粗解析系统版本（OS 名 + 版本号），拿不到返回空串。
 */
function parseWebOsVersion(ua: string): string {
  // Android 11
  const android = ua.match(/Android\s([\d.]+)/);
  if (android) return `Android ${android[1]}`;
  // iPhone OS 17_5 / CPU OS 17_5
  const ios = ua.match(/(?:iPhone )?OS (\d+[_.]\d+(?:[_.]\d+)?)/);
  if (ios) return `iOS ${ios[1].replace(/_/g, '.')}`;
  // Mac OS X 10_15_7
  const mac = ua.match(/Mac OS X (\d+[_.]\d+(?:[_.]\d+)?)/);
  if (mac) return `macOS ${mac[1].replace(/_/g, '.')}`;
  // Windows NT 10.0
  const win = ua.match(/Windows NT ([\d.]+)/);
  if (win) return `Windows ${win[1]}`;
  return '';
}

/**
 * 采集设备终端形态，登录时上报给后端（platform / model / osVersion）。
 *
 * - 原生：expo-device 同步常量；拿不到逐级兜底，绝不留空 platform。
 * - Web：expo-device 这些常量均为 null，改从 navigator.userAgent 粗解析。
 *
 * 全程 try/catch：任何异常都返回安全默认值，绝不阻断登录。
 */
export function getDeviceInfo(): DeviceMeta {
  try {
    // ===== Web =====
    if (Platform.OS === 'web') {
      const ua =
        typeof navigator !== 'undefined' && navigator.userAgent
          ? navigator.userAgent
          : '';
      const osVersion = parseWebOsVersion(ua);
      return {
        platform: 'web',
        model: parseWebBrowser(ua),
        osVersion:
          osVersion ||
          (typeof navigator !== 'undefined' && (navigator as any).platform
            ? String((navigator as any).platform)
            : ''),
      };
    }

    // ===== 原生（iOS / Android / tvOS）=====
    const model =
      Device.modelName || Device.designName || Device.manufacturer || '';
    const osVersion =
      Device.osVersion ||
      (Device.osName ? String(Device.osName) : '') ||
      '';
    return {
      platform: Platform.OS,
      model,
      osVersion,
    };
  } catch {
    // 兜底：至少带上平台，其余留空
    return { platform: Platform.OS, model: '', osVersion: '' };
  }
}
