import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../services/api';
import { diag } from '../devDiag';
import { getDeviceInfo } from '../utils/deviceInfo';
import {
  clearAuth,
  clearAdminSession,
  clearUserSession,
  getAdminDevice,
  getAdminToken,
  getDevice,
  getDeviceId,
  getSavedUserDevice,
  getSavedUserToken,
  getToken,
  onDeviceChange,
  onUnauthorized,
  saveAdminSession,
  saveUserSession,
  setDevice,
  setToken,
  type AuthDevice,
} from '../services/authStore';
import {
  AuthContext,
  useAdminPreview,
  useRole,
} from './appContexts';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [device, setDeviceState] = useState<AuthDevice | null>(null);
  const loggingInRef = useRef(false);
  /**
   * 会话世代号：每次发起登录/切换 +1。
   * 迟到的响应（比如切 User 后在飞的 device-login，切 Admin 后才回来）
   * 若世代号已过期就整单丢弃 —— 否则它的 setToken 会把刚切上的 token 顶掉，
   * 表现就是「切过去闪一下又弹回来」。
   */
  const sessionEpochRef = useRef(0);
  // Provider 嵌在 RoleContext / AdminPreviewContext 之内，直接在这里同步角色 UI 状态，
  // 各页面只需调 loginAsAdmin / activateAdmin / logoutToDevice，不用各写一遍 setRole。
  const { setRole } = useRole();
  const { setAdminPreview } = useAdminPreview();

  const loginAsDevice = useCallback(async () => {
    if (loggingInRef.current) return;
    loggingInRef.current = true;
    const epoch = ++sessionEpochRef.current;
    try {
      const deviceId = await getDeviceId();
      const info = getDeviceInfo();
      const data = await api.deviceLogin(deviceId, info);
      // 世代号已过期 = 期间发生了更新的切换动作，这次响应整单丢弃（防顶号）
      if (epoch !== sessionEpochRef.current) return;
      if (data.token) {
        await setToken(data.token);
        await saveUserSession(data.token, data.device ?? null);
      }
      if (data.device) {
        await setDevice(data.device);
        setDeviceState(data.device);
      }
      setAuthed(!!data.token);
    } catch (e) {
      console.error('device-login failed:', e);
      if (epoch === sessionEpochRef.current) setAuthed(false);
    } finally {
      loggingInRef.current = false;
    }
  }, []);

  const loginAsAdmin = useCallback(async (password: string) => {
    const epoch = ++sessionEpochRef.current;
    const deviceId = await getDeviceId();
    const info = getDeviceInfo();
    const data = await api.adminLogin(password, deviceId, info);
    if (epoch !== sessionEpochRef.current) return; // 迟到响应丢弃
    if (data.token) {
      await setToken(data.token);
      // 缓存 admin 会话：切回普通用户后，下次切 Admin 免密秒切
      await saveAdminSession(data.token, data.device ?? null);
    }
    if (data.device) {
      await setDevice(data.device);
      setDeviceState(data.device);
    }
    setAuthed(!!data.token);
    diag.lastSet = 'loginAsAdmin';
    setRole('admin');
    setAdminPreview(true);
  }, [setAdminPreview, setRole]);

  /**
   * 免密激活 admin：有缓存的 admin token 就直接切成 admin 身份（不跳登录页）。
   * 返回 true = 已切到 admin；false = 没有可用缓存（首次 / 已过期），调用方去要密码。
   * 切换前先拿缓存 token 对 /admin/stats 探活：token 已死就清缓存去要密码，
   * 绝不带着死 token 切 UI（那样必然 401 被自愈弹回 —— 「闪一下又弹回来」）。
   */
  const activateAdmin = useCallback(async () => {
    const epoch = ++sessionEpochRef.current;
    const adminToken = await getAdminToken();
    if (!adminToken) return false;
    const alive = await api.verifyAdminToken(adminToken);
    if (epoch !== sessionEpochRef.current) return false; // 等待期间又被切换接管
    if (!alive) {
      // 缓存的 admin token 已失效：丢弃，走密码页重新登录
      await clearAdminSession();
      return false;
    }
    const adminDevice = await getAdminDevice();
    await setToken(adminToken);
    if (adminDevice) {
      await setDevice(adminDevice);
      setDeviceState(adminDevice);
    }
    setAuthed(true);
    diag.lastSet = 'activateAdmin';
    setRole('admin');
    setAdminPreview(true);
    return true;
  }, [setAdminPreview, setRole]);

  const logoutToDevice = useCallback(async () => {
    const epoch = ++sessionEpochRef.current;
    // 优先本地秒切回缓存的 user 会话：不发 device-login，
    // 1) 不会有在飞请求迟到顶掉刚切上的 token；2) 不在服务端重发 token 顶掉 admin 会话
    const [userToken, userDevice] = await Promise.all([
      getSavedUserToken(),
      getSavedUserDevice(),
    ]);
    if (epoch !== sessionEpochRef.current) return;
    if (userToken) {
      await setToken(userToken);
      if (userDevice) {
        await setDevice(userDevice);
        setDeviceState(userDevice);
      } else {
        // user 缓存没有设备快照：清掉，避免残留 admin 快照显示错误配额
        await setDevice(null);
        setDeviceState(null);
      }
      setAuthed(true);
      diag.lastSet = 'logoutToDevice(cached)';
      setRole('user');
      setAdminPreview(false);
      return;
    }
    // 没有 user 缓存（首次 / 自愈清理过）：走完整降级流程重新 device-login
    await clearAuth();
    setDeviceState(null);
    setAuthed(false);
    diag.lastSet = 'logoutToDevice(fallback)';
    setRole('user');
    setAdminPreview(false);
    await loginAsDevice();
  }, [loginAsDevice, setAdminPreview, setRole]);

  const refreshQuota = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const d = await getDevice();
      if (!d?.deviceId) return;
      // admin 态无配额限制，且 device-login 会换回 user token，不能续期顶掉 admin token
      if (d.role === 'admin') return;
      const epoch = ++sessionEpochRef.current;
      const data = await api.deviceLogin(d.deviceId, getDeviceInfo());
      if (epoch !== sessionEpochRef.current) return; // 等待期间发生了切换，丢弃
      // device-login 签发新 token：落地并同步 user 缓存，避免旧 token 被服务端顶作废
      if (data.token) {
        await setToken(data.token);
        await saveUserSession(data.token, data.device ?? null);
      }
      if (data.device) {
        await setDevice(data.device);
        setDeviceState(data.device);
      }
    } catch {
      // 静默失败：不打断聊天
    }
  }, []);

  // 启动：有 token 先用存量、无 token 做 device-login；401 全局清 token
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [token, savedDevice, adminToken] = await Promise.all([
          getToken(),
          getDevice(),
          getAdminToken(),
        ]);
        if (mounted && savedDevice) setDeviceState(savedDevice);
        if (token) {
          if (mounted) {
            setAuthed(true);
            setReady(true);
            // 上次退出时正处于 admin 身份（当前 token 就是缓存的 admin token）
            if (adminToken && token === adminToken) {
              diag.lastSet = 'startup';
              setRole('admin');
              setAdminPreview(true);
            }
          }
          // 后台刷新一次配额快照
          refreshQuota();
        } else {
          await loginAsDevice();
          if (mounted) setReady(true);
        }
      } catch {
        if (mounted) {
          setAuthed(false);
          setReady(true);
        }
      }
    })();
    onUnauthorized(() => {
      // 登录过期：先记下失效的是哪个 token，只清对应缓存 ——
      // 不能无差别清 admin 缓存（比如切回 user 时是 user token 401，
      // admin token 明明还活着，清了就又要每次输密码）。
      (async () => {
        const failedToken = await getToken();
        const [adminToken, userToken] = await Promise.all([
          getAdminToken(),
          getSavedUserToken(),
        ]);
        await clearAuth();
        if (failedToken && adminToken && failedToken === adminToken) {
          await clearAdminSession();
        }
        if (failedToken && userToken && failedToken === userToken) {
          await clearUserSession();
        }
        if (!mounted) return;
        setAuthed(false);
        setDeviceState(null);
        setReady(true);
        // UI 复位到 user：admin token 失效时避免分段器卡在 Admin；
        // user token 失效时本来就是 user，重复设置无副作用
        diag.lastSet = '401-selfheal';
        setRole('user');
        setAdminPreview(false);
        await loginAsDevice();
      })();
    });
    return () => {
      mounted = false;
      onUnauthorized(null);
    };
  }, [loginAsDevice, refreshQuota, setAdminPreview, setRole]);

  // device 缓存 → React 状态同步：任何一层更新快照（登录 / 429 校准 / 本地配额自增），
  // 侧栏「x/y」配额文字都会即时刷新（之前 refreshDeviceSnapshot 只写缓存不通知 UI）
  useEffect(() => {
    return onDeviceChange((d) => {
      setDeviceState(d);
    });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      authed,
      device,
      loginAsDevice,
      loginAsAdmin,
      activateAdmin,
      logoutToDevice,
      refreshQuota,
    }),
    [ready, authed, device, loginAsDevice, loginAsAdmin, activateAdmin, logoutToDevice, refreshQuota],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState() {
  return useContext(AuthContext);
}
