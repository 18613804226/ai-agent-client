import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

// 朗读文本
export const speakMessage = (text: string) => {
  if (Platform.OS === 'web' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // 停止上一次
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  } else {
    // 防止重复朗读卡顿，先停止当前所有语音
    Speech.stop();
    Speech.speak(text, {
      language: 'zh-CN', // 中文朗读
      pitch: 1.0, // 语调
      rate: 1.0, // 语速
      onDone: () => console.log('朗读结束'),
      onError: (err) => console.error('朗读失败', err),
    });
  }
};

// 停止朗读
export const stopSpeech = () => {
  Speech.stop();
};
