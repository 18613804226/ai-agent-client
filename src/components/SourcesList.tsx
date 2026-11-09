import React, { memo, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { HoverTouchable } from './HoverTouchable'
import { openSourceUrl, sortedWebCitations } from '../utils/citations'

interface SourcesListTheme {
  isDark: boolean
  textMain: string
  textMuted: string
  border: string
  /** 链接色；老 theme 没带时回退主题蓝 */
  sendBtnActive?: string
}

/**
 * 气泡底部的来源列表：正文 [n] 可点角标之外的兜底入口。
 * 只收 kind==='web' 且 url 通过 http(s) 校验的项，按 index 升序。
 *
 * 由调用方保证只在「吐字结束」后挂载 —— 流式期完全不占位，
 * 与 MessageActions 的 ready 同帧出现，不会把气泡顶得跳一下。
 */
export const SourcesList = memo(function SourcesList({
  sources,
  theme
}: {
  sources: unknown
  theme: SourcesListTheme
}) {
  const items = useMemo(() => sortedWebCitations(sources), [sources])
  if (items.length === 0) return null

  const linkColor = theme.sendBtnActive || '#4b92ee'
  return (
    <View style={[styles.wrap, { borderTopColor: theme.border }]}>
      <Text style={[styles.heading, { color: theme.textMuted }]}>
        来源 · {items.length}
      </Text>
      {items.map((s) => (
        <HoverTouchable
          key={s.index}
          style={styles.row}
          onPress={() => openSourceUrl(s.url)}
          accessibilityRole="link"
          accessibilityLabel={s.title}
          hoverBg={theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}
        >
          <Text style={[styles.index, { color: linkColor }]}>[{s.index}]</Text>
          <Text
            style={[styles.title, { color: linkColor }]}
            numberOfLines={1}
          >
            {s.title}
          </Text>
          {s.publishedDate ? (
            <Text
              style={[styles.date, { color: theme.textMuted }]}
              numberOfLines={1}
            >
              {s.publishedDate}
            </Text>
          ) : null}
        </HoverTouchable>
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  heading: {
    fontSize: 11,
    marginBottom: 3
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    borderRadius: 4
  },
  index: {
    fontSize: 12,
    marginRight: 6
  },
  title: {
    flexShrink: 1,
    fontSize: 12
  },
  date: {
    flexShrink: 0,
    fontSize: 10,
    marginLeft: 6,
    maxWidth: 92
  }
})
