import { useState } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export function useImagePicker() {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isSheetVisible, setIsSheetVisible] = useState(false);

  const processPickedAssets = async (
    assets: ImagePicker.ImagePickerAsset[],
  ) => {
    if (!assets || assets.length === 0) return;
    const newUris = assets.map((asset) => {
      return asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
    });
    setSelectedImages((prev) => [...prev, ...newUris]);
  };

  const handlePickImage = () => {
    setIsSheetVisible(true);
  };

  // 1. 上传文件 / 文档 (电脑端打开文件管理器，手机端打开DocumentPicker)
  const handlePickDocument = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.txt,image/*';
      input.multiple = true;
      input.onchange = (e: any) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          Array.from(files).forEach((file: any) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64String = event.target?.result as string;
              if (base64String)
                setSelectedImages((prev) => [...prev, base64String]);
            };
            reader.readAsDataURL(file);
          });
        }
      };
      input.click();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'image/*',
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets) {
        const fileUris = result.assets.map((file) => file.uri);
        setSelectedImages((prev) => [...prev, ...fileUris]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 💡 2. 拍照 (核心修改点)
  const openCamera = async () => {
    // 🌐 H5/Web 端：调起摄像头拍照
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // 关键属性：直接调后置摄像头
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64String = event.target?.result as string;
            if (base64String)
              setSelectedImages((prev) => [...prev, base64String]);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
      return;
    }

    // 📱 移动 App 端：调用原生相机 API
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('权限不足', '需要相机权限才能拍照，请在设置中开启', [
        { text: '去开启', onPress: () => Linking.openSettings() },
        { text: '取消' },
      ]);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false, // 设为 true 可进行裁剪
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets) {
      processPickedAssets(result.assets);
    }
  };

  // 3. 相册选择 (保持不变)
  const openImageLibrary = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = (e: any) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          Array.from(files).forEach((file: any) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64String = event.target?.result as string;
              if (base64String)
                setSelectedImages((prev) => [...prev, base64String]);
            };
            reader.readAsDataURL(file);
          });
        }
      };
      input.click();
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: true,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets) {
      processPickedAssets(result.assets);
    }
  };

  const clearImages = () => setSelectedImages([]);

  return {
    selectedImages,
    setSelectedImages,
    handlePickImage,
    clearImages,
    handlePickDocument,
    openCamera, // 👈 导出拍照方法
    openImageLibrary, // 👈 导出选相册方法
    isSheetVisible,
    setIsSheetVisible,
  };
}
