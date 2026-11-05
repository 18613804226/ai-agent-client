import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  Text,
  View
} from 'react-native'
import { InputBarIcon } from '../InputBarIcon'
import { HoverTouchable } from '../HoverTouchable'
import { api } from '../../services/api'
import {
  forgetImageUpload,
  retryImageUpload,
  retryAttachmentUpload,
  type PickedAttachment
} from '../../hooks/useImagePicker'
import { classifyFile, extOf } from '../FilePreviewer'
import { formatFileSize } from '../../hooks/useImagePicker'
import { inputBarStyles } from './inputBarStyles'

/**
 * 附件预览：状态 + 打开/删除逻辑（纯搬运自 ChatInputBar.tsx）。
 * 删除按类型走不同通道：图片清本地预传缓存；文档/视频删服务端文件。
 */
export function useAttachmentPreview(
  attachments: PickedAttachment[],
  setAttachments: React.Dispatch<React.SetStateAction<PickedAttachment[]>>
) {
  /** 非 null = 当前正在预览第几张已选图片*/
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  /** 非 null = 正在应用内真预览的文件（弹层渲染，不再 window.open 变下载） */
  const [previewFile, setPreviewFile] = useState<PickedAttachment | null>(null)
  const closeFilePreview = useCallback(() => setPreviewFile(null), [])

  const handleRemoveAttachment = useCallback(
    (index: number) => {
      const target = attachments[index]
      if (!target) return
      // 图片：忘掉预传缓存（本地）；服务端 uploads 文件的删除需后端提供接口
      if (target.kind === 'image') {
        forgetImageUpload(target.uri)
      }
      // 文档/视频：已预传的顺手删服务端文件（DELETE /chat/attachments/:fileRef
      // = uuid.ext；裸 uploadId 会被 400「非法文件名」拒绝）；还在传/失败的没有
      // fileRef → 留给服务端 TTL / 30 天回收清
      else if (target.uploadFileRef) {
        api.deleteChatAttachment(target.uploadFileRef).catch(() => { })
      }
      setAttachments(attachments.filter((_, i) => i !== index))
    },
    [attachments, setAttachments]
  )

  /**
   * 点附件 → 按类型走同一套「应用内真预览」：
   * 图片进全屏 ImageViewer（缩放手势 + 翻页）；表格与 PDF 进 FilePreviewer
   * 应用内渲染（PDF 走 react-native-pdf，表格可调 /chat/excel/check 查错）；
   * web 端任何类型都进预览器。只有音视频等仍无本地渲染器的，才交系统应用。
   */
  const handleOpenAttachment = useCallback(
    (att: PickedAttachment) => {
      // 选中即上传：失败的点一下就地重传（成功后 chip 状态自愈），先不进预览
      if (att.uploadError) {
        if (att.kind === 'image') {
          retryImageUpload(att, setAttachments)
        } else {
          retryAttachmentUpload(att, setAttachments)
        }
        return
      }
      const kind = classifyFile(att)
      // 图片走全屏 ImageViewer（缩放手势 + 翻页）：索引要在「仅图片」列表里
      if (kind === 'image') {
        const idx = attachments
          .filter((a) => a.kind === 'image')
          .findIndex((a) => a === att)
        if (idx >= 0) {
          setPreviewIndex(idx)
          return
        }
      }
      // 表格 / PDF / 文本进 FilePreviewer 应用内真预览（PDF 走 react-native-pdf，
      // 文本走 expo-file-system 读文件，表格可调 /chat/excel/check 查错）；
      // web 端任何类型都进预览器
      if (
        kind === 'sheet' ||
        kind === 'pdf' ||
        kind === 'text' ||
        Platform.OS === 'web'
      ) {
        setPreviewFile(att)
        return
      }
      Linking.openURL(att.uri).catch(() => {
        Alert.alert(
          '无法预览',
          att.name
            ? `系统没有能打开「${att.name}」的应用`
            : '系统没有能打开该文件的应用'
        )
      })
    },
    // ⚠️ 必须带上 attachments：setAttachments 是稳定的 state setter，
    //    只写它的话这个回调永远停在首帧的闭包上（attachments 恒为 []），
    //    图片缩略图就再也找不到自己的索引 → 掉进 Linking 报「无法预览」。
    [attachments, setAttachments]
  )

  return {
    previewIndex,
    setPreviewIndex,
    previewFile,
    closeFilePreview,
    handleOpenAttachment,
    handleRemoveAttachment
  }
}

/**
 * 附件预览列表（横向）：图片缩略图 + 文档/视频 chip（图标 + 名称 + 大小）。
 * 上传状态用遮罩 + 转圈表达；删除按钮直接盖在右上角。
 */
export function AttachmentPreviewList({
  attachments,
  theme,
  onOpen,
  onRemove
}: {
  attachments: PickedAttachment[]
  theme: any
  onOpen: (att: PickedAttachment) => void
  onRemove: (index: number) => void
}) {
  const isWeb = Platform.OS === 'web'
  const [hoveredThumb, setHoveredThumb] = useState<number | null>(null)
  const webHoverBgStrong = theme.isDark
    ? 'rgba(255, 255, 255, 0.14)'
    : 'rgba(0, 0, 0, 0.08)'

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={inputBarStyles.previewContainer}
      contentContainerStyle={inputBarStyles.previewContentContainer}
    >
      {attachments.map((att, index) =>
        att.kind === 'image' ? (
          /* 图片：缩略图（与原图片逻辑一致） */
          <View
            key={`img-${index}`}
            style={[
              inputBarStyles.previewItem,
              { backgroundColor: theme.btnBg, borderColor: theme.border },
              // 🖥️ Web：悬停时整块缩略图轻微放大 + 投影
              isWeb &&
              ({
                transitionProperty: 'transform, box-shadow',
                transitionDuration: '0.15s',
                transitionTimingFunction: 'ease'
              } as any),
              isWeb && hoveredThumb === index
                ? {
                  transform: [{ scale: 1.05 }],
                  zIndex: 2,
                  boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.45)'
                }
                : null
            ]}
          >
            <HoverTouchable
              activeOpacity={0.85}
              rippleColor="rgba(255, 255, 255, 0.35)"
              onPress={() => onOpen(att)}
              style={inputBarStyles.previewImageTap}
              onMouseEnter={() => setHoveredThumb(index)}
              onMouseLeave={() =>
                setHoveredThumb((v) => (v === index ? null : v))
              }
            >
              <Image
                source={{ uri: att.uri }}
                style={inputBarStyles.previewImage}
              />
            </HoverTouchable>
            {/* 传输状态：遮罩 + 转圈直接盖在预览小图上 */}
            {att.uploading ? (
              <View
                style={[
                  inputBarStyles.uploadMask,
                  { backgroundColor: theme.btnBg, pointerEvents: 'none' }
                ]}
              >
                <ActivityIndicator size="small" color={theme.textMuted} />
              </View>
            ) : att.uploadError ? (
              <View
                style={[
                  inputBarStyles.uploadMaskError,
                  { backgroundColor: theme.btnBg, pointerEvents: 'none' }
                ]}
              >
                <InputBarIcon name="alert-circle" size={20} color="#ef4444" />
              </View>
            ) : null}
            <HoverTouchable
              style={inputBarStyles.deleteBadge}
              hoverBg="rgba(255, 255, 255, 0.22)"
              rippleColor="rgba(255, 255, 255, 0.35)"
              onPress={() => onRemove(index)}
              hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
            >
              <Text style={inputBarStyles.deleteBadgeText}>✕</Text>
            </HoverTouchable>
          </View>
        ) : (
          /* 文档/视频：文件 chip（图标 + 名称 + 大小），点击进应用内真预览 */
          <View
            key={`${att.name ?? 'file'}-${index}`}
            style={[
              inputBarStyles.fileChip,
              // 底色/描边跟随主题：写死的浅灰在暗色主题下就是一块白
              { backgroundColor: theme.btnBg, borderColor: theme.border }
            ]}
          >
            <HoverTouchable
              activeOpacity={0.85}
              rippleColor="rgba(255, 255, 255, 0.35)"
              onPress={() => onOpen(att)}
              disabled={att.uploading}
              hoverBg={webHoverBgStrong}
              style={inputBarStyles.fileChipTap}
            >
              <View
                style={[inputBarStyles.fileExtBox, { borderColor: theme.border }]}
              >
                <Text
                  style={[inputBarStyles.fileExtText, { color: theme.textMain }]}
                >
                  {extOf(att.name, att.mime)}
                </Text>
              </View>
              <View style={inputBarStyles.fileChipMeta}>
                <Text
                  numberOfLines={1}
                  style={[inputBarStyles.fileChipName, { color: theme.textMain }]}
                >
                  {att.name || '未命名文件'}
                </Text>
                {/* 就绪后才显示大小；上传中/失败由遮罩 + 转圈表达，不堆文字 */}
                {!att.uploading && !att.uploadError ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      inputBarStyles.fileChipSize,
                      { color: theme.textMuted }
                    ]}
                  >
                    {formatFileSize(att.size) || '文档'}
                  </Text>
                ) : null}
              </View>
            </HoverTouchable>
            {/* 传输状态：遮罩 + 转圈盖住整块 chip */}
            {att.uploading ? (
              <View
                style={[
                  inputBarStyles.uploadMask,
                  { backgroundColor: theme.btnBg, pointerEvents: 'none' }
                ]}
              >
                <ActivityIndicator size="small" color={theme.textMuted} />
              </View>
            ) : att.uploadError ? (
              <View
                style={[
                  inputBarStyles.uploadMaskError,
                  { backgroundColor: theme.btnBg, pointerEvents: 'none' }
                ]}
              >
                <InputBarIcon name="alert-circle" size={20} color="#ef4444" />
                <Text style={inputBarStyles.uploadMaskErrorText}>重试</Text>
              </View>
            ) : null}
            <HoverTouchable
              style={inputBarStyles.deleteBadge}
              hoverBg="rgba(255, 255, 255, 0.22)"
              rippleColor="rgba(255, 255, 255, 0.35)"
              onPress={() => onRemove(index)}
              hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
            >
              <Text style={inputBarStyles.deleteBadgeText}>✕</Text>
            </HoverTouchable>
          </View>
        )
      )}
    </ScrollView>
  )
}
