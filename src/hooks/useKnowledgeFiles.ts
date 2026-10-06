// hooks/useKnowledgeFiles.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { api, type KnowledgeStatus } from '../services/api';
import { fixMojibake } from '../utils/text';

export type { KnowledgeStatus };

export interface UploadedFile {
  id: string;
  name: string;
  uri?: string;
  size?: number;
  /** 处理状态：uploaded | processing | indexed | failed */
  status?: KnowledgeStatus;
  /** 处理进度 0-100（向量化进度） */
  progress?: number;
  /** 是否正在处理（processing 的别名，供 UI 兼容） */
  uploading?: boolean;
  /** 是否失败 */
  error?: boolean;
  /** 刚刚处理完：短暂显示结果图标（成功 ✓），随后自动隐藏 */
  showResult?: boolean;
}

let tempSeq = 0;
const makeTempId = () =>
  `upload_${Date.now()}_${tempSeq++}_${Math.random().toString(36).slice(2, 6)}`;

const POLL_INTERVAL = 1000;
/** 完成后结果图标停留时长 */
const RESULT_HOLD_MS = 1500;

export function useKnowledgeFiles() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const pollTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>(
    {},
  );
  const resultTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  const stopPolling = useCallback((id: string) => {
    const timer = pollTimersRef.current[id];
    if (timer) {
      clearInterval(timer);
      delete pollTimersRef.current[id];
    }
  }, []);

  const stopResultTimer = useCallback((id: string) => {
    const timer = resultTimersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete resultTimersRef.current[id];
    }
  }, []);

  // 完成提示：先把 showResult=true 亮一下图标，1.5s 后自动隐藏（连同进度条）
  const showResultThenHide = useCallback(
    (id: string) => {
      stopResultTimer(id);
      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, showResult: true } : f)),
      );
      resultTimersRef.current[id] = setTimeout(() => {
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, showResult: false } : f)),
        );
        delete resultTimersRef.current[id];
      }, RESULT_HOLD_MS);
    },
    [stopResultTimer],
  );

  // 轮询处理进度，直到 indexed / uploaded / failed
  const startPolling = useCallback(
    (id: string, fallbackName: string, size?: number) => {
      stopPolling(id);

      const poll = async () => {
        const p = await api.getKnowledgeFileProgress(id);
        // 单次失败就跳过，下次 interval 再试
        if (!p) return;

        const status: KnowledgeStatus = p.status ?? 'processing';
        const isTerminal =
          status === 'indexed' ||
          status === 'uploaded' ||
          status === 'failed';
        const isSuccess = status === 'indexed' || status === 'uploaded';
        const total = p.totalChunks ?? 0;
        const done = p.processedChunks ?? 0;
        const rawPercent =
          typeof p.progress === 'number'
            ? p.progress
            : total > 0
              ? Math.round((done / total) * 100)
              : 0;
        const percent = isSuccess ? 100 : rawPercent;
        const name = fixMojibake(p.fileName ?? p.name ?? fallbackName);

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  name,
                  size,
                  status,
                  progress: percent,
                  uploading: status === 'processing',
                  error: status === 'failed',
                  uri: p.url ?? p.fileUrl ?? p.path ?? f.uri,
                }
              : f,
          ),
        );

        if (isTerminal) {
          stopPolling(id);
          // 成功才亮结果图标（失败保留“处理失败”文案）
          if (isSuccess) showResultThenHide(id);
        }
      };

      poll();
      pollTimersRef.current[id] = setInterval(poll, POLL_INTERVAL);
    },
    [stopPolling, showResultThenHide],
  );

  // 1. 选择文件 → 上传（立即返回）→ 后台轮询处理进度
  const handleUploadFile = useCallback(
    async (onPicked?: () => void) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
        });

        // 系统选择器返回后回调（用于恢复抽屉）。
        // 注意：PC 网页端把它当 onPress 处理器接线，首参是点击事件而非函数，必须判类型。
        if (typeof onPicked === 'function') onPicked();

        if (
          result.canceled ||
          !result.assets ||
          result.assets.length === 0
        ) {
          return;
        }

        for (const file of result.assets) {
          const tempId = makeTempId();

          // 立即插入占位项：处理中
          setUploadedFiles((prev) => [
            ...prev,
            {
              id: tempId,
              name: fixMojibake(file.name) || file.name,
              size: file.size,
              status: 'processing',
              uploading: true,
              progress: 0,
            },
          ]);

          const uploaded = await api.uploadKnowledgeFile({
            name: file.name,
            uri: file.uri,
            size: file.size,
            mimeType: (file as any).mimeType,
          });

          if (uploaded) {
            const id = uploaded.id ?? tempId;
            const name = fixMojibake(
              uploaded.fileName ?? uploaded.name ?? file.name,
            );
            const status: KnowledgeStatus = uploaded.status ?? 'processing';
            const isSuccess = status === 'indexed' || status === 'uploaded';
            const total = uploaded.totalChunks ?? 0;
            const done = uploaded.processedChunks ?? 0;
            const rawPercent =
              typeof uploaded.progress === 'number'
                ? uploaded.progress
                : total > 0
                  ? Math.round((done / total) * 100)
                  : 0;
            const percent = isSuccess ? 100 : rawPercent;

            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === tempId
                  ? {
                      id,
                      name,
                      size: file.size,
                      status,
                      progress: percent,
                      uploading: status === 'processing',
                      error: status === 'failed',
                      uri:
                        uploaded.url ?? uploaded.fileUrl ?? uploaded.path,
                    }
                  : f,
              ),
            );

            if (status === 'processing') {
              // 继续轮询
              startPolling(id, name, file.size);
            } else if (isSuccess) {
              // 小文件可能秒完成
              showResultThenHide(id);
            }
          } else {
            // 上传（网络）失败
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === tempId
                  ? { ...f, status: 'failed', uploading: false, error: true }
                  : f,
              ),
            );
          }
        }
      } catch (err) {
        console.error('选择文件出错:', err);
      }
    },
    [startPolling, showResultThenHide],
  );

  // 2. 删除文件（后端删除成功后再停轮询 + 本地移除）
  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      try {
        await api.deleteKnowledgeFile(fileId);
        // 只有后端确认删除成功，才停轮询并从本地移除；失败则保留，避免前后端不一致
        stopPolling(fileId);
        stopResultTimer(fileId);
        setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
      } catch (err) {
        console.error('删除知识库文件失败:', err);
      }
    },
    [stopPolling, stopResultTimer],
  );

  // 3. 初始化时从后端获取文件列表（processing 的继续轮询）
  const loadKnowledgeFiles = useCallback(async () => {
    try {
      const res: any = await api.getKnowledgeFiles();
      const list: any[] = Array.isArray(res)
        ? res
        : res?.files ?? res?.data ?? [];
      if (list.length === 0) return;

      const mapped: UploadedFile[] = list.map((f) => {
        const status: KnowledgeStatus = f.status ?? 'indexed';
        const total = f.totalChunks ?? 0;
        const done = f.processedChunks ?? 0;
        const percent =
          typeof f.progress === 'number'
            ? f.progress
            : total > 0
              ? Math.round((done / total) * 100)
              : 0;
        const name = fixMojibake(f.name ?? f.fileName ?? f.filename) || '';
        return {
          id: f.id ?? f.fileId ?? f.file_id,
          name,
          uri: f.url ?? f.fileUrl ?? f.path,
          size: f.size,
          status,
          progress: percent,
          uploading: status === 'processing',
          error: status === 'failed',
        };
      });

      setUploadedFiles((prev) => {
        const serverIds = new Set(mapped.map((f) => f.id));
        // 保留本地正在上传、但服务端列表尚未返回的占位项，避免整体替换把它们冲掉
        const localPending = prev.filter(
          (f) => f.uploading && !serverIds.has(f.id),
        );
        return [...localPending, ...mapped];
      });

      // 未处理完的继续轮询
      mapped.forEach((f) => {
        if (f.status === 'processing') startPolling(f.id, f.name, f.size);
      });
    } catch (err) {
      console.error('获取知识库文件列表失败:', err);
    }
  }, [startPolling]);

  // 卸载时清理所有定时器
  useEffect(() => {
    const pollTimers = pollTimersRef.current;
    const resultTimers = resultTimersRef.current;
    return () => {
      Object.values(pollTimers).forEach((t) => clearInterval(t));
      Object.values(resultTimers).forEach((t) => clearTimeout(t));
      pollTimersRef.current = {};
      resultTimersRef.current = {};
    };
  }, []);

  return {
    uploadedFiles,
    handleUploadFile,
    handleDeleteFile,
    loadKnowledgeFiles,
  };
}
