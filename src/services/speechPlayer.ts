import { Platform } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

type EndCallback = () => void;

/**
 * 一次「播放会话」：把原生播放器 / Web Audio 元素 / 收尾 Promise / 代际 token
 * 收进同一个对象，避免以前 5 个模块级变量互相覆盖（nativeResolve 被静默覆写
 * 会导致上层 Promise 永不 resolve，UI 卡在 loading）。
 */
interface SpeechSession {
  /** 代际 token：与 playToken 不一致时说明已被新的播放/stopSpeech 取代 */
  token: number;
  /** 自然播完或被打断时调用，保证只会执行一次 */
  settle: () => void;
  onEnd: EndCallback | null;
  /** native 端复用的播放器 */
  player: AudioPlayer | null;
  /** web 端当前 <audio> */
  audio: HTMLAudioElement | null;
  /** 当前句的唤醒器：didJustFinish 触发时立即唤醒等待中的主循环 */
  trackWaiter: (() => void) | null;
  /**
   * 当前是否处于「等待 player 播完这一句」的状态。
   * 只有 true 才允许把 didJustFinish 当作「这句播完了」处理，
   * 否则 replace() 切换句子的瞬间，旧句的 didJustFinish 会把新句直接跳过。
   * 放在会话上而不是模块级变量，避免上一轮残留 true 导致下一轮首句被跳过。
   */
  awaitingTrackEnd: boolean;
}

let playToken = 0;
let currentSession: SpeechSession | null = null;

/** 判断会话是否已被取消（被新播放顶掉 / stopSpeech / 主动 destroy） */
function isStale(session: SpeechSession): boolean {
  return playToken !== session.token || currentSession !== session;
}

/** 释放原生播放器；调用后该 player 不可再使用 */
function releaseNative(player: AudioPlayer | null) {
  if (!player) return;
  try {
    player.removeAllListeners('playbackStatusUpdate');
    player.pause();
    player.release();
  } catch {}
}

/** 释放 web <audio>；不会触发 onended/onerror 回调 */
function releaseWeb(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  try {
    audio.pause();
    // 注意：某些浏览器对 src='' 会发一次相对路径请求，用 removeAttribute 更安全
    audio.removeAttribute('src');
    audio.load();
  } catch {}
}

/**
 * 「自然播完」路径：释放资源 → 先 settle（resolve 上层 Promise）→ 再调 onEnd。
 * 顺序很关键：以前把 settle 放在 destroy() 末尾、和「取消」共用一条路径，
 * 于是 settle 抛错时 Promise 永远悬着。
 */
function finishSequence(session: SpeechSession) {
  const wasCurrent = currentSession === session;
  releaseNative(session.player);
  session.player = null;
  releaseWeb(session.audio);
  session.audio = null;

  session.settle();

  if (wasCurrent) {
    currentSession = null;
    const cb = session.onEnd;
    session.onEnd = null;
    if (cb) {
      try {
        cb();
      } catch (e) {
        console.error('[TTS] onEnd 回调异常:', e);
      }
    }
  }
}

/**
 * 「取消/清理」路径：只放资源 + 让上层 Promise 收尾，不触发 onEnd，
 * 也不碰队列（队列由 stopSpeech / playToken 负责打断）。
 */
function destroySession(session: SpeechSession | null) {
  if (!session) return;
  // 先唤醒正在等「这一句播完」的主循环，保证取消是即时的（不必等 50ms 兜底轮询）
  const waiter = session.trackWaiter;
  session.trackWaiter = null;
  session.awaitingTrackEnd = false;

  releaseNative(session.player);
  session.player = null;
  releaseWeb(session.audio);
  session.audio = null;
  session.onEnd = null;
  session.settle();
  waiter?.();
}

/** 兼容旧语义：清理「当前会话」 */
function destroy() {
  const session = currentSession;
  if (!session) return;
  currentSession = null;
  destroySession(session);
}

function stopInternal() {
  destroy();
}

export function stopSpeech() {
  playToken++;
  stopInternal();
}

/**
 * 播放单个音频地址（供手动点喇叭用）；自然播完或被打断后都会返回，
 * 播放失败则 reject。
 */
export async function playSpeech(uri: string, onEnd?: EndCallback) {
  // 每次调用都开启新代际：作废正在进行的播放
  playToken++;
  stopInternal();

  let settle!: () => void;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const session: SpeechSession = {
    token: playToken,
    settle,
    onEnd: onEnd ?? null,
    player: null,
    audio: null,
    trackWaiter: null,
    awaitingTrackEnd: false,
  };
  currentSession = session;

  if (Platform.OS === 'web') {
    // 本函数自成 scope：session.settle 只用来响应「被打断」，
    // 正常播完/失败由 outcome 分支显式收尾，两者都能 resolve done。
    session.settle = () => {};

    const outcome = await new Promise<
      { type: 'ended' } | { type: 'error'; error: unknown }
    >((resolve) => {
      // ⚠️ 被打断时 onended/onerror 已被清空，这里不会 resolve；
      // 由 destroySession → settle → done 立即唤醒并返回。
      const audio = new window.Audio(uri);
      session.audio = audio;
      audio.onended = () => resolve({ type: 'ended' });
      audio.onerror = () =>
        resolve({ type: 'error', error: new Error('音频加载失败') });
      audio.play().catch((error) => resolve({ type: 'error', error }));
    });

    if (isStale(session)) {
      // 播放中途被 stopSpeech / 新播放打断
      await done;
      return;
    }

    if (outcome.type === 'error') {
      destroySession(session);
      if (currentSession === session) currentSession = null;
      await done;
      throw outcome.error;
    }

    finishSequence(session);
    await done;
    return;
  }

  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  // ⚠️ 等待音频会话时可能已被打断，此时不该再创建播放器
  if (isStale(session)) {
    await done;
    return;
  }

  const player = createAudioPlayer({ uri });
  session.player = player;
  let settledByEvent = false;
  player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    // v57 的 AudioStatus 只有 didJustFinish，没有 didJustStop
    if (!status.didJustFinish || settledByEvent) return;
    settledByEvent = true;
    finishSequence(session);
  });
  player.play();
  await done;
}

/** 句子切分：按中英文句号、问号、感叹号、分号、换行 */
export function splitSentences(text: string): string[] {
  const raw = text.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g) ?? [text];
  const out: string[] = [];
  for (const seg of raw) {
    const s = seg.trim();
    if (!s) continue;
    if (s.length <= 80) {
      out.push(s);
      continue;
    }
    // 长句按逗号/顿号再切，避免后端 300 字截断丢字 + 降低单句合成耗时
    out.push(
      ...(s.match(/[^，,、]+[，,、]?/g) ?? [s])
        .map((p) => p.trim())
        .filter(Boolean),
    );
  }
  return out;
}

/** 让出一次事件循环；用于跳过失败句时避免微任务紧循环空转 */
function nextTick(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * web 端播放一句：返回该句的 <audio>（复用旧元素以减少 GC），
 * 被打断或加载/播放失败时返回 null（调用方据此结束或跳过本句）。
 */
function playTrackWeb(
  session: SpeechSession,
  uri: string,
): Promise<HTMLAudioElement | null> {
  // 复用上句元素：避免同一个序列里反复创建 <audio>
  let audio = session.audio;
  if (audio) {
    try {
      audio.pause();
    } catch {}
  } else {
    audio = new window.Audio();
    session.audio = audio;
  }

  return new Promise<HTMLAudioElement | null>((resolve) => {
    const done = (result: HTMLAudioElement | null) => {
      audio!.onended = null;
      audio!.onerror = null;
      resolve(result);
    };

    // 只有「正常播完」才算这一句结束
    audio!.onended = () => done(audio);
    audio!.onerror = () => done(null);

    try {
      audio!.src = uri;
      audio!.load();
      audio!.play().catch(() => {
        if (isStale(session)) return; // 被打断导致的 AbortError，不算失败
        done(null);
      });
    } catch {
      done(null);
    }

    // 被打断时也要立即返回，不能等一句念完（修复 web 端停止延迟）
    if (isStale(session)) done(null);
  });
}

/**
 * web 端等待一句播完；序列被取消时立即返回（不阻塞在整句上）。
 * 唤醒由 <audio>.onended / destroySession 触发，轮询仅兜底。
 */
function waitForWebEndOrCancel(
  session: SpeechSession,
  audio: HTMLAudioElement,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (isStale(session)) return resolve();

    let settled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const wake = () => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      resolve();
    };

    session.trackWaiter = wake;
    const prevEnded = audio.onended;
    audio.onended = () => {
      try {
        prevEnded?.call(audio, new Event('ended'));
      } catch {}
      wake();
    };

    timer = setInterval(() => {
      if (isStale(session) || audio.ended) wake();
    }, 50);
  });
}

/**
 * 顺序播放一串音频：
 * - native 端复用同一个 AudioPlayer（replace 切句），句间几乎无延迟
 * - getNext 返回：url=播这句；''=跳过（失败句）；null=结束
 * - stopSpeech() / 新的播放会作废当前会话，立即收尾（且不触发 onEnd）
 */
function playSequence(
  getNext: () => Promise<string | null>,
  onEnd?: EndCallback,
): Promise<void> {
  let settle!: () => void;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const session: SpeechSession = {
    token: playToken,
    settle,
    onEnd: onEnd ?? null,
    player: null,
    audio: null,
    trackWaiter: null,
    awaitingTrackEnd: false,
  };
  currentSession = session;

  (async () => {
    // 整个序列共用一个原生播放器；createAudioPlayer 是同步的，只需等音频会话
    if (Platform.OS !== 'web') {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      if (isStale(session)) return;
    }

    while (!isStale(session)) {
      const uri = await getNext();
      // ⚠️ await 期间用户可能已经点了停止，这里必须复查（以前只查 finished）
      if (isStale(session)) return;
      if (uri === null) {
        // 正常播完：走「自然结束」路径，不复用取消路径
        finishSequence(session);
        return;
      }
      if (uri === '') {
        // 跳过失败句：让出事件循环，避免连续失败句时同步紧循环
        await nextTick();
        continue;
      }

      // web 端不经过 playSpeech：后者会递增 playToken 并替换 currentSession，
      // 导致外层序列立刻被判为 stale（只播一句就停）。这里直接在本会话内顺序播放。
      if (Platform.OS === 'web') {
        const audio = await playTrackWeb(session, uri);
        if (audio === null) return; // 被打断或加载失败
        await waitForWebEndOrCancel(session, audio);
        continue;
      }

      if (!session.player) {
        const player = createAudioPlayer({ uri });
        session.player = player;
        player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          // v57 的 AudioStatus 只有 didJustFinish，没有 didJustStop
          if (session.awaitingTrackEnd && status.didJustFinish) {
            session.awaitingTrackEnd = false;
            // 立刻唤醒等待中的主循环，不再递归 step()
            const w = session.trackWaiter;
            session.trackWaiter = null;
            w?.();
          }
        });
        player.play();
      } else {
        try {
          session.player.replace({ uri });
          session.player.play();
        } catch {
          // 播放器已失效：结束本次序列（不触发 onEnd）
          destroySession(session);
          return;
        }
      }

      // 等待「本句播完」或「序列被取消」（waitForTrackEndOrCancel 内部会置 awaitingTrackEnd）
      await waitForTrackEndOrCancel(session);
    }
    // 被取消：isStale → while 退出，收尾交给 destroySession
  })();

  return done;
}

/**
 * 等待当前句播放结束；若序列被取消则立即返回。
 * 用「会话 + 每句独立的 waiter」代替原来的模块级 resolver，避免被覆盖；
 * 50ms 轮询只是兜底（防 didJustFinish 事件丢失导致永久卡死）。
 */
function waitForTrackEndOrCancel(session: SpeechSession): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const wake = () => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      resolve();
    };

    session.trackWaiter = wake;
    session.awaitingTrackEnd = true;

    // 兜底轮询：取消要即时生效；即使 didJustFinish 丢失也能推进，不会永久卡死
    timer = setInterval(() => {
      if (isStale(session) || !session.awaitingTrackEnd) wake();
    }, 50);
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
    return urls[i] ?? '';
  };

  try {
    await playSequence(getNext, opts.onEnd);
  } finally {
    stopped = true;
  }
}
