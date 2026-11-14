import { useCallback, useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { PickedAttachment } from '../../hooks/useImagePicker'
import { uploadAttachment } from '../../hooks/useImagePicker'
import { MyToast } from '../GlobalToast'

/**
 * 粘贴超长文本 → 输入栏里的 .txt 附件卡片。
 *
 * 收益是交互形态（输入框不再被一堵字占满、可预览/删除/复用），不是省 token：
 * 附件走 /chat/attachment + attachmentIds，后端整份抽文本进本轮上下文，
 * 转换前后模型看到的内容不变，只是 query 从「全文」变成「用户另写的短指令」。
 *
 * ⚠️ 三端拦截方式不同：
 *  - Web 有 paste 事件，直接 preventDefault，长文本根本不进 textarea；
 *  - 原生 TextInput 没有 onPaste，靠 onChangeText 检测「一次性插入的大段文本」。
 */

/** 字符数阈值：低于这个量级（一篇短文/一段代码）粘进来就变卡片反而打断 */
export const LONG_TEXT_MIN_CHARS = 10000
/** 行数阈值：多行的代码/日志即使字数不多，也会把输入框撑得很高 */
export const LONG_TEXT_MIN_LINES = 120

export function shouldBecomeFile(text: string): boolean {
  if (text.length >= LONG_TEXT_MIN_CHARS) return true
  let lines = 1
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines++
      if (lines >= LONG_TEXT_MIN_LINES) return true
    }
  }
  return false
}

/** 文件名取内容首个非空行（截图里的「我这边没法直接调用」），去掉 markdown 标记与非法字符 */
function deriveFileName(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim()) || ''
  const cleaned = firstLine
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/^```.*$/, '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '')
    .trim()
    .slice(0, 24)
  return `${cleaned || '粘贴的长文本'}.txt`
}

/** 纯 JS 算 UTF-8 字节数：原生端没有可靠的 TextEncoder，Blob.size 也不能同步拿 */
function utf8Bytes(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i) ?? 0
    if (cp <= 0x7f) n += 1
    else if (cp <= 0x7ff) n += 2
    else if (cp <= 0xffff) n += 3
    else {
      n += 4
      i++ // 代理对的低位已在 codePointAt 里算过
    }
  }
  return n
}

/** 字符串 → PickedAttachment：Web 用 Blob，原生存 cacheDirectory 临时文件 */
async function makeTextAttachment(text: string): Promise<PickedAttachment> {
  const name = deriveFileName(text)
  const stamp = Date.now()
  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    return {
      // Web 端 postMultipart / FilePreviewer 都优先用 blob，uri 只是唯一占位
      uri: `longtext-${stamp}`,
      kind: 'file',
      name,
      mime: 'text/plain',
      blob,
      size: blob.size || utf8Bytes(text),
      uploading: true
    }
  }
  // 与 api.downloadAttachment 同款：legacy 模块动态 require，避免顶层加载
  const FS: any = require('expo-file-system/legacy')
  const dir = FS.cacheDirectory
  if (!dir) throw new Error('设备缓存目录不可用，无法生成文本文件')
  const uri = `${dir}longtext-${stamp}.txt`
  await FS.writeAsStringAsync(uri, text, { encoding: FS.EncodingType.UTF8 })
  return {
    uri,
    kind: 'file',
    name,
    mime: 'text/plain',
    size: utf8Bytes(text),
    uploading: true
  }
}

export function useLongTextAsFile({
  inputRef,
  inputText,
  setInputText,
  setAttachments,
  enabled
}: {
  inputRef: MutableRefObject<any>
  inputText: string
  setInputText: (text: string) => void
  setAttachments: Dispatch<SetStateAction<PickedAttachment[]>>
  /** TextInput 是否挂载（语音模式下不挂载，监听要等切回文字模式再注册） */
  enabled: boolean
}) {
  /** paste 回调里拿最新的输入框内容，避免 effect 闭包停在首帧 */
  const inputTextRef = useRef(inputText)
  inputTextRef.current = inputText

  /** 生成卡片并「选中即上传」（复用现有附件链路，发送时 id 必定就绪） */
  const convert = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        const att = await makeTextAttachment(text)
        setAttachments((prev) => [...prev, att])
        uploadAttachment(att, setAttachments)
        return true
      } catch (e: any) {
        MyToast.show(e?.message || '长文本转文件失败，请重试')
        return false
      }
    },
    [setAttachments]
  )

  // ── Web：paste 事件里直接拦下，长文本不进 textarea ──────────────────
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || !inputRef.current) return
    const el = inputRef.current
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') || ''
      if (!shouldBecomeFile(text)) return
      // 剪贴板带图片时交给 useWebImagePaste，别和图片分支抢 preventDefault
      const items = e.clipboardData?.items
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) return
        }
      }
      e.preventDefault()
      void convert(text).then((ok) => {
        // 写文件失败：把文本还回输入框，不能让用户粘的东西凭空消失
        if (!ok) setInputText(`${inputTextRef.current}${text}`)
      })
    }
    el.addEventListener('paste', onPaste as EventListener)
    return () => el.removeEventListener('paste', onPaste as EventListener)
  }, [enabled, inputRef, convert, setInputText])

  // ── 原生：onChangeText 里识别「一次性插入的大段文本」 ─────────────────
  const handleChangeText = useCallback(
    (next: string) => {
      if (Platform.OS === 'web') {
        // Web 已在 paste 事件里 preventDefault，这里不会有超长增量
        setInputText(next)
        return
      }
      const prev = inputText
      const delta = next.length - prev.length
      // 逐字输入只增 1~2 字，远够不到阈值：直接放行，别每次按键都全量扫前后缀
      if (delta <= 0 || delta < LONG_TEXT_MIN_LINES) {
        setInputText(next)
        return
      }
      // 取公共前后缀，中间那段就是本次插入的内容
      const maxCommon = Math.min(prev.length, next.length)
      let head = 0
      while (head < maxCommon && prev[head] === next[head]) head++
      let tail = 0
      while (
        tail < maxCommon - head &&
        prev[prev.length - 1 - tail] === next[next.length - 1 - tail]
      ) {
        tail++
      }
      const inserted = next.slice(head, next.length - tail)
      if (!shouldBecomeFile(inserted)) {
        setInputText(next)
        return
      }
      // 输入框保留用户原有的短指令（首尾），只把贴进来的长段落抽走
      const reduced = next.slice(0, head) + next.slice(next.length - tail)
      setInputText(reduced)
      void convert(inserted).then((ok) => {
        if (!ok) setInputText(next) // 失败还原，避免吞字
      })
    },
    [inputText, setInputText, convert]
  )

  return handleChangeText
}
