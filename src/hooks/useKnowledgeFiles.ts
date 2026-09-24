// hooks/useKnowledgeFiles.ts
import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

export function useKnowledgeFiles() {
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  // 1. 选择文件并处理
  const handleUploadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];

        const newFile = {
          id: Date.now().toString(),
          name: file.name,
          uri: file.uri,
          size: file.size,
        };

        // 更新状态
        setUploadedFiles((prev) => [...prev, newFile]);

        // 💡 如果需要在这里直接调用后端上传接口，也可以写在这！
        // await uploadToBackend(file);
      }
    } catch (err) {
      console.error('选择文件出错:', err);
    }
  };

  // 2. 删除文件
  const handleDeleteFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
    // 💡 如果需要同步调用后端删除接口，也可以写在这！
  };

  return {
    uploadedFiles,
    handleUploadFile,
    handleDeleteFile,
  };
}
