import axios from "axios";

// 从环境变量读取后端地址，若未配置则使用默认值
const baseURL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export const httpClient = axios.create({
  baseURL,
  timeout: 30000, // 30 秒超时（AI 响应可能需要较长时间）
  headers: {
    "Content-Type": "application/json",
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
    console.error("API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  },
);

// 定义具体的 API 调用方法
export const api = {
  // 1. 创建聊天会话
  createSession: async (title = "新对话") => {
    return httpClient.post("/chat/session", { title });
  },
  // 2. 更新会话标题
  updateSessionTitle: async (id: string, title: string) => {
    return httpClient.put(`/chat/sessions/${id}`, { title }); // 请根据后端的实际路由前缀调整 /chat/ 前缀
  },
  // 2. 获取会话列表
  getSessions: async () => {
    return httpClient.get("/chat/sessions");
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
  textToSpeech: async (text: string, voice = "longwanjun_v3") => {
    return httpClient.post("/chat/tts", { text, voice }) as Promise<{
      url: string;
    }>;
  },

  async speechToText(form: FormData): Promise<string> {
    const data = (await httpClient.post("/chat/asr", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
      transformRequest: [(d) => d],
    })) as unknown as { text: string }; // ✅ 加 unknown 中转一下
    return data.text;
  },
};
