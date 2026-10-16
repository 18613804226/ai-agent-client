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

/**
 * multipart POST 通用实现（附件上传 / Excel 查错共用）。
 * - Web：fetch + FormData（Blob 带文件名；不手设 Content-Type）。
 * - Native：RN XMLHttpRequest + FormData 的 { uri, name, type } 文件对象，
 *   Content-Type 交给 RN 自动生成 multipart boundary（手动设会丢 boundary）。
 * token 先 await 再 setRequestHeader：避免「send 之后才拿到 token」的竞态。
 * 非 2xx 统一抛 Error(后端 message)：400 的中文原因（类型不支持/超 50MB/视频超 10 分钟…）
 * 必须透传到 UI，不能吞成笼统的「网络错误」。
 */
async function postMultipart(
  path: string,
  file: { name: string; uri?: string; blob?: any; mime?: string },
  fields?: Record<string, string>,
): Promise<any> {
  const url = `${baseURL}${path}`;
  const token = await getToken();

  // ================= Web =================
  if (Platform.OS === 'web') {
    const blob: Blob = file.blob ?? (await (await fetch(file.uri!)).blob());
    const fd = new FormData();
    fd.append('file', blob, file.name);
    Object.entries(fields ?? {}).forEach(([k, v]) => fd.append(k, v));
    const resp = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : undefined,
      body: fd,
    });
    if (!resp.ok) {
      if (resp.status === 401) notifyUnauthorized();
      let msg = '';
      try {
        msg = (await resp.json())?.message ?? '';
      } catch {}
      throw new Error(msg || `请求失败（HTTP ${resp.status}）`);
    }
    return await resp.json();
  }

  // ================= Native：RN XHR =================
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = 180000; // 50MB 上传 / Excel 检查都走这里，放宽到 3 分钟
    if (token) {
      try {
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      } catch {}
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('响应不是合法 JSON'));
        }
        return;
      }
      if (xhr.status === 401) notifyUnauthorized();
      let msg = '';
      try {
        msg = JSON.parse(xhr.responseText)?.message ?? '';
      } catch {}
      reject(new Error(msg || `请求失败（HTTP ${xhr.status}）`));
    };
    xhr.onerror = () => reject(new Error('网络错误，请检查网络后重试'));
    xhr.ontimeout = () => reject(new Error('上传超时，请稍后重试'));
    const fd = new FormData();
    fd.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mime || 'application/octet-stream',
    } as any);
    Object.entries(fields ?? {}).forEach(([k, v]) => fd.append(k, v));
    xhr.send(fd);
  });
}

/** 附件上传（方式 B）返回：id 30 分钟过期，随消息以 attachmentIds 引用 */
export interface ChatAttachmentUpload {
  id: string;
  name: string;
  kind: 'document' | 'video';
  charCount?: number;
  durationSec?: number;
  /** 直链 /chat/attachments/<uuid>.<ext> */
  url?: string;
  /**
   * DELETE /chat/attachments/:fileRef 用的「uuid.ext」——后端正则强校验，
   * 传裸 uuid 会 400「非法文件名」。上传响应未显式返回时由 url 解析兜底。
   */
  fileRef?: string;
}

/** Excel 查错：公式错误值 + 数据质量问题，每条自带中文原因与修复建议 */
export interface ExcelFinding {
  sheet: string;
  cell: string;
  row: number;
  column: number;
  columnName?: string;
  type: 'formulaError' | 'dataQuality';
  code: string;
  severity: 'error' | 'warning';
  value?: string;
  formula?: string;
  expected?: string;
  message: string;
  suggestion?: string;
}

export interface ExcelCheckResult {
  fileName: string;
  sheets: { name: string; rowCount: number; columnCount: number; checkedRows: number }[];
  summary: {
    total: number;
    formulaErrors: number;
    dataIssues: number;
    errors: number;
    warnings: number;
    truncated: boolean;
  };
  findings: ExcelFinding[];
}

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
    * 上传单张图片（严格版）：失败抛 Error(后端中文 message)，供「选中即传」链路使用。
    * 与 uploadImages 的区别：那个为兼容老调用会吞错、返回短数组（位置映射不可靠），
    * 这里必须让调用方感知失败——还原输入 + toast，不再静默丢图。
    */
   uploadImageStrict: async (image: string): Promise<string> => {
     if (!image.startsWith('data:')) return image; // 非 data: 视作已有 URL（与旧行为一致）
     try {
       const data: any = await httpClient.post('/chat/upload-image', {
         image,
       });
       if (!data?.url) throw new Error('上传响应缺少图片 URL');
       return data.url as string;
     } catch (err: any) {
       throw new Error(
         err?.response?.data?.message || err?.message || '图片上传失败',
       );
     }
   },

   /**
    * 方式 B：上传聊天附件（文档/视频）拿 id，随后随消息以 attachmentIds 引用。
    * 后端：POST /chat/attachment → { id, name, kind, charCount, durationSec? }。
    * 不入向量库、不污染知识库（知识库只由 /chat/knowledge/upload 写入）。
    */
   uploadChatAttachment: async (file: {
     name: string;
     uri?: string;
     blob?: any;
     mime?: string;
   }): Promise<ChatAttachmentUpload> => {
     const data = (await postMultipart(
       '/chat/attachment',
       file,
     )) as ChatAttachmentUpload;
     // DELETE 按 `uuid.ext` 强校验（裸 uuid → 400 非法文件名）；
     // 响应没显式给 fileRef 时从 url 尾段解析兜底
     if (!data.fileRef && data.url?.includes('/chat/attachments/')) {
       data.fileRef = data.url.split('/').pop();
     }
     return data;
   },

   /**
    * Excel 程序化查错：规则引擎（不走大模型、不占对话配额、不落盘）。
    * 后端：POST /chat/excel/check → { fileName, sheets, summary, findings }。
    * 非 2xx 抛 Error(后端 message)（文件过大 / 非 xlsx / 加密损坏 / rules 非法…）。
    */
   checkExcelFile: (
     file: { name: string; uri?: string; blob?: any; mime?: string },
     rules?: Record<string, unknown>,
   ): Promise<ExcelCheckResult> =>
     postMultipart(
       '/chat/excel/check',
       file,
       rules ? { rules: JSON.stringify(rules) } : undefined,
     ),

   /**
    * 删除已上传的聊天图片（DELETE /chat/uploads/:filename，需 token，204）。
    * 只允许删「未被消息引用」的文件：调用方（useImagePicker）负责用
    * inUse 标记挡掉已随消息发出的 URL。
    */
   deleteUploadedImage: async (filename: string): Promise<void> => {
     await httpClient.delete(`/chat/uploads/${encodeURIComponent(filename)}`);
   },

   /**
    * 删除预上传附件（DELETE /chat/attachments/:fileRef，204）。
    * ⚠️ fileRef = 「uuid.ext」（上传响应的 fileRef / url 尾段），不是裸 id——
    * 后端正则强校验，传裸 uuid 会 400「非法文件名」。
    * 仅限「发送前」清理：已被消息引用的附件后端回 409 拒删；
    * 没删的由服务端 30 天回收兜底。
    */
    deleteChatAttachment: async (fileRef: string): Promise<void> => {
      await httpClient.delete(
        `/chat/attachments/${encodeURIComponent(fileRef)}`,
      );
    },

    /**
     * GET /chat/attachments/<fileRef>/html — 后端把 Office 文档转成纯文本 HTML。
     * - 200：返回 HTML 文本（几乎没有标签/图片，就是可读的纯文本）
     * - 415：格式不支持在线预览 → 调用方回退到「用其他应用打开」面板
     * 用裸 axios 直连：绕过 httpClient 拦截器（415 不应触发全局日志 / 401 自愈）
     */
    getAttachmentHtml: async (
      fileRef: string,
    ): Promise<{ html: string | null; notSupported: boolean }> => {
      try {
        const token = await getToken();
        const resp = await axios.get<string>(
          `${baseURL}/chat/attachments/${encodeURIComponent(fileRef)}/html`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            responseType: 'text',
            timeout: 30000,
          },
        );
        return { html: (resp.data as string) ?? '', notSupported: false };
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 415) return { html: null, notSupported: true };
        throw e;
      }
    },

    /**
     * 下载聊天附件到本地缓存（原生端），带 token。返回本地 file:// uri。
     * 历史消息附件在原生端只有服务端引用（无本地 blob/uri），PDF/图片等需要
     * 落到本地文件才能用原生渲染器（react-native-pdf / Image）打开。
     * 用 expo-file-system/legacy：支持下载时带 headers，且 web 端可安全解析。
     */
    downloadAttachment: async (
      fileRef: string,
      name?: string,
    ): Promise<string> => {
      const token = await getToken();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FS: any = require('expo-file-system/legacy');
      const ext =
        (name?.split('.').pop() || 'bin').split('?')[0].slice(0, 8) || 'bin';
      const dest = `${FS.cacheDirectory}preview-${Date.now()}.${ext}`;
      const url = `${baseURL}/chat/attachments/${encodeURIComponent(fileRef)}`;
      const res = await FS.downloadAsync(
        url,
        dest,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return res.uri;
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
