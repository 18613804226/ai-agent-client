/**
 * 懒加载 expo-image-manipulator 的类型（只用于类型检查，运行时不产生 import）。
 */
type ImageManipulatorModule = typeof import('expo-image-manipulator')

/**
 * Metro 的模块系统提供 require（web 端同理）。
 * 这里只声明类型，不影响运行时。
 */
declare const require: (id: string) => any

/**
 * 图片上传前的「降采样 + 压缩」。
 *
 * 背景：/chat/upload-image 走的是 JSON body（{ image: 'data:image/jpeg;base64,...' }），
 * base64 会把二进制膨胀 4/3。服务端（nginx client_max_body_size / NestJS body limit）
 * 一般只给 1MB 上下，一旦超了直接回 413 —— 前端原样重试多少次都是同一个结果。
 *
 * 所以真正的解法是「上传前把图压到限额以内」，而不是去调 axios 的 maxBodyLength：
 * 那个参数只在 Node 端生效，浏览器 XHR 根本不认（设了也只是自我安慰）。
 *
 * 顺带解决「有的图片大得离谱」：手机直出照片动辄 4000×3000、几 MB，
 * 就算服务端放宽限制，上传也要好几秒，压到 1600px 足够模型看图了。
 */

/**
 * 上传体积上限（原始二进制字节）。
 *
 * 服务端 limit = 10MB，客户端取 limit × 0.6：base64 会膨胀 4/3
 * （4MB → 5.3MB body），再留一倍余量给 JSON 外壳与并发。
 * 客户端阈值必须**明显低于**服务端上限，否则压缩没兜住时会直接 413。
 */
export const MAX_UPLOAD_RAW_BYTES = 4 * 1024 * 1024

/** base64 字符串长度上限（8MB ≈ 原始 6MB）：超过必然撞服务端 limit，客户端直接拦掉。 */
export const MAX_UPLOAD_BASE64_CHARS = 8 * 1024 * 1024

/**
 * 压缩梯度：从画质最好往下退，直到落进体积上限。
 *
 * 第一档 2400px 是为「截图里的字要能读」留的余量：4000×3000 的手机截图
 * 缩到 2400 长边还有 60% 原始尺寸，模型基本能读出小字；
 * 而截图恰恰是压缩最省的一类（大片纯色），没必要为躲限额牺牲可读性。
 */
const COMPRESS_STEPS: Array<{ maxEdge: number; quality: number }> = [
  { maxEdge: 2400, quality: 0.82 },
  { maxEdge: 1600, quality: 0.72 },
  { maxEdge: 1200, quality: 0.6 },
]

/** data URL 里 base64 部分还原出的原始字节数 */
export function rawBytesOfDataUrl(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  if (!b64) return 0
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
}

/** 上传前的最后一道闸：超过客户端已知上限就别去撞服务端 413 了 */
export function assertImageUploadable(dataUrl: string): void {
  if (dataUrl.length > MAX_UPLOAD_BASE64_CHARS) {
    throw new Error('图片太大（压缩后仍超过 6MB），请换一张更小的图片')
  }
}

// ==================== Web ====================

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}

/** 按长边上限缩放并重新编码成 JPEG（白底铺平，避免 PNG 透明区变黑块） */
function encodeJpeg(img: HTMLImageElement, maxEdge: number, quality: number): string {
  const ow = img.naturalWidth || img.width
  const oh = img.naturalHeight || img.height
  const scale = Math.min(1, maxEdge / Math.max(ow, oh))
  const w = Math.max(1, Math.round(ow * scale))
  const h = Math.max(1, Math.round(oh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布上下文')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

async function compressWebImage(src: string): Promise<string | null> {
  let img: HTMLImageElement
  try {
    img = await loadHtmlImage(src)
  } catch {
    return null
  }
  let best: string | null = null
  for (const step of COMPRESS_STEPS) {
    let out: string
    try {
      out = encodeJpeg(img, step.maxEdge, step.quality)
    } catch {
      break
    }
    if (!best || rawBytesOfDataUrl(out) < rawBytesOfDataUrl(best)) best = out
    if (rawBytesOfDataUrl(out) <= MAX_UPLOAD_RAW_BYTES) return out
  }
  return best
}

/**
 * Web：把用户选的图片（File/Blob）转成「可上传」的 data URL。
 * 直接从 Blob 走 canvas 压缩，不先把整张图 base64 化（大图那一下很吃内存）。
 */
export async function prepareWebImage(file: Blob): Promise<string> {
  // 已经够小：原样上传（保留原格式与画质）
  if (file.size <= MAX_UPLOAD_RAW_BYTES) {
    return await readAsDataUrl(file)
  }
  const url = URL.createObjectURL(file)
  try {
    const compressed = await compressWebImage(url)
    if (compressed) {
      console.log(
        `[imageCompress] Web 原始 ${(file.size / 1024).toFixed(0)}KB → 压缩后 ${(
          rawBytesOfDataUrl(compressed) / 1024
        ).toFixed(0)}KB`,
      )
      return compressed
    }
  } catch (e) {
    console.warn('[imageCompress] Web 压缩失败:', e)
  } finally {
    URL.revokeObjectURL(url)
  }
  // 压缩没成功：退回原图，后面由 assertImageUploadable / 413 特判给出明确提示
  return await readAsDataUrl(file)
}

// ==================== Native ====================

/**
 * 懒加载 expo-image-manipulator。
 *
 * ⚠️ 必须懒加载：它的原生模块是 `requireNativeModule('ExpoImageManipulator')`，
 * **在 import 时**就会求值。设备上的安装包如果还没带上这个新依赖（没重新构建），
 * 静态 import 会让整个 App 启动即崩（api.ts → imageCompress.ts → 崩）→ 白屏。
 * 懒加载 + try/catch 后，最坏情况只是「压缩不可用、退回原图」，不会白屏。
 */
function loadManipulator(): ImageManipulatorModule | null {
  try {
    return require('expo-image-manipulator') as ImageManipulatorModule
  } catch (e) {
    console.warn(
      '[imageCompress] expo-image-manipulator 不可用（需重新构建安装包）:',
      e,
    )
    return null
  }
}

async function compressNativeImage(uri: string): Promise<string | null> {
  const mod = loadManipulator()
  if (!mod) return null
  const { ImageManipulator, SaveFormat } = mod
  let best: string | null = null
  for (const step of COMPRESS_STEPS) {
    let context: any = null
    let image: any = null
    try {
      // maxWidth/maxHeight 是「解码时降采样」：大图根本不会整张进内存
      context = ImageManipulator.manipulate(uri, {
        maxWidth: step.maxEdge,
        maxHeight: step.maxEdge,
      })
      image = await context.renderAsync()
      const result = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: step.quality,
        base64: true,
      })
      const out = result?.base64 ? `data:image/jpeg;base64,${result.base64}` : ''
      if (out) {
        if (!best || rawBytesOfDataUrl(out) < rawBytesOfDataUrl(best)) best = out
        if (rawBytesOfDataUrl(out) <= MAX_UPLOAD_RAW_BYTES) return out
      }
    } catch (e) {
      console.warn('[imageCompress] 原生压缩失败:', e)
    } finally {
      try {
        image?.release?.()
      } catch {}
      try {
        context?.release?.()
      } catch {}
    }
  }
  return best
}

/**
 * 原生：把相册/相机选中的图片转成「可上传」的 data URL。
 * 之前这里直接用 asset.base64（原始体积），一张手机照片就能 3~8MB → 必 413。
 */
export async function prepareNativeImage(opts: {
  uri: string
  base64?: string | null
  fileSize?: number | null
}): Promise<string> {
  const fallback = opts.base64 ? `data:image/jpeg;base64,${opts.base64}` : ''
  const bytes =
    opts.fileSize ?? (opts.base64 ? rawBytesOfDataUrl(fallback) : undefined)
  // 已经够小：原样上传（ImagePicker 已按 quality 压过，不做二次编码）
  if (fallback && bytes !== undefined && bytes <= MAX_UPLOAD_RAW_BYTES) {
    return fallback
  }
  const compressed = await compressNativeImage(opts.uri)
  if (compressed) {
    console.log(
      `[imageCompress] 原生 原始 ${((bytes ?? 0) / 1024).toFixed(0)}KB → 压缩后 ${(
        rawBytesOfDataUrl(compressed) / 1024
      ).toFixed(0)}KB`,
    )
    return compressed
  }
  return fallback
}
