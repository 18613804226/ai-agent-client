import React, { useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { useAudioRecorder, RecordingPresets, AudioModule } from "expo-audio";
import { api } from "../services/api";

interface VoiceInputButtonProps {
  theme: any;
  disabled?: boolean;
  onResult: (text: string) => void;
}

export default function VoiceInputButton(props: VoiceInputButtonProps) {
  return Platform.OS === "web" ? (
    <WebVoiceButton {...props} />
  ) : (
    <NativeVoiceButton {...props} />
  );
}

/* ---------- 公共 UI ---------- */
function MicUI({
  theme,
  recording,
  busy,
  hint,
  onPressIn,
  onPressOut,
  disabled,
}: any) {
  return (
    <View style={styles.wrapper}>
      {!!hint && (
        <Text
          style={[
            styles.hint,
            { color: recording ? "#ef4444" : theme.textMuted },
          ]}
        >
          {hint}
        </Text>
      )}
      <TouchableOpacity
        style={[
          styles.micBtn,
          { backgroundColor: recording ? "#ef4444" : "rgba(150,150,150,0.1)" },
        ]}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || busy}
        activeOpacity={0.7}
      >
        {busy ? (
          <ActivityIndicator size="small" color={theme.textMain} />
        ) : (
          <Text style={{ fontSize: 18 }}>{recording ? "🎙️" : "🎤"}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/* ---------- Web：MediaRecorder ---------- */
function WebVoiceButton({ theme, disabled, onResult }: VoiceInputButtonProps) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        stream.getTracks().forEach((t) => t.stop());
        await upload(blob, "voice.webm");
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setHint("正在录音，松开结束");
    } catch {
      setHint("无法访问麦克风");
    }
  };

  const stop = () => {
    if (recRef.current?.state === "recording") recRef.current.stop();
    setRecording(false);
    setHint("识别中…");
  };

  const upload = async (blob: Blob, filename: string) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      const text = await api.speechToText(form);
      onResult(text);
      setHint("");
    } catch (e) {
      console.error("ASR 失败:", e);
      setHint("识别失败，请重试");
      setTimeout(() => setHint(""), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MicUI
      {...{
        theme,
        recording,
        busy,
        hint,
        disabled,
        onPressIn: start,
        onPressOut: stop,
      }}
    />
  );
}

/* ---------- Native：expo-audio 录音 ---------- */
function NativeVoiceButton({
  theme,
  disabled,
  onResult,
}: VoiceInputButtonProps) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY); // m4a

  const start = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setHint("需要麦克风权限");
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
    setHint("正在录音，松开结束");
  };

  const stop = async () => {
    setRecording(false);
    setHint("识别中…");
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("录音为空");
      const form = new FormData();
      form.append("file", { uri, name: "voice.m4a", type: "audio/m4a" } as any);
      const text = await api.speechToText(form);
      onResult(text);
      setHint("");
    } catch (e) {
      console.error("ASR 失败:", e);
      setHint("识别失败，请重试");
      setTimeout(() => setHint(""), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MicUI
      {...{
        theme,
        recording,
        busy,
        hint,
        disabled,
        onPressIn: start,
        onPressOut: stop,
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: "row", alignItems: "center" },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  hint: {
    position: "absolute",
    bottom: 48,
    right: 0,
    fontSize: 13,
    maxWidth: 260,
    backgroundColor: "rgba(128,128,128,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
