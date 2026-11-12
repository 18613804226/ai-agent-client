import { Linking } from 'react-native'
import { MyToast } from '../components/GlobalToast'

/**
 * `sources` 帧 / 历史 `messages[].sources` 的单条结构。
 * web 来源：kind/index/title/url/publishedDate；知识库来源：fileId/fileName
 * （历史回显里知识库来源还会多 currentlyEnabled / currentStatus）。
 */
export interface ChatSource {
  kind?: 'web'
  index?: number
  title?: string
  url?: string
  publishedDate?: string
  usedInThisReply?: boolean
  fileId?: string
  fileName?: string
  currentlyEnabled?: boolean
  currentStatus?: string
}

/** 过滤后、真正能点的一条 web 角标 */
export interface WebCitation {
  index: number
  url: string
  title: string
  /** 只做字符串展示，不 parse（Tavily 是 YYYY-MM-DD，博查是 ISO 时间戳） */
  publishedDate?: string
}

export type CitationMap = ReadonlyMap<number, WebCitation>

/** 流式期用的空映射：模块级常量，保证 rules 引用稳定、不触发块重渲染 */
export const EMPTY_CITATIONS: CitationMap = new Map()

/** 服务端已用 new URL() 过滤过，客户端再挡一次 javascript: / data: */
export function isSafeHttpUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const u = new URL(trimmed)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    // 个别 Hermes 版本没有 URL 构造器：前缀校验已足够挡住非 http(s) 协议
    return true
  }
}

/**
 * 只取 `kind === 'web' && url` 的项做角标；index 从 1 开始、最多 10 条。
 * 知识库来源没有 kind/index/url，正文对应的是【来源：xxx】，绝不能拿来做角标。
 */
export function webCitations(sources: unknown): CitationMap {
  const map = new Map<number, WebCitation>()
  if (!Array.isArray(sources)) return map
  for (const s of sources) {
    if (!s || typeof s !== 'object') continue
    if ((s as ChatSource).kind !== 'web') continue
    const index = (s as ChatSource).index
    if (!Number.isInteger(index) || (index as number) < 1 || (index as number) > 10)
      continue
    const url = (s as ChatSource).url
    if (!isSafeHttpUrl(url)) continue
    const rawTitle = (s as ChatSource).title
    const rawDate = (s as ChatSource).publishedDate
    map.set(index as number, {
      index: index as number,
      url: url.trim(),
      title: typeof rawTitle === 'string' && rawTitle ? rawTitle : url.trim(),
      ...(typeof rawDate === 'string' && rawDate
        ? { publishedDate: rawDate }
        : {})
    })
  }
  return map
}

/** 气泡底部兜底来源列表：按 index 升序 */
export function sortedWebCitations(sources: unknown): WebCitation[] {
  return Array.from(webCitations(sources).values()).sort(
    (a, b) => a.index - b.index
  )
}

/** 帧数据归一化成不可变数组；非法结构 / 空数组都安全返回 [] */
export function normalizeSources(sources: unknown): ChatSource[] {
  if (!Array.isArray(sources)) return []
  return sources
    .filter((s): s is ChatSource => !!s && typeof s === 'object')
    .map((s) => ({ ...s }))
}

export interface CitationSegment {
  text: string
  url?: string
}

const SUPER_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

/**
 * 把 [n] 显示成 Unicode 上标数字，每个角标前留一个空格：
 * [2][1][0] → " ² ¹ ⁰"，既不贴着正文，也把相邻角标分开。
 *
 * RN 嵌套 <Text> 没有可靠的上标排版：缩字号会贴基线变下标，
 * verticalAlign / transform 在 inline span 上都不生效，只有字符本身可靠。
 * 刻意不加背景色块 —— 原生 inline <Text> 上的背景会变成突兀的小方块。
 *
 * ⚠️ 流式期（纯文本尾巴 + 无 citations 的 rules）与落定期（带链接的
 *    rules）必须都调用它，两边文本一致才不会在吐完那一刻重排。
 * ⚠️ 只用于显示：linkifyCitations 仍按原始 [n] 匹配，不依赖字符形态。
 */
export function toSuperscriptCitations(text: string): string {
  return text.replace(/ ?\[(\d{1,2})\]/g, (_, digits: string) =>
    ` ${Array.from(digits)
      .map((d) => SUPER_DIGITS[Number(d)])
      .join('')}`
  )
}

/**
 * 把一段纯文本切成「文本 / 可点角标」片段。
 * 找不到对应来源的 [n] 保留原文，不做死链（联网降级时正文可能残留角标）。
 */
export function linkifyCitations(
  text: string,
  citations: CitationMap
): CitationSegment[] {
  if (!text || !citations || citations.size === 0) return [{ text }]
  const out: CitationSegment[] = []
  const re = /\[(\d{1,2})\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const hit = citations.get(Number(m[1]))
    if (!hit) continue
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[0], url: hit.url })
    last = m.index + m[0].length
  }
  if (out.length === 0) return [{ text }]
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** 统一跳转入口（角标与来源列表共用），Web 端 Linking.openURL 会映射成 window.open */
export function openSourceUrl(url: string): void {
  if (!isSafeHttpUrl(url)) return
  Linking.openURL(url.trim()).catch(() => {
    MyToast.show('无法打开链接')
  })
}
