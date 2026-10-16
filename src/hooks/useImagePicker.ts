import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import { Platform, Alert, Linking } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { api } from '../services/api'
import { MyToast } from '../components/GlobalToast'

/**
 * 已选附件。
 *
 * 为什么必须分 kind：以前图片和文档混在同一个 string[] 里，输入栏一律用
 * <Image source={{uri}} /> 渲染，PDF/DOC/TXT 塞进去什么都显示不出来（「没法预览」），
 * 还会被当成图片发到后端。分成 image / file 两类才能给文档做正确的预览。
 */
export interface PickedAttachment {
  uri: string
  kind: 'image' | 'file'
  /** 文件名（文档才有；图片来自相册/拍照时无名） */
  name?: string
  size?: number
  mime?: string
  /** Web 端原始的 File 对象：用于新标签页打开预览（原生端没有） */
  blob?: any
  /**
   * 选中即上传（POST /chat/attachment）的状态：
   * uploadId / uploadedAt = 已拿到 id（发送时直接引用）；uploading = 传输中；
   * uploadError = 失败原因（chip 点击可就地重传）。
   * 选中即传的好处：类型/大小/时长问题立刻 toast 暴露，发送时 id 必定就绪，
   * 不用在「按发送」之后才串行等上传。
   */
  uploadId?: string
  /**
   * DELETE /chat/attachments/:fileRef 用的「uuid.ext」（注意与 uploadId 区分：
   * 附件 id 是裸 uuid，用于 attachmentIds 引用；删除接口要带扩展名的 fileRef）。
   */
  uploadFileRef?: string
  /**
   * 服务端引用（历史消息回传的形状：{ url, fileRef, name, kind, charCount }，
   * 没有本地 blob/uri）。刷新/重载后气泡里的附件只剩这些字段——点击预览时
   * 由 ChatArea 带 token GET /chat/attachments/:fileRef 拉成 blob 再开预览。
   */
  url?: string
  fileRef?: string
  uploadedAt?: number
  uploading?: boolean
  uploadError?: string
}

/** 读 Web <input type="file"> 的结果，按 MIME 分成图片 / 文档 */
function readWebFile(
  file: any,
  onImage: (att: PickedAttachment) => void,
  onFile: (att: PickedAttachment) => void,
) {
  const isImage = /^image\//.test(file.type || '')
  const reader = new FileReader()
  reader.onload = (event) => {
    const base64String = event.target?.result as string
    if (!base64String) return
    // 一律带 uploading: true 入列：选中即上传，遮罩（转圈）从第一帧就盖上，
    // 别让「没状态的裸图」先闪一下
    if (isImage)
      onImage({
        uri: base64String,
        kind: 'image' as const,
        name: file.name,
        size: file.size,
        mime: file.type,
        uploading: true,
      })
    else
      onFile({
        uri: base64String,
        kind: 'file',
        name: file.name,
        size: file.size,
        mime: file.type,
        blob: file,
      })
  }
  reader.readAsDataURL(file)
}

/** 人类可读的文件大小 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ==================== 图片「选中即上传」缓存 ====================
/**
 * dataUrl → 后端 URL。模块级 Map：同一进程内相同 dataUrl 必然是同一张图，
 * 且发送链路（useChatManager）与选择链路（useImagePicker）能共享，无需穿参数。
 * 选中不发送的图片会滞留在缓存里，做 50 条容量控制，超限淘汰最早的
 *（被淘汰的发送时会重传，无正确性影响）。
 */
const imageUploadCache = new Map<string, string>()
/** 进行中的上传：同一张图「预传 + 发送兜底」合并成一次请求 */
const imageUploadPending = new Map<string, Promise<string>>()
/** 已进入发送流程的 img key：服务端文件正被消息引用，删除 UI 绝不能碰它 */
const imageUploadInUse = new Set<string>()
/** 上传完成前 chip 就被删的 img：等上传落地后再删服务端文件 */
const imageUploadCancelled = new Set<string>()
/**
 * 已触发过「选中即传」自动上传的图片 uri。
 * useImagePicker 的 effect 每次 selectedAttachments 变化都会跑，必须以此为界，
 * 否则同一张图会被反复重置成「上传中…」永远等不到结果；失败后的重传由
 * chip 点击显式触发（retryImageUpload 会先删掉这里的标记）。
 */
const imageUploadAttempted = new Set<string>()

function rememberImageUpload(img: string, url: string): void {
  imageUploadCache.set(img, url)
  if (imageUploadCache.size > 50) {
    const oldest = imageUploadCache.keys().next().value
    if (oldest !== undefined) imageUploadCache.delete(oldest)
  }
}

/** 从 `/uploads/img-x.png`（可能带 host 前缀）解析文件名并删除；失败静默 */
function deleteServerImageByUrl(url: string): void {
  if (!url.includes('/uploads/')) return // 非本地产物（原生 file:// 透传等）不碰
  const filename = url.split('/').pop()
  if (!filename) return
  // 尽力而为：失败就留给后端兜底清理，不打扰用户
  api.deleteUploadedImage(filename).catch(() => {})
}

/**
 * 选中即上传（幂等）：任何入口选了图就后台预传，发送时零等待。
 * 失败 toast 后端原因，并通过 onFail 上报（UI 用来禁发送按钮）；
 * 发送时 resolveImageUpload 还会再兜底重试一次。
 *
 * @returns 本次上传对应的 promise（缓存命中 = 立即兑现）。调用方必须用它来
 *   结算附件状态：只靠 onFail/onOk 回调会漏掉「缓存命中 / 已在传输中」两条
 *   早退分支，附件的 uploading 就永远停在 true。
 */
export function precacheImageUpload(
  img: string,
  onFail?: (msg: string) => void,
  onOk?: (url: string) => void,
): Promise<string> {
  imageUploadCancelled.delete(img) // 重新选中同一张 = 撤销之前的「已删」标记
  // 已在缓存：不重发，promise 照样兑现，状态才能收敛
  const cached = imageUploadCache.get(img)
  if (cached) {
    onOk?.(cached)
    return Promise.resolve(cached)
  }
  // 上传进行中：复用同一个 promise（同样不发新请求）
  const pendingP = imageUploadPending.get(img)
  if (pendingP) {
    pendingP.then((u) => onOk?.(u)).catch((e: any) =>
      onFail?.(e?.message || '图片上传失败，请稍后重试'),
    )
    return pendingP
  }
  const p = api
    .uploadImageStrict(img)
    .then((url) => {
      if (imageUploadCancelled.delete(img) && !imageUploadInUse.has(img)) {
        // 上传落地前 chip 就被删了、也没进过发送流程 → 没人要，删服务端文件
        deleteServerImageByUrl(url)
        return url
      }
      rememberImageUpload(img, url)
      onOk?.(url)
      return url
    })
    .finally(() => {
      imageUploadPending.delete(img)
    })
  imageUploadPending.set(img, p)
  p.catch((e: any) => {
    onFail?.(e?.message || '图片上传失败，发送时将自动重试')
    MyToast.show(e?.message || '图片上传失败，发送时将自动重试')
  })
  return p
}

/**
 * 发送侧解析图片 URL：先查缓存 → 复用进行中的请求 → 现传。
 * 失败抛错（由调用方还原输入并 toast），绝不静默丢图。
 */
export async function resolveImageUpload(img: string): Promise<string> {
  // 发送要用它 → 打「使用中」标记：之后用户再删这张 chip 也绝不会删服务端文件
  // （消息里的 <img> 还指着它）；同时撤销可能存在的「已删」标记
  imageUploadInUse.add(img)
  imageUploadCancelled.delete(img)
  const cached = imageUploadCache.get(img)
  if (cached) return cached
  const pending = imageUploadPending.get(img)
  if (pending) return await pending
  const p = api.uploadImageStrict(img).then((url) => {
    rememberImageUpload(img, url)
    return url
  })
  imageUploadPending.set(img, p)
  try {
    return await p
  } finally {
    imageUploadPending.delete(img)
  }
}

/**
 * 删除图片 chip 时调用：丢本地缓存，并删除服务端 uploads 文件
 *（DELETE /chat/uploads/:filename）。
 * 三层防护：① 已随消息发出（inUse）→ 只丢本地，绝不删服务端；
 * ② 已上传完成 → 立即删；③ 还在传 → 打标记，落地后由 precache 回调删。
 */
export function forgetImageUpload(img: string): void {
  // 取消选中 = 撤销「已自动上传过」标记：同一张图再次选中要重新走一遍
  // 「选中即传」，否则新附件会停在未上传状态、发出去才现传
  imageUploadAttempted.delete(img)
  if (imageUploadInUse.has(img)) {
    imageUploadCache.delete(img)
    return
  }
  const url = imageUploadCache.get(img)
  imageUploadCache.delete(img)
  if (url) {
    deleteServerImageByUrl(url)
    return
  }
  if (imageUploadPending.has(img)) {
    imageUploadCancelled.add(img)
  }
}

/**
 * 选中即上传：把附件传到 /chat/attachment 拿 id 并回填到 state（按对象身份匹配，
 * 因此入列的对象必须带着 uploading: true 且后续不再被替换过——失败/成功各回填一次）。
 * 失败标 uploadError + toast 后端具体原因；发送侧（useChatManager）对缺 id /
 * 临近 30 分钟过期的还有一次兜底重传。
 */
export function uploadAttachment(
  att: PickedAttachment,
  setFiles: Dispatch<SetStateAction<PickedAttachment[]>>,
): void {
  api
    .uploadChatAttachment({
      name: att.name || '未命名文件',
      uri: att.uri,
      blob: att.blob,
      mime: att.mime,
    })
    .then((up) => {
      // 身份 or uri 双重匹配：对象被替换过（合并更新/重新入列）后，
      // 只按身份匹配会漏掉 → 永远卡在「上传中」
      setFiles((prev) =>
        prev.map((f) =>
          f === att || f.uri === att.uri
            ? {
                ...f,
                uploading: false,
                uploadError: undefined,
                uploadId: up.id,
                uploadFileRef: up.fileRef,
                uploadedAt: Date.now(),
              }
            : f,
        ),
      )
    })
    .catch((e: any) => {
      const msg = e?.message || '附件上传失败，请重试'
      setFiles((prev) =>
        prev.map((f) =>
          f === att || f.uri === att.uri
            ? { ...f, uploading: false, uploadError: msg }
            : f,
        ),
      )
      MyToast.show(msg)
    })
}

/**
 * 失败附件的就地重传：重置上传状态并重新调用 uploadAttachment。
 * 供 ChatInputBar 的「附件上传失败，点此重试」提示条使用。
 */
export function retryAttachmentUpload(
  att: PickedAttachment,
  setFiles: Dispatch<SetStateAction<PickedAttachment[]>>,
): void {
  const retrying: PickedAttachment = {
    ...att,
    uploading: true,
    uploadError: undefined,
  };
  setFiles((prev) => prev.map((f) => (f === att ? retrying : f)));
  uploadAttachment(retrying, setFiles);
}

/**
 * 图片附件的就地重传（chip 点「上传失败」时触发）：重置状态后重走 precache。
 */
export function retryImageUpload(
  att: PickedAttachment,
  setAttachments: Dispatch<SetStateAction<PickedAttachment[]>>,
): void {
  // 重新允许自动上传（成功后又失败等场景）
  imageUploadAttempted.delete(att.uri)
  uploadImageAttachment(att, setAttachments)
}

/**
 * 图片附件「选中即传」：走 /chat/upload-image 拿 URL，并把传输状态回填到
 * 附件对象上（uploading / uploadError）。
 *
 * ⚠️ 状态必须挂在 precacheImageUpload 返回的 promise 上结算：它内部有
 * 「缓存命中 / 已在传输中」两条不发起请求的早退分支，走 onOk/onFail 回调
 * 会漏掉它们，uploading 就一直停在 true（发送按钮永久禁用）。
 *
 * settle 按「对象身份 or uri」双重匹配：中间任何一次状态更新把对象换掉后，
 * 只按身份匹配会永远匹配不上 —— 表现就是一直卡在「上传中」。
 */
export function uploadImageAttachment(
  att: PickedAttachment,
  setAttachments: Dispatch<SetStateAction<PickedAttachment[]>>,
): void {
  // setAttachments 会把 att 整个换成 next，回调里必须按 next 匹配
  const next: PickedAttachment = {
    ...att,
    uploading: true,
    uploadError: undefined,
  }
  setAttachments((prev) => prev.map((f) => (f === att ? next : f)))

  const settle = (patch: Partial<PickedAttachment>) =>
    setAttachments((prev) =>
      prev.map((f) =>
        f === next || f.uri === next.uri ? { ...next, ...patch } : f,
      ),
    )

  precacheImageUpload(att.uri)
    .then(() => settle({ uploading: false, uploadError: undefined }))
    // 失败：precache 内部已 toast，这里只回填状态（chip 点一下可就地重传）
    .catch((e: any) =>
      settle({ uploading: false, uploadError: e?.message || '图片上传失败' }),
    )
}

export function useImagePicker() {
  /** 统一的附件列表：图片、文档、视频都在这里，用 kind 字段区分 */
  const [selectedAttachments, setSelectedAttachments] =
    useState<PickedAttachment[]>([])
  const [isSheetVisible, setIsSheetVisible] = useState(false)

  /**
   * 图片选中即传：一个 effect 盖住所有选图入口（相机 / 相册 / Web input /
   * 文档选择器误选图片…）。幂等：precache 内部靠 cache/pending 去重，
   * 这里再用 imageUploadAttempted 保证同一 uri 只自动发一次
   * （失败后的重传由 chip 点击显式触发，不走这个 effect）。
   */
  useEffect(() => {
    const imageAttachments = selectedAttachments.filter(
      (a) => a.kind === 'image',
    )
    imageAttachments.forEach((att) => {
      if (imageUploadAttempted.has(att.uri)) return
      imageUploadAttempted.add(att.uri)
      uploadImageAttachment(att, setSelectedAttachments)
    })
  }, [selectedAttachments, setSelectedAttachments])

  const processPickedAssets = async (
    assets: ImagePicker.ImagePickerAsset[],
  ) => {
    if (!assets || assets.length === 0) return
    const newAttachments: PickedAttachment[] = assets.map((asset) => {
      const uri = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri
      return {
        uri,
        kind: 'image' as const,
        // 带 uploading: true 入列：下面的 effect 会紧跟着发起预传，
        // 遮罩（转圈）从第一帧就盖上，不留「光秃秃的图」空窗
        uploading: true,
      }
    })
    setSelectedAttachments((prev) => [...prev, ...newAttachments])
  }

  const handlePickImage = () => {
    setIsSheetVisible(true)
  }

  // 1. 上传文件 / 文档 (电脑端打开文件管理器，手机端打开DocumentPicker)
  const handlePickDocument = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      // 不再限定为少数几种：让用户能选任意文档，预览按真实 MIME 走
      input.onchange = (e: any) => {
        const files = e.target.files
        if (files && files.length > 0) {
          Array.from(files).forEach((file: any) =>
            readWebFile(
              file,
              (att) => {
                // 选中即上传：先入列（带 uploading: true，遮罩立刻盖上），
                // 同时后台传拿 URL，发送时直接引用
                setSelectedAttachments((prev) => [...prev, att])
              },
              (att) => {
                // 选中即上传：先入列（可预览），同时后台传拿 id，发送时直接引用
                const a: PickedAttachment = { ...att, uploading: true }
                setSelectedAttachments((prev) => [...prev, a])
                uploadAttachment(a, setSelectedAttachments)
              },
            ),
          )
        }
      }
      input.click()
      return
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        // 不设 type：避免部分机型漏掉 .md/.js/.ts 等文本文件
        multiple: true,
        copyToCacheDirectory: true,
      })
      if (!result.canceled && result.assets) {
        const files: PickedAttachment[] = result.assets.map((file) => ({
          uri: file.uri,
          kind: 'file' as const,
          name: file.name,
          size: file.size,
          mime: file.mimeType,
          uploading: true,
        }))
        setSelectedAttachments((prev) => [...prev, ...files])
        // 选中即上传：类型/大小/时长问题在这一步就 toast 暴露
        files.forEach((f) => uploadAttachment(f, setSelectedAttachments))
      }
    } catch (err) {
      console.error(err)
    }
  }

  // 💡 2. 拍照 (核心修改点)
  const openCamera = async () => {
    // 🌐 H5/Web 端：调起摄像头拍照
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.capture = 'environment' // 关键属性：直接调后置摄像头
      input.onchange = (e: any) => {
        const file = e.target.files?.[0]
        if (file) {
          readWebFile(
            file,
            (att) => {
              setSelectedAttachments((prev) => [...prev, att])
            },
            () => {},
          )
        }
      }
      input.click()
      return
    }

    // 📱 移动 App 端：调用原生相机 API
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync()
    if (!permissionResult.granted) {
      Alert.alert('权限不足', '需要相机权限才能拍照，请在设置中开启', [
        { text: '去开启', onPress: () => Linking.openSettings() },
        { text: '取消' },
      ])
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false, // 设为 true 可进行裁剪
      quality: 0.8,
      base64: true,
    })

    if (!result.canceled && result.assets) {
      processPickedAssets(result.assets)
    }
  }

  // 3. 相册选择 (保持不变)
  const openImageLibrary = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.multiple = true
       input.onchange = (e: any) => {
        const files = e.target.files
        if (files && files.length > 0) {
          Array.from(files).forEach((file: any) =>
            readWebFile(
              file,
              (att) => {
                setSelectedAttachments((prev) => [...prev, att])
              },
              () => {},
            ),
          )
        }
      }
      input.click()
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: true,
      allowsMultipleSelection: true,
    })
    if (!result.canceled && result.assets) {
      processPickedAssets(result.assets)
    }
  }

  const clearImages = () => {
    // 发送成功：dataUrl 缓存与「使用中」标记使命结束（文件改由消息引用，不删）
    imageUploadCache.clear()
    imageUploadInUse.clear()
    imageUploadAttempted.clear()
    // ⚠️ 这里刻意不删附件记录：已发送的附件被消息引用（fileRef 落库），
    // 后端对引用中的附件 DELETE 会回 409，且该接口本就只用于「发送前」清理；
    // 附件文件由后端 30 天回收兜底。
    setSelectedAttachments([])
  }

  return {
    /** 兼容旧 API：图片已合并进 attachments，这里返回空 */
    selectedImages: [] as string[],
    setSelectedImages: (() => {}) as any,
    selectedFiles: [] as PickedAttachment[],
    setSelectedFiles: (() => {}) as any,
    handlePickImage,
    clearImages,
    handlePickDocument,
    openCamera, // 👈 导出拍照方法
    openImageLibrary, // 👈 导出选相册方法
    isSheetVisible,
    setIsSheetVisible,
    selectedAttachments, // 👈 统一的附件列表（图片/文档/视频）
    setSelectedAttachments,
  }
}
