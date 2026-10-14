import axios from 'axios';
import { Platform } from 'react-native';
import { getToken, notifyUnauthorized, setDevice } from './authStore';
import type { DeviceMeta } from '../utils/deviceInfo';

// 从环境变量读取后端地址，若未配置则使用默认值
export const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export const httpClient = axios.create({
  baseURL,
  timeout: 30000, // 30 秒超时（AI 响应可能需要较长时间）
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：统一注入 Authorization Token
httpClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await getToken();
      if (token) {
        config.headers = config.headers ?? ({} as any);
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
    } catch {
      // 拿不到 token 就直接发，后端会回 401
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// 响应拦截器（统一处理错误或剥离一层 data）
httpClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;
    // 401 是预期的登录过期信号（会自动续期+重试），不刷 console.error 吓人
    if (status !== 401) console.error('API Error:', data || error.message);
    // 401 = 未登录/过期：通知全局订阅者清 token 跳登录
    if (status === 401) notifyUnauthorized();
    return Promise.reject(error);
  },
);

// 知识库文件状态：uploaded(仅存档) | processing(向量化中) | indexed(已入库) | failed(失败)
export type KnowledgeStatus = 'uploaded' | 'processing' | 'indexed' | 'failed';

export interface KnowledgeFileResult {
  id: string;
  fileName?: string;
  name?: string;
  status?: KnowledgeStatus;
  enabled?: boolean;
  totalChunks?: number;
  processedChunks?: number;
  progress?: number;
  url?: string;
  fileUrl?: string;
  path?: string;
}

export interface DeviceInfo {
  id: string;
  deviceId: string;
  role: 'user' | 'admin';
  dailyQuota: number;
  usedToday: number;
  totalCount: number;
  totalTokens: string;
  usedTokensToday?: string;
  createdAt: string;
  lastSeenAt: string;
  platform?: string;
  model?: string;
  osVersion?: string;
}

export interface AdminStats {
  deviceCount: number;
  adminCount: number;
  todayActiveDevices: number;
  totalRequests: number;
  totalTokens: string;
  topDevicesToday: {
    deviceId: string;
    role: string;
    usedToday: number;
    totalCount: number;
    totalTokens: string;
  }[];
}

// 定义具体的 API 调用方法
export const api = {
  // ===== Auth（公开）=====
  deviceLogin: async (deviceId: string, info?: DeviceMeta) => {
    // 只发请求不落地：token 由 AuthProvider 统一应用（带世代号，防迟到响应顶号）
    const data: any = await httpClient.post('/auth/device-login', { deviceId, ...(info ?? {}) });
    return data as { token: string; device: DeviceInfo };
  },
  adminLogin: async (password: string, deviceId?: string, info?: DeviceMeta) => {
    // 只发请求不落地：token 由 AuthProvider 统一应用（带世代号，防迟到响应顶号）
    const data: any = await httpClient.post('/auth/admin-login', {
      ...(deviceId ? { deviceId } : {}),
      password,
      ...(info ?? {}),
    });
    return data as { token: string; device: DeviceInfo };
  },
  /**
   * 查询当前设备配额真值（只读、无副作用，不签发 token）。
   * 依赖后端新增：GET /auth/me（带任意有效 token）→ { device: {...} }
   * 接口未上线时静默失败（404），侧栏继续显示本地自增值。
   */
  getMyDevice: async (): Promise<DeviceInfo | null> => {
    try {
      const data: any = await httpClient.get('/auth/me');
      return (data?.device ?? data) as DeviceInfo;
    } catch {
      return null;
    }
  },
  /**
   * 探测缓存的 admin token 是否仍有效。
   * 用裸 axios 直连：不走 httpClient 拦截器（不注入当前 active token、不触发全局 401 自愈），
   * 避免拿「别人的 token」去探测时把正常会话打下线。
   */
  verifyAdminToken: async (adminToken: string): Promise<boolean> => {
    try {
      await axios.get(`${baseURL}/admin/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: 8000,
      });
      return true;
    } catch (e: any) {
      // 只有 401/403 才算 token 死了；网络错误 / 5xx 不算（授权层已通过或根本没到），
      // 否则网络抖一下就被迫重新输密码
      const status = e?.response?.status;
      return status !== 401 && status !== 403;
    }
  },
  // ===== Admin（需 admin token）=====
  getAdminDevices: async (page = 1, pageSize = 20) => {
    return httpClient.get('/admin/devices', { params: { page, pageSize } }) as Promise<{
      total: number;
      page: number;
      pageSize: number;
      list: DeviceInfo[];
    }>;
  },
  getAdminStats: async () => {
    return httpClient.get('/admin/stats') as Promise<AdminStats>;
  },
  /**
   * 修改单个设备每日限额（需 admin token）。
   * PUT /admin/devices/:id/quota  body: { dailyQuota }
   */
  updateDeviceQuota: async (id: string, dailyQuota: number) => {
    return httpClient.put(`/admin/devices/${encodeURIComponent(id)}/quota`, {
      dailyQuota,
    });
  },
  // 1. 创建聊天会话
  createSession: async (title = '新对话') => {
    return httpClient.post('/chat/session', { title });
  },
  // 2. 更新会话标题
  updateSessionTitle: async (id: string, title: string) => {
    return httpClient.put(`/chat/sessions/${id}`, { title }); // 请根据后端的实际路由前缀调整 /chat/ 前缀
  },
  // 2. 获取会话列表
  getSessions: async () => {
    return httpClient.get('/chat/sessions');
  },
  getSessionDetail: async (id: string) => {
    return httpClient.get(`/chat/sessions/${id}`);
  },
  deleteSession: async (id: string) => {
    return httpClient.delete(`/chat/sessions/${id}`);
  },
  // 3. 发送消息（触发 RAG 问答）
  sendMessage: async (sessionId: string, content: string) => {
    return httpClient.post(`/chat/${sessionId}/message`, { content });
  },
  // ✅ 新增：通义 TTS
  textToSpeech: async (text: string, voice = 'Nini') => {
    return httpClient.post('/chat/tts', { text, voice }) as Promise<{
      url: string;
    }>;
  },

   async speechToText(form: FormData): Promise<string> {
    const data = (await httpClient.post('/chat/asr', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
      transformRequest: [(d) => d],
    })) as unknown as { text: string }; // ✅ 加 unknown 中转一下
    return data.text;
  },

   /**
    * 上传图片到后端，返回图片 URL 数组。
    * 支持 base64 data URL 或 File/Blob。
    */
   uploadImages: async (images: string[]): Promise<string[]> => {
     const urls: string[] = [];
     for (const img of images) {
       try {
         if (img.startsWith('data:')) {
           const data: any = await httpClient.post('/chat/upload-image', {
             image: img,
           });
           if (data?.url) urls.push(data.url);
         } else {
           urls.push(img);
         }
       } catch (err) {
         console.error('上传图片失败:', err);
       }
     }
     return urls;
   },

   /**
    * 上传知识库文件（异步、不阻塞）。
    * 后端落盘建记录后立即返回 { id, fileName, status, totalChunks, processedChunks: 0 }，
    * 向量化在后台跑，进度用 getKnowledgeFileProgress 轮询。
    *
    * - Web：浏览器原生 Blob + fetch。
    * - Native：用 RN 自带的 XMLHttpRequest + FormData 的 `{ uri, name, type }`
    *   文件对象。关键点：
    *   1) Expo 不会替换全局 XMLHttpRequest，所以它读文件走 RN 原生网络层，
    *      绕开 expo-file-system 的 FilePermissionService（在 Expo Go 里它会以
    *      “isn't readable / Missing 'READ' permission” 拒绝 DocumentPicker 的缓存文件）。
    *   2) 不能设置 Content-Type（RN 会自动带 multipart boundary）。
    *   3) 不做上传字节进度（进度由后端轮询给出），避免个别机型 upload progress 的坑。
    *   Expo 的全局 fetch 不支持 `{uri,...}`（会抛 Unsupported FormDataPart），故不用 fetch。
    */
   uploadKnowledgeFile: (
     file: {
       name: string;
       uri: string;
       size?: number;
       mimeType?: string;
     },
   ): Promise<KnowledgeFileResult | null> => {
     // 知识库接口：/chat/knowledge/*（任意登录用户可用，全局共享）
     const url = `${baseURL}/chat/knowledge/upload`;

     // ================= Web =================
     if (Platform.OS === 'web') {
       return (async () => {
         try {
           const blob = await (await fetch(file.uri)).blob();
           const formData = new FormData();
           formData.append('file', blob, file.name);
           const token = await getToken();
            const resp = await fetch(url, { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: formData });
           if (!resp.ok) { if (resp.status === 401) notifyUnauthorized(); throw new Error('HTTP ' + resp.status); }
           return await resp.json();
         } catch (err) {
           console.error('上传知识库文件失败:', err);
           return null;
         }
       })();
     }

     // ================= Native：RN XHR =================
     return new Promise((resolve) => {
       const xhr = new XMLHttpRequest();
       xhr.open('POST', url);
       xhr.timeout = 60000;
        getToken().then((xhrToken) => {
          if (xhrToken) { try { xhr.setRequestHeader('Authorization', 'Bearer ' + xhrToken); } catch (e) {} }
        }).catch(() => {});

       xhr.onload = () => {
         if (xhr.status >= 200 && xhr.status < 300) {
           try {
             resolve(JSON.parse(xhr.responseText) as KnowledgeFileResult);
           } catch {
             console.error('上传知识库文件失败: 响应不是合法 JSON');
             resolve(null);
           }
         } else {
           console.error(`上传知识库文件失败: HTTP ${xhr.status}`);
           resolve(null);
         }
       };
       xhr.onerror = () => {
         console.error('上传知识库文件失败: Network Error');
         resolve(null);
       };
       xhr.ontimeout = () => {
         console.error('上传知识库文件失败: Timeout');
         resolve(null);
       };
       xhr.onabort = () => resolve(null);

       const formData = new FormData();
       formData.append('file', {
         uri: file.uri,
         name: file.name,
         type: file.mimeType || 'application/octet-stream',
       } as any);
       xhr.send(formData);
     });
   },

   /**
    * 查询知识库文件处理进度（轮询）。
    * 返回 { id, fileName, status, totalChunks, processedChunks, progress }
    */
   getKnowledgeFileProgress: async (
     id: string,
   ): Promise<KnowledgeFileResult | null> => {
     try {
       const data: any = await httpClient.get(
         `/chat/knowledge/files/${id}/progress`,
          { params: { id } } as any,
       );
       return data;
     } catch (err) {
       console.error('获取知识库进度失败:', err);
       return null;
     }
   },

    /**
     * 删除知识库文件
     */
    deleteKnowledgeFile: async (fileId: string): Promise<void> => {
      await httpClient.delete(`/chat/knowledge/files/${fileId}`);
    },

    /**
     * 启用或停用知识库文档；服务端负责持久化并在检索时应用状态。
     */
    setKnowledgeFileEnabled: async (
      fileId: string,
      enabled: boolean,
    ): Promise<void> => {
      if (typeof enabled !== 'boolean') {
        throw new TypeError('Knowledge file enabled state must be a boolean');
      }
    await httpClient.put(
      `/chat/knowledge/files/${encodeURIComponent(fileId)}/enabled`,
      { enabled },
    );
    },

    /**
     * 获取知识库文件列表
     */
    getKnowledgeFiles: async (): Promise<any[]> => {
      return httpClient.get('/chat/knowledge/files');
    },
};

/**
 * 拉取配额真值并广播到 UI（GET /auth/me，无副作用）。
 * 发完一条消息后调用：本地乐观自增先让数字动起来，这里随后用真值校准。
 * 接口未上线时静默返回 false。
 */
export async function refreshMyDevice(): Promise<boolean> {
  try {
    const { setDevice } = await import('./authStore');
    const d = await api.getMyDevice();
    if (!d) return false;
    await setDevice(d);
    return true;
  } catch {
    return false;
  }
}

export async function refreshDeviceSnapshot(): Promise<void> {
  try {
    const { getDevice, setDevice, setToken, saveUserSession } = await import('./authStore');
    const device = await getDevice();
    if (!device || !device.deviceId) return;
    const data = await httpClient.post('/auth/device-login', { deviceId: device.deviceId }) as any;
    // device-login 会签发新 token：必须立即落地并同步 user 缓存，
    // 否则旧 token 可能在服务端被顶作废，后续请求 401
    if (data && data.token) {
      await setToken(data.token);
      await saveUserSession(data.token, data.device ?? null);
    }
    if (data && data.device) await setDevice(data.device);
  } catch (e) {}
}
