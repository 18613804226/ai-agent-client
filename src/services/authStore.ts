import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application';

const TOKEN_KEY = 'auth-token';
const DEVICE_KEY = 'auth-device';
const DEVICE_ID_KEY = 'device-id';

export interface AuthDevice {
  id?: string;
  deviceId?: string;
  role?: 'user' | 'admin';
  dailyQuota?: number;
  usedToday?: number;
  totalCount?: number;
  totalTokens?: string;
  createdAt?: string;
  lastSeenAt?: string;
}

let cachedToken: string | null | undefined;
let cachedDevice: AuthDevice | null | undefined;
// 401 全局通知：登录过期时触发，UI 层订阅后清 token 跳登录
let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};
export const notifyUnauthorized = () => unauthorizedHandler?.();

// device 快照变化订阅：任何一层（登录 / 续期 / 配额自增 / 429 校准）更新了
// 缓存里的 device，React 层（AuthProvider → 侧栏配额文字）都会跟着刷新
type DeviceListener = (device: AuthDevice | null) => void;
const deviceListeners = new Set<DeviceListener>();
export function onDeviceChange(listener: DeviceListener): () => void {
  deviceListeners.add(listener);
  return () => {
    deviceListeners.delete(listener);
  };
}
function emitDeviceChange(device: AuthDevice | null) {
  deviceListeners.forEach((cb) => {
    try {
      cb(device);
    } catch {
      // 忽略订阅者异常
    }
  });
}

function randomHex(bytes = 16): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < bytes * 2; i += 1) {
    out += chars[Math.floor(Math.random() * 16)];
  }
  return out;
}

// deviceId 生成去重：并发调用共用同一次结果，杜绝同一台设备产出多个 deviceId。
// 启动时 loginAsDevice / refreshQuota 等几乎同时调 getDeviceId()，若各自 await getItem
// 再生成，会在"尚未写入 AsyncStorage"的窗口里各自造出不同 UUID，
// 后端就把同一台设备注册成多条记录（表现为切角色后列表冒出新设备）。
let deviceIdPromise: Promise<string> | null = null;
export function getDeviceId(): Promise<string> {
  if (!deviceIdPromise) deviceIdPromise = resolveDeviceId();
  return deviceIdPromise;
}

async function resolveDeviceId(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(DEVICE_ID_KEY);
    // 原生端：已存的纯 UUID（旧逻辑生成）一律升级为真机 ID，避免同一台手机有两个 deviceId。
    // Web 端没有真机 ID，存的 UUID 继续用。
    const isLegacyUuid =
      !!saved &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        saved,
      ) &&
      Platform.OS !== 'web';
    if (saved && !isLegacyUuid) return saved;
  } catch {
    // 忽略读取失败，重新生成
  }
  // 原生优先取真机 ID：Android 取 ANDROID_ID，iOS 取 IDFV，均无需额外权限。
  // 卸载重装不变（Android 刷机 / iOS 删光同 vendor App 重装除外）。
  if (Platform.OS !== 'web') {
    try {
      if (Platform.OS === 'android') {
        const androidId = Application.getAndroidId();
        if (androidId) {
          const nativeId = `android:${androidId}`;
          await AsyncStorage.setItem(DEVICE_ID_KEY, nativeId);
          return nativeId;
        }
      } else {
        const idfv = await Application.getIosIdForVendorAsync();
        if (idfv) {
          const nativeId = `ios:${idfv}`;
          await AsyncStorage.setItem(DEVICE_ID_KEY, nativeId);
          return nativeId;
        }
      }
    } catch {
      // 取不到真机 ID 就 fallback 到 UUID（比如 Expo Go / 模拟器的极端情况）
    }
  }
  // Web / 原生统一：优先用系统级随机 UUID，没有才 fallback 到 Math.random
  let deviceId: string;
  try {
    const g: any = globalThis as any;
    if (typeof g?.crypto?.randomUUID === 'function') {
      deviceId = g.crypto.randomUUID();
    } else {
      throw new Error('no randomUUID');
    }
  } catch {
    // uuid 风格：8-4-4-4-12 十六进制
    const h = randomHex(16);
    deviceId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    // 忽略持久化失败
  }
  return deviceId;
}

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // 忽略持久化失败
  }
  emitTokenChange(token);
}

export async function getDevice(): Promise<AuthDevice | null> {
  if (cachedDevice !== undefined) return cachedDevice;
  try {
    const raw = await AsyncStorage.getItem(DEVICE_KEY);
    cachedDevice = raw ? (JSON.parse(raw) as AuthDevice) : null;
  } catch {
    cachedDevice = null;
  }
  return cachedDevice;
}

export async function setDevice(device: AuthDevice | null): Promise<void> {
  cachedDevice = device;
  try {
    if (device) await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    else await AsyncStorage.removeItem(DEVICE_KEY);
  } catch {
    // 忽略持久化失败
  }
  emitDeviceChange(device);
}

export async function clearAuth(): Promise<void> {
  await setToken(null);
  await setDevice(null);
}

// ===== Admin 会话缓存（与 user token 分开存）=====
// 切回普通用户时不丢 admin token，下次切 Admin 免密秒切；
// 只有过期（401 自愈时）或显式清除才需要重新输密码。
const ADMIN_TOKEN_KEY = 'admin-token';
const ADMIN_DEVICE_KEY = 'admin-device';
let cachedAdminToken: string | null | undefined;
let cachedAdminDevice: AuthDevice | null | undefined;

export async function getAdminToken(): Promise<string | null> {
  if (cachedAdminToken !== undefined) return cachedAdminToken;
  try {
    cachedAdminToken = await AsyncStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    cachedAdminToken = null;
  }
  return cachedAdminToken;
}

export async function getAdminDevice(): Promise<AuthDevice | null> {
  if (cachedAdminDevice !== undefined) return cachedAdminDevice;
  try {
    const raw = await AsyncStorage.getItem(ADMIN_DEVICE_KEY);
    cachedAdminDevice = raw ? (JSON.parse(raw) as AuthDevice) : null;
  } catch {
    cachedAdminDevice = null;
  }
  return cachedAdminDevice;
}

export async function saveAdminSession(
  token: string,
  device?: AuthDevice | null,
): Promise<void> {
  cachedAdminToken = token;
  cachedAdminDevice = device ?? null;
  try {
    await AsyncStorage.setItem(ADMIN_TOKEN_KEY, token);
    if (device) await AsyncStorage.setItem(ADMIN_DEVICE_KEY, JSON.stringify(device));
    else await AsyncStorage.removeItem(ADMIN_DEVICE_KEY);
  } catch {
    // 忽略持久化失败
  }
}

export async function clearAdminSession(): Promise<void> {
  cachedAdminToken = null;
  cachedAdminDevice = null;
  try {
    await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
    await AsyncStorage.removeItem(ADMIN_DEVICE_KEY);
  } catch {
    // 忽略持久化失败
  }
}

// ===== User 会话缓存（与 admin token 对称）=====
// 切回普通用户 = 本地秒切回缓存的 user token，不发 device-login：
// 1) 没有在飞请求迟到顶掉刚切上的 token（User→Admin 快速连点的竞态）；
// 2) 不在服务端重发 token，避免把 admin 会话顶作废。
const USER_TOKEN_KEY = 'user-token';
const USER_DEVICE_KEY = 'user-device';
let cachedUserToken: string | null | undefined;
let cachedUserDevice: AuthDevice | null | undefined;

export async function getSavedUserToken(): Promise<string | null> {
  if (cachedUserToken !== undefined) return cachedUserToken;
  try {
    cachedUserToken = await AsyncStorage.getItem(USER_TOKEN_KEY);
  } catch {
    cachedUserToken = null;
  }
  return cachedUserToken;
}

export async function getSavedUserDevice(): Promise<AuthDevice | null> {
  if (cachedUserDevice !== undefined) return cachedUserDevice;
  try {
    const raw = await AsyncStorage.getItem(USER_DEVICE_KEY);
    cachedUserDevice = raw ? (JSON.parse(raw) as AuthDevice) : null;
  } catch {
    cachedUserDevice = null;
  }
  return cachedUserDevice;
}

export async function saveUserSession(
  token: string,
  device?: AuthDevice | null,
): Promise<void> {
  cachedUserToken = token;
  if (device !== undefined) cachedUserDevice = device;
  try {
    await AsyncStorage.setItem(USER_TOKEN_KEY, token);
    if (device) await AsyncStorage.setItem(USER_DEVICE_KEY, JSON.stringify(device));
  } catch {
    // 忽略持久化失败
  }
}

export async function clearUserSession(): Promise<void> {
  cachedUserToken = null;
  cachedUserDevice = null;
  try {
    await AsyncStorage.removeItem(USER_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_DEVICE_KEY);
  } catch {
    // 忽略持久化失败
  }
}

/**
 * 本地乐观配额自增：每轮消息服务端 usedToday+1，前端直接本地 +1 并广播，
 * 侧栏配额文字立即更新（零网络、不重发 device-login、不碰 token）。
 * 真值由启动登录 / 429 时的 device-login 校准。
 *
 * ⚠️ 不按 device.role 跳过：admin-login 会把设备在服务端升级为 admin 角色，
 * 切回 user 态后快照里的 role 仍是 admin —— 按它跳过会让配额永远不自增。
 * admin 态侧栏显示的是「无限制」，多加一次数字也不影响 UI。
 */
export async function bumpLocalUsage(): Promise<void> {
  let d = await getDevice();
  if (!d) d = await getSavedUserDevice(); // 缓存被清过时兜底
  if (!d) return;
  const used = (d.usedToday ?? 0) + 1;
  console.log(`[quota] 本地配额自增 → ${used}/${d.dailyQuota ?? '?'}`);
  const next: AuthDevice = {
    ...d,
    usedToday: used,
    totalCount: typeof d.totalCount === 'number' ? d.totalCount + 1 : d.totalCount,
  };
  await setDevice(next);
  // 同步写回 user 缓存：切 Admin 再切回来时 swap 用的是 user 缓存，
  // 不同步的话自增结果会被旧快照覆盖（数字倒退）
  const userToken = await getSavedUserToken();
  if (userToken) await saveUserSession(userToken, next);
}

// token 变化订阅：登录/续期/过期清理后通知订阅者（如会话初始化失败后自动重拉）
type TokenListener = (token: string | null) => void;
const tokenListeners = new Set<TokenListener>();
export function onTokenChange(listener: TokenListener): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}
function emitTokenChange(token: string | null) {
  tokenListeners.forEach((cb) => {
    try {
      cb(token);
    } catch {
      // 忽略订阅者异常
    }
  });
}
