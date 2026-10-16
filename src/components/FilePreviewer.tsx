import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { formatFileSize, type PickedAttachment } from '../hooks/useImagePicker';
import { MONO_FONT } from './markdown/markdownRules';
import {
  attachCellRefs,
  focusSheetCell,
  officePreviewSupported,
  renderDocxPreview,
  spreadsheetToHtml,
} from '../utils/officePreview';
import { api, type ExcelCheckResult, type ExcelFinding } from '../services/api';
import { baseURL } from '../services/api';
import { MyToast } from './GlobalToast';
import PdfView from './PdfView';

/**
 * 应用内文件真预览。
 *
 * 为什么不用 window.open：浏览器对多数类型（docx/xlsx/zip…）不内联渲染，
 * 开新标签 = 直接触发下载；data: URL 还会被 Chrome 拦截
 * （「预览怎么是下载」的根因）。这里改为在应用内按类型真正渲染：
 *   - PDF    → <iframe> 内嵌浏览器自带 PDF 阅读器（可滚动缩放）
 *   - 文本   → 直接读 File / data URL 内容，等宽字体滚动展示
 *   - 图片   → <Image> contain 展示
 *   - 音视频 → <audio> / <video> 播放
 *   - docx  → docx-preview 语义化渲染（分页 / 表格 / 图片）
 *   - 表格  → SheetJS 解析成 HTML（多工作表、超长截断）
 * 全部落在跟随主题的卡片里（不再是浏览器白底）。浏览器确实渲染不了的格式
 * 才回落到「下载」面板并如实说明，不再假装是预览。
 */

export type FilePreviewKind =
  | 'image'
  | 'pdf'
  | 'text'
  | 'audio'
  | 'video'
  | 'docx'
  | 'sheet'
  | 'unknown';

/** 按扩展名判定为纯文本的后缀（mime 缺失时兜底：Chrome 对 .md/.ts 等常给空 mime） */
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less',
  'html', 'htm', 'xml', 'csv', 'tsv', 'log', 'yml', 'yaml', 'ini', 'cfg', 'conf',
  'sh', 'bash', 'bat', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'go', 'rs', 'rb',
  'php', 'sql', 'env', 'toml', 'properties', 'vue', 'svelte', 'diff', 'patch',
]);

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'heic', 'heif',
]);

/** .doc / .docx 走后端 /html 接口转纯文本；旧版 .ppt/.xls 等二进制格式仍归 unknown */
const DOCX_EXTS = new Set(['docx', 'doc']);
const SHEET_EXTS = new Set(['xlsx', 'xlsm', 'xlsb', 'xls', 'ods']);

/** 文本在线预览上限：超大文件读进来会卡死渲染 */
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

/** 完整小写扩展名（用于分类，不截断） */
function rawExt(name?: string): string {
  if (!name || !name.includes('.')) return '';
  return (name.split('.').pop() ?? '').toLowerCase();
}

/** 取扩展名做角标：优先文件名后缀，退化时按 MIME 兜底 */
export function extOf(name?: string, mime?: string): string {
  const fromName = name?.includes('.')
    ? name.split('.').pop() ?? ''
    : '';
  if (fromName) return fromName.slice(0, 4).toUpperCase();
  const fromMime = mime?.split('/').pop() ?? '';
  return (fromMime || 'FILE').slice(0, 4).toUpperCase();
}

/** 按 MIME + 扩展名判定预览方式 */
export function classifyFile(att: PickedAttachment): FilePreviewKind {
  const mime = (att.mime ?? '').toLowerCase();
  const ext = rawExt(att.name);
  if (mime.startsWith('image/') || IMAGE_EXTS.has(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  // ⚠️ 必须排在下面 includes('xml') 之前：openxmlformats（docx/xlsx）的 mime 含 "xml" 子串
  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    DOCX_EXTS.has(ext)
  ) {
    return 'docx';
  }
  if (
    mime.startsWith('application/vnd.ms-excel') ||
    mime.startsWith(
      'application/vnd.openxmlformats-officedocument.spreadsheetml',
    ) ||
    mime === 'application/vnd.oasis.opendocument.spreadsheet' ||
    SHEET_EXTS.has(ext)
  ) {
    return 'sheet';
  }
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('text/')) return 'text';
  // application/json、application/xml、+xml 等按文本渲染
  if (mime.includes('json') || mime.includes('xml')) return 'text';
  if (TEXT_EXTS.has(ext)) return 'text';
  return 'unknown';
}

const KIND_LABEL: Record<FilePreviewKind, string> = {
  image: '图片',
  pdf: 'PDF 文档',
  text: '纯文本',
  audio: '音频',
  video: '视频',
  docx: 'Word 文档',
  sheet: '电子表格',
  unknown: '暂不支持在线预览',
};

/** 表格 HTML 的主题化样式（拼进 innerHTML 的 <style> 块） */
function sheetCss(theme: any): string {
  return `<style>
    .xl-sheet { margin: 0 0 18px; }
    .xl-sheet-name { font-size: 13px; font-weight: 600; color: ${theme.textMuted}; margin: 0 0 6px; }
    .xl-sheet table.sheet { border-collapse: collapse; font-size: 13px; color: ${theme.textMain}; }
    .xl-sheet table.sheet td,
    .xl-sheet table.sheet th { border: 1px solid ${theme.border}; padding: 4px 8px; white-space: nowrap; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
    .xl-sheet table.sheet tr:nth-child(even) td { background: ${theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}; }
    .xl-empty { color: ${theme.textMuted}; font-size: 12px; }
    /* SheetJS 会把超链接单元格(如邮箱/网址)输出成 <a>，浏览器默认是亮蓝色，
       在深色表格里很突兀。这里让链接文字继承单元格颜色，悬停时才显示下划线。 */
    .xl-sheet table.sheet a,
    .xl-sheet table.sheet a:visited { color: inherit; text-decoration: none; }
    .xl-sheet table.sheet a:hover { text-decoration: underline; }
    /* 表格横向/纵向滚动条适配主题（浏览器默认是亮色，深色下很突兀） */
    .xl-host { scrollbar-width: thin; scrollbar-color: ${theme.isDark ? '#4A4B4D' : '#C4C4C4'} transparent; }
    .xl-host::-webkit-scrollbar { width: 10px; height: 10px; }
    .xl-host::-webkit-scrollbar-track { background: ${theme.isDark ? '#151618' : '#F0F4F9'}; border-radius: 5px; }
    .xl-host::-webkit-scrollbar-thumb { background: ${theme.isDark ? '#4A4B4D' : '#C4C4C4'}; border-radius: 5px; }
    .xl-host::-webkit-scrollbar-thumb:hover { background: ${theme.isDark ? '#5A5B5D' : '#A8A8A8'}; }
    .xl-host::-webkit-scrollbar-corner { background: transparent; }
    /* 查错定位：目标单元格蓝色脉冲闪烁（focusSheetCell 加 .cell-flash） */
    .cell-flash { animation: xlFlash 0.8s ease-in-out 3; }
    @keyframes xlFlash {
      0%, 100% { box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0); }
      25% { box-shadow: inset 0 0 0 2px #3b82f6; }
    }
  </style>`;
}

/** data:URL → 文本（base64 走 UTF-8 解码，避免中文乱码） */
function decodeDataUrl(uri: string): string {
  const comma = uri.indexOf(',');
  if (comma < 0) return '';
  const head = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  if (/;base64/i.test(head)) {
    const bin = atob(payload);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
  return decodeURIComponent(payload);
}

/** HTML → 纯文本：后端 /html 接口返回的是「几乎没有标签的文本 HTML」，简单去标签即可 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<h[1-6][^>]*>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Web 端真实渲染用的原生 HTML 标签。用 any 承接字符串标签绕开 JSX
 * intrinsic 类型（RN 项目没有 DOM intrinsic 声明），且只在 web 分支渲染。
 */
const IframeTag: any = 'iframe';
const AudioTag: any = 'audio';
const VideoTag: any = 'video';
const DivTag: any = 'div';

export interface FilePreviewerProps {
  /** 当前预览的文件；null = 关闭 */
  att: PickedAttachment | null;
  theme: any;
  onClose: () => void;
}

export function FilePreviewer({ att, theme, onClose }: FilePreviewerProps) {
  const kind: FilePreviewKind = att ? classifyFile(att) : 'unknown';
  const isWeb = Platform.OS === 'web';
  const { width, height } = useWindowDimensions();

  /** blob → object URL：换文件 / 关闭时回收，避免内存泄漏 */
  const [srcUrl, setSrcUrl] = useState('');
  useEffect(() => {
    if (!att) {
      setSrcUrl('');
      return;
    }
    if (att.blob && typeof URL !== 'undefined' && URL.createObjectURL) {
      const url = URL.createObjectURL(att.blob);
      setSrcUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setSrcUrl(att.uri);
  }, [att]);

  /** 文本内容读取：内存里的 File 直接读，data: 解码，其余（http/file）走 fetch */
  const [textContent, setTextContent] = useState('');
  // 初值 loading：Modal 淡入的第一帧还没跑 effect，直接显示转圈而不是空面板
  const [textState, setTextState] = useState<
    'idle' | 'loading' | 'error' | 'too-large'
  >('loading');
  useEffect(() => {
    if (!att || kind !== 'text') {
      setTextContent('');
      setTextState('idle');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (att.size && att.size > MAX_TEXT_BYTES) {
          if (!cancelled) setTextState('too-large');
          return;
        }
        if (!cancelled) setTextState('loading');
        let text: string;
        if (att.blob && typeof att.blob.text === 'function') {
          text = await att.blob.text();
        } else if (att.uri.startsWith('data:')) {
          text = decodeDataUrl(att.uri);
        } else if (!isWeb) {
          // 原生：file:// / content:// 用 expo-file-system 读取。
          // RN 的 fetch 不支持 file://（必然失败），必须走文件系统模块。
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const FS: any = require('expo-file-system/legacy');
          text = await FS.readAsStringAsync(att.uri);
        } else {
          const resp = await fetch(att.uri);
          text = await resp.text();
        }
        if (cancelled) return;
        setTextContent(text);
        setTextState('idle');
      } catch {
        if (!cancelled) setTextState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [att, kind]);

  /** Esc 关闭（web） */
  useEffect(() => {
    if (!att || !isWeb) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [att, isWeb, onClose]);

  /** Office（docx / 表格）在线解析：单一 effect 统一管理状态，避免多个 effect 互相踩 */
  const [officeState, setOfficeState] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  const [sheetTruncated, setSheetTruncated] = useState(false);
  const docxHostRef = useRef<any>(null);
  /** 表格宿主：命令式注入 HTML，供查错定位（data-ref + scrollIntoView） */
  const sheetHostRef = useRef<any>(null);
  useEffect(() => {
    if (!officePreviewSupported) return;
    if (!att || (kind !== 'docx' && kind !== 'sheet')) {
      setOfficeState('idle');
      setSheetTruncated(false);
      return;
    }
    let cancelled = false;
    setOfficeState('loading');
    setSheetTruncated(false);

    if (kind === 'docx') {
      // ref 在本次 commit 已挂载（renderBody 对 docx 恒渲染容器 div）
      const host = docxHostRef.current;
      if (!host) return;
      renderDocxPreview(att, host, !!theme.isDark)
        .then(() => {
          if (!cancelled) setOfficeState('idle');
        })
        .catch(() => {
          if (cancelled) return;
          try {
            host.innerHTML = '';
          } catch {}
          setOfficeState('error');
        });
      return () => {
        cancelled = true;
        // 关闭即清空：base64 图片驻留在 DOM 里，别留着占内存
        try {
          host.innerHTML = '';
        } catch {}
      };
    }

    spreadsheetToHtml(att)
      .then((r) => {
        if (cancelled) return;
        const host = sheetHostRef.current;
        if (host) {
          // 命令式注入：查错定位需要真实 DOM（data-ref + scrollIntoView）
          host.innerHTML = sheetCss(theme) + r.html;
          attachCellRefs(host);
        }
        setSheetTruncated(r.truncated);
        setOfficeState('idle');
      })
      .catch(() => {
        if (!cancelled) setOfficeState('error');
      });
    return () => {
      cancelled = true;
      const host = sheetHostRef.current;
      try {
        if (host) host.innerHTML = '';
      } catch {}
    };
  }, [att, kind, theme.isDark]);

  // ==================== 原生端 Office 纯文本预览（GET /chat/attachments/:fileRef/html）====================
  // 后端返回 HTML 文本（docx 几乎无标签，xlsx 返回 HTML 表格）；stripHtmlTags 后渲染。
  // 415 说明格式不支持在线预览，回退到「用其他应用打开」面板。Web 端走 docx-preview/SheetJS 渲染完整格式。
  const [nativeTextContent, setNativeTextContent] = useState('');
  const [nativeTextState, setNativeTextState] = useState<
    'idle' | 'loading' | 'error' | 'unavailable'
  >('idle');
  useEffect(() => {
    if (isWeb || (kind !== 'docx' && kind !== 'sheet') || !att) {
      setNativeTextContent('');
      setNativeTextState('idle');
      return;
    }
    const fileRef =
      att.fileRef ||
      att.uploadFileRef ||
      (att.url ? (att.url.split('/').pop()?.split('?')[0] ?? '') : '');
    if (!fileRef) {
      setNativeTextState('error');
      return;
    }
    let cancelled = false;
    setNativeTextState('loading');
    setNativeTextContent('');
    api
      .getAttachmentHtml(fileRef)
      .then((r) => {
        if (cancelled) return;
        if (r.notSupported) {
          setNativeTextState('unavailable');
          return;
        }
        const html = r.html ?? '';
        const text = stripHtmlTags(html);
        setNativeTextContent(text);
        setNativeTextState('idle');
      })
      .catch(() => {
        if (!cancelled) setNativeTextState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [att, kind, isWeb]);

  // ==================== Excel 查错（POST /chat/excel/check）====================
  // 规则引擎、不走大模型、不占对话配额；结果在底部浮层展示，点条目定位闪烁单元格
  const canCheckExcel = !!att && ['xlsx', 'xls'].includes(rawExt(att.name));
  const [checkState, setCheckState] = useState<
    'idle' | 'loading' | 'done' | 'error'
  >('idle');
  const [checkResult, setCheckResult] = useState<ExcelCheckResult | null>(null);
  const [checkError, setCheckError] = useState('');
  const [showFindings, setShowFindings] = useState(false);

  // 换文件 / 关闭预览时重置查错状态
  useEffect(() => {
    setCheckState('idle');
    setCheckResult(null);
    setCheckError('');
    setShowFindings(false);
  }, [att]);

  const runExcelCheck = async () => {
    if (!att) return;
    setCheckState('loading');
    setCheckResult(null);
    setCheckError('');
    setShowFindings(true);
    try {
      const r = await api.checkExcelFile({
        name: att.name || '未命名文件',
        uri: att.uri,
        blob: att.blob,
        mime: att.mime,
      });
      setCheckResult(r);
      setCheckState('done');
    } catch (e: any) {
      setCheckError(e?.message || '检查失败，请稍后重试');
      setCheckState('error');
    }
  };

  const findingErrors =
    checkResult?.findings.filter((f) => f.severity === 'error') ?? [];
  const findingWarnings =
    checkResult?.findings.filter((f) => f.severity === 'warning') ?? [];

  /** 显式下载（web）：真正预览之外的兜底动作，不再让「打开」悄悄变成下载 */
  const handleDownload = useCallback(() => {
    if (!att || !srcUrl || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = srcUrl;
    a.download = att.name || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [att, srcUrl]);

  /** 原生 / 读不了的文件：交给系统应用打开 */
  const handleOpenExternally = useCallback(async () => {
    if (!att) return;
    const local = att.uri?.startsWith('file://') ? att.uri : '';
    // Android 直接 Linking.openURL(file://) 会抛 FileUriExposedException；
    // 用 expo-file-system 转成 content://（FileProvider）再交给系统
    let externalUri =
      local || (att.url && att.url.startsWith('http') ? att.url : '');
    if (Platform.OS === 'android' && local) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const FS: any = require('expo-file-system/legacy');
        externalUri = await FS.getContentUriAsync(local);
      } catch {}
    }
    if (!externalUri) {
      Alert.alert('无法打开', att.name
        ? `无法获取「${att.name}」的访问链接`
        : '无法获取该文件的访问链接');
      return;
    }
    Linking.openURL(externalUri).catch(() => {
      Alert.alert(
        '无法打开',
        att.name
          ? `系统没有能打开「${att.name}」的应用`
          : '系统没有能打开该文件的应用',
      );
    });
  }, [att]);

  const cardW = Math.min(Math.max(width - 32, 260), 880);
  const cardH = Math.min(Math.max(height - 80, 320), 760);

  const panelBtnStyle = ({ pressed }: { pressed: boolean }) => [
    styles.actionBtn,
    {
      backgroundColor: theme.isDark
        ? 'rgba(255,255,255,0.1)'
        : 'rgba(0,0,0,0.06)',
      opacity: pressed ? 0.7 : 1,
    },
  ];

  /** 原生端没有渲染器（项目未引入 WebView / 文件系统库）时的兜底面板 */
  const externalPanel = (
    <View style={styles.centered}>
      <Feather name="file" size={56} color={theme.textMuted} />
      <Text
        numberOfLines={1}
        style={[styles.panelName, { color: theme.textMain }]}
      >
        {att?.name || '未命名文件'}
      </Text>
      <Text style={[styles.panelHint, { color: theme.textMuted }]}>
        此格式暂不支持应用内预览，可交给系统应用打开
      </Text>
      <Pressable onPress={handleOpenExternally} style={panelBtnStyle}>
        <Feather name="external-link" size={15} color={theme.textMain} />
        <Text style={[styles.actionText, { color: theme.textMain }]}>
          用其他应用打开
        </Text>
      </Pressable>
    </View>
  );

  /** 浏览器渲染不了的格式（docx/xlsx/zip…）：如实告知 + 下载 */
  const unknownPanel = (
    <View style={styles.centered}>
      <Feather name="file" size={56} color={theme.textMuted} />
      <Text
        numberOfLines={1}
        style={[styles.panelName, { color: theme.textMain }]}
      >
        {att?.name || '未命名文件'}
      </Text>
      <Text style={[styles.panelHint, { color: theme.textMuted }]}>
        {extOf(att?.name, att?.mime)} · {formatFileSize(att?.size) || '大小未知'} ·{' '}
        {KIND_LABEL.unknown}
      </Text>
      <Text style={[styles.panelHint, { color: theme.textMuted }]}>
        浏览器无法直接渲染此格式，可下载后用本地应用查看
      </Text>
      <Pressable
        onPress={isWeb ? handleDownload : handleOpenExternally}
        style={panelBtnStyle}
      >
        <Feather
          name={isWeb ? 'download' : 'external-link'}
          size={15}
          color={theme.textMain}
        />
        <Text style={[styles.actionText, { color: theme.textMain }]}>
          {isWeb ? '下载文件' : '用其他应用打开'}
        </Text>
      </Pressable>
    </View>
  );

  /** 文本读取的三种异常态面板 */
  const textPanel = (node: React.ReactNode) => (
    <View style={styles.centered}>
      <Feather name="file-text" size={56} color={theme.textMuted} />
      <Text style={[styles.panelHint, { color: theme.textMuted }]}>{node}</Text>
      <Pressable
        onPress={isWeb ? handleDownload : handleOpenExternally}
        style={panelBtnStyle}
      >
        <Feather
          name={isWeb ? 'download' : 'external-link'}
          size={15}
          color={theme.textMain}
        />
        <Text style={[styles.actionText, { color: theme.textMain }]}>
          {isWeb ? '下载文件' : '用其他应用打开'}
        </Text>
      </Pressable>
    </View>
  );

  /** Office 解析失败的兜底面板（可下载后本地打开） */
  const officeErrorPanel = (
    <View style={styles.centered}>
      <Feather name="alert-circle" size={56} color={theme.textMuted} />
      <Text style={[styles.panelHint, { color: theme.textMuted }]}>
        文档解析失败，可下载后用本地应用查看
      </Text>
      <Pressable onPress={handleDownload} style={panelBtnStyle}>
        <Feather name="download" size={15} color={theme.textMain} />
        <Text style={[styles.actionText, { color: theme.textMain }]}>
          下载文件
        </Text>
      </Pressable>
    </View>
  );

  /** 按类型分发真预览主体 */
  const renderBody = () => {
    // srcUrl 由 effect 生成，首帧可能还是空：统一显示加载态，避免闪一下兜底面板
    const loadingNode = (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.textMuted} />
        <Text style={[styles.panelHint, { color: theme.textMuted }]}>加载中…</Text>
      </View>
    );

    if (kind === 'image') {
      return srcUrl ? (
        <View style={styles.bodyFill}>
          <Image
            source={{ uri: srcUrl }}
            resizeMode="contain"
            style={styles.bodyFill}
          />
        </View>
      ) : (
        loadingNode
      );
    }
    if (kind === 'pdf') {
      // 真预览：web 走 iframe（浏览器自带阅读器）；
      // 原生走 react-native-pdf（iOS PDFKit / Android PdfRenderer）在应用内渲染
      return srcUrl ? (
        <View style={styles.bodyFill}>
          <PdfView src={srcUrl} title={att?.name || 'PDF 预览'} theme={theme} />
        </View>
      ) : (
        loadingNode
      );
    }
    if (kind === 'text') {
      if (textState === 'loading') {
        return (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.textMuted} />
            <Text style={[styles.panelHint, { color: theme.textMuted }]}>
              读取中…
            </Text>
          </View>
        );
      }
      if (textState === 'too-large') {
        return textPanel('文件超过 5MB，暂不支持在线预览');
      }
      if (textState === 'error') {
        return textPanel('内容读取失败');
      }
      return (
        <ScrollView
          style={styles.bodyFill}
          contentContainerStyle={styles.textPad}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            selectable
            style={[
              styles.textContent,
              // 深浅主题都保证对比度：卡片底色是 #151618 / #FFFFFF
              { color: theme.isDark ? '#d4d4d4' : '#1f1f1f' },
            ]}
          >
            {textContent}
          </Text>
        </ScrollView>
      );
    }
    // 原生 docx/sheet：后端 /html 接口转纯文本，渲染在 Text 里（Web 走下面的 docx-preview/SheetJS）
    if (!isWeb && (kind === 'docx' || kind === 'sheet')) {
      if (nativeTextState === 'loading') {
        return (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.textMuted} />
            <Text style={[styles.panelHint, { color: theme.textMuted }]}>
              解析文档中…
            </Text>
          </View>
        );
      }
      if (nativeTextState === 'error') {
        return textPanel('文档解析失败，可交给系统应用打开');
      }
      if (nativeTextState === 'unavailable') {
        return textPanel('此格式暂不支持在线预览，可下载后用本地应用查看');
      }
      return (
        <ScrollView
          style={styles.bodyFill}
          contentContainerStyle={styles.textPad}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            selectable
            style={[
              styles.textContent,
              { color: theme.isDark ? '#d4d4d4' : '#1f1f1f' },
            ]}
          >
            {nativeTextContent}
          </Text>
        </ScrollView>
      );
    }
    if (!isWeb) {
      // 原生：图片 / PDF / 文本 / docx / sheet 已应用内真渲染，其余（音视频等）
      // 没有本地渲染器 → 兜底面板交系统应用打开
      return externalPanel;
    }
    if (kind === 'audio') {
      return srcUrl ? (
        <View style={styles.centered}>
          <AudioTag controls src={srcUrl} style={{ width: '86%' }} />
        </View>
      ) : (
        loadingNode
      );
    }
    if (kind === 'video') {
      return srcUrl ? (
        <View style={styles.centered}>
          <VideoTag
            controls
            playsInline
            src={srcUrl}
            style={{ width: '100%', maxHeight: '100%' }}
          />
        </View>
      ) : (
        loadingNode
      );
    }
    if (kind === 'docx') {
      // 文档本体渲染进真实 DOM 容器；加载/失败用不透明遮罩盖在上面
      const overlayBg = theme.isDark ? '#151618' : '#FFFFFF';
      return (
        <View style={styles.bodyFill}>
          <DivTag
            ref={docxHostRef}
            className="xl-host"
            style={{ flex: 1, height: '100%', overflow: 'auto', padding: 16 }}
          />
          {officeState === 'loading' && (
            <View
              style={[styles.loadingOverlay, { backgroundColor: overlayBg }]}
            >
              <ActivityIndicator color={theme.textMuted} />
              <Text style={[styles.panelHint, { color: theme.textMuted }]}>
                解析文档中…
              </Text>
            </View>
          )}
          {officeState === 'error' && (
            <View
              style={[styles.loadingOverlay, { backgroundColor: overlayBg }]}
            >
              {officeErrorPanel}
            </View>
          )}
        </View>
      );
    }
    if (kind === 'sheet') {
      // ⚠️ 宿主 div 必须常驻：解析完成后靠 ref 命令式注入 innerHTML。
      // 之前 loading 时返回 loadingNode 会卸载宿主 → ref 为空 → 注入丢失（表格空白）。
      const overlayBg = theme.isDark ? '#151618' : '#FFFFFF';
      return (
        <View style={styles.bodyFill}>
          <DivTag
            ref={sheetHostRef}
            className="xl-host"
            style={{ flex: 1, height: '100%', overflow: 'auto', padding: 16 }}
          />
          {sheetTruncated && (
            <View
              style={[
                styles.truncateHint,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.isDark ? '#1E1F20' : '#F0F4F9',
                },
              ]}
              pointerEvents="none"
            >
              <Text style={{ fontSize: 11, color: theme.textMuted }}>
                仅预览每个工作表前 1000 行
              </Text>
            </View>
          )}
          {officeState === 'loading' && (
            <View
              style={[styles.loadingOverlay, { backgroundColor: overlayBg }]}
            >
              <ActivityIndicator color={theme.textMuted} />
              <Text style={[styles.panelHint, { color: theme.textMuted }]}>
                解析表格中…
              </Text>
            </View>
          )}
          {officeState === 'error' && (
            <View
              style={[styles.loadingOverlay, { backgroundColor: overlayBg }]}
            >
              {officeErrorPanel}
            </View>
          )}
        </View>
      );
    }
    return unknownPanel;
  };

  /** 查错浮层内容：loading / 错误 / 分级结果列表 */
  const renderCheckBody = () => {
    if (checkState === 'loading') {
      return (
        <View style={styles.checkLoading}>
          <ActivityIndicator color={theme.textMuted} />
          <Text style={[styles.panelHint, { color: theme.textMuted }]}>
            正在按规则检查（公式错误 / 空值 / 类型 / 重复行 / 离群点）…
          </Text>
        </View>
      );
    }
    if (checkState === 'error') {
      return (
        <View style={styles.checkLoading}>
          <Feather name="alert-circle" size={40} color={theme.textMuted} />
          <Text style={[styles.panelHint, { color: theme.textMuted }]}>
            {checkError}
          </Text>
        </View>
      );
    }
    if (!checkResult) return null;
    const s = checkResult.summary;
    return (
      <ScrollView contentContainerStyle={styles.checkList}>
        <Text style={[styles.checkSummary, { color: theme.textMain }]}>
          {s.total > 0
            ? `共 ${s.total} 项：错误 ${s.errors} · 警告 ${s.warnings}`
            : '未发现公式错误或数据质量问题'}
          {s.truncated ? '（结果已截断，最多 300 条）' : ''}
        </Text>
        <Text style={[styles.checkSheets, { color: theme.textMuted }]}>
          {checkResult.sheets
            .map((sh) => `${sh.name} · ${sh.checkedRows}/${sh.rowCount} 行`)
            .join('　|　')}
        </Text>
        {s.total === 0 ? (
          <View style={styles.checkEmpty}>
            <Feather name="check-circle" size={40} color="#22c55e" />
            <Text style={[styles.panelHint, { color: theme.textMuted }]}>
              各工作表检查通过
            </Text>
          </View>
        ) : (
          <>
            {findingErrors.length > 0 && (
              <Text style={[styles.checkGroupTitle, { color: '#ef4444' }]}>
                错误（{findingErrors.length}）
              </Text>
            )}
            {findingErrors.map((f, i) => renderFinding(f, i))}
            {findingWarnings.length > 0 && (
              <Text style={[styles.checkGroupTitle, { color: '#f59e0b' }]}>
                警告（{findingWarnings.length}）
              </Text>
            )}
            {findingWarnings.map((f, i) => renderFinding(f, i))}
          </>
        )}
      </ScrollView>
    );
  };

  /**
   * 单条 finding：位置 + 原因 + 修复建议。
   * 点击在表格里定位闪烁（data-ref 与后端 cell 对齐）；原生没有 DOM 表格 → 禁用点击。
   */
  const renderFinding = (f: ExcelFinding, idx: number) => {
    const isError = f.severity === 'error';
    return (
      <Pressable
        key={`${f.sheet}-${f.cell}-${f.code}-${idx}`}
        disabled={!isWeb}
        onPress={() => {
          const ok =
            !!sheetHostRef.current &&
            focusSheetCell(sheetHostRef.current, f.sheet, f.cell);
          if (!ok) MyToast.show('预览中未定位到该单元格（可能超出预览范围）');
        }}
        style={({ pressed }) => [
          styles.finding,
          { borderBottomColor: theme.border },
          pressed && isWeb && { opacity: 0.65 },
        ]}
      >
        <Feather
          name={isError ? 'x-circle' : 'alert-triangle'}
          size={15}
          color={isError ? '#ef4444' : '#f59e0b'}
          style={{ marginTop: 2 }}
        />
        <View style={styles.findingBody}>
          <Text style={[styles.findingLoc, { color: theme.textMuted }]}>
            {f.sheet}!{f.cell}
            {f.columnName ? ` · ${f.columnName}` : ''} · {f.code}
            {f.value ? ` · ${f.value}` : ''}
            {f.formula ? ` · ${f.formula}` : ''}
          </Text>
          <Text style={[styles.findingMsg, { color: theme.textMain }]}>
            {f.message}
          </Text>
          {f.suggestion ? (
            <Text style={[styles.findingTip, { color: theme.textMuted }]}>
              建议：{f.suggestion}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={!!att} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* 点遮罩关闭；卡片后渲染，点卡片不会冒泡到这里 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              width: cardW,
              height: cardH,
              backgroundColor: theme.isDark ? '#151618' : '#FFFFFF',
              borderColor: theme.border,
            },
          ]}
        >
          {/* 头部：扩展名角标 + 文件名 + 下载 + 关闭 */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View
              style={[
                styles.extBadge,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.06)',
                },
              ]}
            >
              <Text style={[styles.extBadgeText, { color: theme.textMain }]}>
                {extOf(att?.name, att?.mime)}
              </Text>
            </View>
            <View style={styles.headerMeta}>
              <Text
                numberOfLines={1}
                style={[styles.fileName, { color: theme.textMain }]}
              >
                {att?.name || '未命名文件'}
              </Text>
              <Text style={[styles.fileSub, { color: theme.textMuted }]}>
                {formatFileSize(att?.size) || '大小未知'} · {KIND_LABEL[kind]}
              </Text>
            </View>
            {canCheckExcel && (
              <Pressable
                onPress={() => {
                  if (checkState === 'loading') return;
                  runExcelCheck();
                }}
                hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
                style={({ pressed }) => [
                  styles.checkBtn,
                  {
                    borderColor: theme.border,
                    backgroundColor: checkResult
                      ? theme.isDark
                        ? 'rgba(75,146,238,0.18)'
                        : 'rgba(75,146,238,0.12)'
                      : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                {checkState === 'loading' ? (
                  <ActivityIndicator size="small" color={theme.textMuted} />
                ) : (
                  <>
                    <Feather
                      name="search"
                      size={13}
                      color={checkResult ? '#4b92ee' : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.checkBtnText,
                        { color: checkResult ? '#4b92ee' : theme.textMuted },
                      ]}
                    >
                      查错{checkResult ? ` ${checkResult.summary.total}` : ''}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
            {isWeb && (
              <Pressable
                onPress={handleDownload}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                style={({ pressed }) => [
                  styles.headerBtn,
                  pressed && { backgroundColor: 'rgba(128,128,128,0.18)' },
                ]}
              >
                <Feather name="download" size={17} color={theme.textMuted} />
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              style={({ pressed }) => [
                styles.headerBtn,
                pressed && { backgroundColor: 'rgba(128,128,128,0.18)' },
              ]}
            >
              <Feather name="x" size={18} color={theme.textMain} />
            </Pressable>
          </View>

          {/* 主体：按类型真预览 + Excel 查错底部浮层 */}
          <View style={styles.bodyFill}>
            {renderBody()}
            {canCheckExcel && (checkState === 'loading' || showFindings) && (
              <View
                style={[
                  styles.checkPanel,
                  {
                    backgroundColor: theme.isDark ? '#1E1F20' : '#F7F9FC',
                    borderColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkPanelHead,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.checkPanelTitle, { color: theme.textMain }]}
                  >
                    Excel 查错
                    {checkResult ? ` · ${checkResult.fileName}` : ''}
                  </Text>
                  <Pressable
                    onPress={() => setShowFindings(false)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    style={({ pressed }) => [
                      styles.headerBtn,
                      pressed && { backgroundColor: 'rgba(128,128,128,0.18)' },
                    ]}
                  >
                    <Feather name="chevron-down" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
                {renderCheckBody()}
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default FilePreviewer;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    // 深色遮罩：阅读类内容需要高对比，也彻底告别「浏览器白底」
    backgroundColor: 'rgba(0,0,0,0.86)',
  },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    boxShadow: '0px 10px 24px rgba(0, 0, 0, 0.45)',
    elevation: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  extBadge: {
    minWidth: 34,
    height: 26,
    borderRadius: 6,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  extBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  headerMeta: {
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
  },
  fileSub: {
    fontSize: 11,
    marginTop: 1,
  },
  headerBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  bodyFill: {
    flex: 1,
    overflow: 'hidden',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  panelName: {
    fontSize: 15,
    fontWeight: '600',
    maxWidth: '100%',
  },
  panelHint: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    marginTop: 4,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  checkBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /** 查错结果：贴底浮层（表格仍在上方可见，方便点条目定位） */
  checkPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '62%',
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  checkPanelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkPanelTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  checkLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  checkList: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  checkSummary: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  checkSheets: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  checkGroupTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 2,
  },
  finding: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  findingBody: {
    flex: 1,
    gap: 2,
  },
  findingLoc: {
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  findingMsg: {
    fontSize: 13,
    lineHeight: 19,
  },
  findingTip: {
    fontSize: 12,
    lineHeight: 17,
  },
  checkEmpty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 22,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  truncateHint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    // 底色/描边由调用处按主题注入
  },
  textPad: {
    padding: 16,
  },
  textContent: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 20,
    // 具体颜色由调用处按主题注入（深 #d4d4d4 / 浅 #1f1f1f）
    color: '#d4d4d4',
  },
});


