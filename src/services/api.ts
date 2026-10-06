import axios from 'axios';
import { Platform } from 'react-native';

// 从环境变量读取后端地址，若未配置则使用默认值
const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export const httpClient = axios.create({
  baseURL,
  timeout: 30000, // 30 秒超时（AI 响应可能需要较长时间）
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器（可在此处统一注入 Authorization Token 等）
httpClient.interceptors.request.use(
  (config) => {
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
    console.error('API Error:', error.response?.data || error.message);
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
  totalChunks?: number;
  processedChunks?: number;
  progress?: number;
  url?: string;
  fileUrl?: string;
  path?: string;
}

// 定义具体的 API 调用方法
export const api = {
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
     const url = `${baseURL}/chat/knowledge/upload`;

     // ================= Web =================
     if (Platform.OS === 'web') {
       return (async () => {
         try {
           const blob = await (await fetch(file.uri)).blob();
           const formData = new FormData();
           formData.append('file', blob, file.name);
           const resp = await fetch(url, { method: 'POST', body: formData });
           if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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
     * 获取知识库文件列表
     */
    getKnowledgeFiles: async (): Promise<any[]> => {
      return httpClient.get('/chat/knowledge/files');
   },
};
