import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { api } from '../services/api';

/**
 * 跨端「按住说话」录音 + ASR 识别 Hook
 *
 * - Web：MediaRecorder 录制 webm
 * - Native：expo-audio 录制 m4a
 * - 松开后统一上传到 /chat/asr 并回传识别文本
 */
export function useVoiceRecorder(onResult: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY); // m4a
  const webRecRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);

  /** 上传音频并回传识别结果 */
  const recognize = useCallback(
    async (form: FormData) => {
      setIsRecognizing(true);
      try {
        const text = await api.speechToText(form);
        if (text) onResult(text);
      } catch (e) {
        console.error('ASR 失败:', e);
      } finally {
        setIsRecognizing(false);
      }
    },
    [onResult],
  );

  /* ---------- 按住说话：Web ---------- */
  const startRecordWeb = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      webChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) webChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(webChunksRef.current, { type: rec.mimeType });
        stream.getTracks().forEach((t) => t.stop());
        const form = new FormData();
        form.append('file', blob, 'voice.webm');
        await recognize(form);
      };
      webRecRef.current = rec;
      rec.start();
      setIsRecording(true);
    } catch (e) {
      console.error('无法访问麦克风:', e);
    }
  }, [recognize]);

  const stopRecordWeb = useCallback(() => {
    if (webRecRef.current?.state === 'recording') webRecRef.current.stop();
    setIsRecording(false);
  }, []);

  /* ---------- 按住说话：Native ---------- */
  const startRecordNative = useCallback(async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return;
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
  }, [recorder]);

  const stopRecordNative = useCallback(async () => {
    setIsRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('录音为空');
      const form = new FormData();
      form.append('file', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      } as any);
      await recognize(form);
    } catch (e) {
      console.error('ASR 失败:', e);
      setIsRecognizing(false);
    }
  }, [recorder, recognize]);

  /* ---------- 统一入口 ---------- */
  const startRecord = useCallback(() => {
    if (Platform.OS === 'web') startRecordWeb();
    else startRecordNative();
  }, [startRecordWeb, startRecordNative]);

  const stopRecord = useCallback(() => {
    if (Platform.OS === 'web') stopRecordWeb();
    else stopRecordNative();
  }, [stopRecordWeb, stopRecordNative]);

  return {
    isRecording,
    isRecognizing,
    startRecord,
    stopRecord,
  };
}
