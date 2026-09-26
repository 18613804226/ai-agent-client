import { Platform } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";

type EndCallback = () => void;

let nativePlayer: AudioPlayer | null = null;
let webAudio: HTMLAudioElement | null = null;
let endCb: EndCallback | null = null;
let playToken = 0;
let nativeResolve: (() => void) | null = null;

function destroy() {
  if (Platform.OS === "web") {
    if (webAudio) {
      webAudio.onended = null;
      webAudio.onerror = null;
      webAudio.pause();
      try {
        webAudio.src = "";
      } catch {}
      webAudio = null;
    }
    return;
  }
  if (nativePlayer) {
    try {
      nativePlayer.removeAllListeners("playbackStatusUpdate");
      nativePlayer.pause();
      nativePlayer.release();
    } catch {}
    nativePlayer = null;
  }
  const r = nativeResolve;
  nativeResolve = null;
  r?.();
}

function stopInternal() {
  endCb = null;
  destroy();
}

export function stopSpeech() {
  playToken++;
  stopInternal();
}

/** 播放单个音频地址（供手动点喇叭用）；播完/被停止才返回 */
export async function playSpeech(uri: string, onEnd?: EndCallback) {
  stopInternal();
  endCb = onEnd ?? null;

  if (Platform.OS === "web") {
    await new Promise<void>((resolve, reject) => {
      const audio = new window.Audio(uri);
      webAudio = audio;
      audio.onended = () => {
        const cb = endCb;
        endCb = null;
        destroy();
        cb?.();
        resolve();
      };
      audio.onerror = () => {
        endCb = null;
        destroy();
        reject(new Error("音频加载失败"));
      };
      audio.play().catch(reject);
    });
    return;
  }

  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  await new Promise<void>((resolve) => {
    nativeResolve = resolve;
    const player = createAudioPlayer({ uri });
    nativePlayer = player;
    player.addListener("playbackStatusUpdate", (status: any) => {
      if (status.didJustFinish || status.didJustStop) {
        const cb = endCb;
        endCb = null;
        destroy();
        cb?.();
      }
    });
    player.play();
  });
}

/** 句子切分：按中英文句号、问号、感叹号、分号、换行 */
export function splitSentences(text: string): string[] {
  return (text.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 顺序播放一串音频：
 * - native 端复用同一个 AudioPlayer（replace 切句），句间几乎无延迟
 * - getNext 返回：url=播这句；''=跳过（失败句）；null=结束
 * - isCancelled() 为 true 时立即收尾（stopSpeech 触发）
 */
function playSequence(
  getNext: () => Promise<string | null>,
  isCancelled: () => boolean,
  onEnd?: EndCallback,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onEnd?.();
      resolve();
    };

    if (Platform.OS === "web") {
      (async () => {
        while (true) {
          if (isCancelled()) return finish();
          const uri = await getNext();
          if (uri === null) return finish();
          if (uri === "") continue; // 跳过失败句
          try {
            await playSpeech(uri);
          } catch {}
        }
      })();
      return;
    }

    (async () => {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      let player: AudioPlayer | null = null;
      // stopSpeech → destroy() 会调用 nativeResolve，这里用它收尾
      nativeResolve = () => {
        if (player) {
          try {
            player.removeAllListeners("playbackStatusUpdate");
            player.pause();
            player.release();
          } catch {}
          if (nativePlayer === player) nativePlayer = null;
          player = null;
        }
        finish();
      };

      const step = async () => {
        if (finished) return;
        if (isCancelled()) {
          // 走 destroy 体系收尾（释放播放器 + finish）
          destroy();
          return;
        }
        const uri = await getNext();
        if (finished) return;
        if (uri === null) {
          destroy(); // 正常播完：destroy 里 nativeResolve → finish
          return;
        }
        if (uri === "") return step(); // 跳过失败句
        if (!player) {
          player = createAudioPlayer({ uri });
          nativePlayer = player;
          player.addListener("playbackStatusUpdate", (status: any) => {
            if (status.didJustFinish || status.didJustStop) step();
          });
          player.play();
        } else {
          try {
            player.replace({ uri });
            player.play();
          } catch {
            destroy();
          }
        }
      };
      step();
    })();
  });
}

/**
 * 句子级流水线播放：
 * - 过滤纯表情/纯标点的句子（TTS 对它们会报错）
 * - 第 0 句合成回来立刻播，播放期间后台最多 PREFETCH 句并发预取
 * - native 端整段复用播放器，句间无重建延迟
 * - stopSpeech() 随时打断；单句失败重试 3 次后跳过
 */
export async function playText(
  text: string,
  opts: {
    fetchUrl: (sentence: string) => Promise<string>;
    onEnd?: EndCallback;
  },
): Promise<void> {
  const myToken = playToken;
  const MAX = 10000;
  if (text.length > MAX) {
    console.warn(`[TTS] 文本超长，只读前 ${MAX} 字`);
  }
  const sentences = splitSentences(text.slice(0, MAX))
    .map((s) => s.trim())
    // ✅ 只念有意义的句子：纯表情/纯标点直接跳过（TTS 对它们会报 500）
    .filter((s) => /[\p{Script=Han}A-Za-z0-9]/u.test(s));
  const total = sentences.length;
  console.log(`[TTS] 开始朗读：共 ${total} 句，文本 ${text.length} 字`);

  const urls: (string | null)[] = new Array(total).fill(null);
  const pending = new Map<number, Promise<void>>();
  const PREFETCH = 6; // 💡 印尼跨境延迟大，预取开 6；部署国内后可调回 3
  let stopped = false;

  const fetchOne = (i: number): Promise<void> => {
    if (urls[i]) return Promise.resolve();
    let p = pending.get(i);
    if (!p) {
      p = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            urls[i] = await opts.fetchUrl(sentences[i]);
            return;
          } catch (e) {
            if (attempt === 2) {
              console.warn(
                `[TTS] 第 ${i + 1}/${total} 句合成失败(重试3次):`,
                sentences[i].slice(0, 30),
                e,
              );
              urls[i] = null;
            } else {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        }
      })().finally(() => pending.delete(i));
      pending.set(i, p);
    }
    return p;
  };

  let next = 0;
  let inFlight = 0;
  const pump = () => {
    while (!stopped && inFlight < PREFETCH && next < total) {
      const i = next++;
      inFlight++;
      fetchOne(i).finally(() => {
        inFlight--;
        pump();
      });
    }
  };
  pump();

  // 顺序取句给播放器：'' = 失败跳过，null = 结束
  let cursor = 0;
  const getNext = async (): Promise<string | null> => {
    if (myToken !== playToken) return null;
    if (cursor >= total) return null;
    const i = cursor++;
    await fetchOne(i);
    if (myToken !== playToken) return null;
    return urls[i] ?? "";
  };

  try {
    await playSequence(getNext, () => myToken !== playToken, opts.onEnd);
  } finally {
    stopped = true;
  }
}
