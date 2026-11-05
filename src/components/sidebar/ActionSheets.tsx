import React from 'react'
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SheetCardAnim } from './SheetCardAnim'
import { CTX_CARD_H, CTX_CARD_W, sidebarStyles } from './sidebarStyles'

// 📱 移动端 / H5 端：长按文件后在当前位置弹出的小型操作菜单。
// 直接渲染在侧边栏根容器内（与文件项同一坐标系），不再用独立 Modal，避免坐标系偏差。
interface FileActionSheetProps {
  fileName: string
  /** 相对侧边栏根容器的位置 */
  x: number
  y: number
  rootW: number
  rootH: number
  onCancel: () => void
  onDelete: () => void
  theme: any
  isDarkMode: boolean
}

export function FileActionSheet({
  fileName,
  x,
  y,
  rootW,
  rootH,
  onCancel,
  onDelete,
  theme,
  isDarkMode
}: FileActionSheetProps) {
  // 优先向触摸点右下方展开；靠近右/下边缘时翻转到左/上方，
  // 保证菜单完整可见且始终贴着手指
  const left = x + CTX_CARD_W > rootW - 8 ? Math.max(8, x - CTX_CARD_W) : x
  const top = y + CTX_CARD_H > rootH - 8 ? Math.max(8, y - CTX_CARD_H) : y

  return (
    <View style={sidebarStyles.sheetOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <SheetCardAnim
        style={[
          sidebarStyles.sheetCard,
          {
            left,
            top,
            backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
            borderColor: theme.border
          }
        ]}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Text
            style={[sidebarStyles.sheetTitle, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {fileName}
          </Text>
          <TouchableOpacity style={sidebarStyles.sheetItem} onPress={onDelete}>
            <Text style={[sidebarStyles.sheetItemText, { color: '#ef4444' }]}>
              删除
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={sidebarStyles.sheetItem} onPress={onCancel}>
            <Text style={[sidebarStyles.sheetItemText, { color: theme.textMain }]}>
              取消
            </Text>
          </TouchableOpacity>
        </Pressable>
      </SheetCardAnim>
    </View>
  )
}

// 📱 移动端 / H5 端：长按对话后在当前位置弹出的小型操作菜单
interface ConversationActionSheetProps {
  conversationTitle: string
  /** 相对侧边栏根容器的位置 */
  x: number
  y: number
  rootW: number
  rootH: number
  onCancel: () => void
  onDelete: () => void
  theme: any
  isDarkMode: boolean
}

export function ConversationActionSheet({
  conversationTitle,
  x,
  y,
  rootW,
  rootH,
  onCancel,
  onDelete,
  theme,
  isDarkMode
}: ConversationActionSheetProps) {
  const left = x + CTX_CARD_W > rootW - 8 ? Math.max(8, x - CTX_CARD_W) : x
  const top = y + CTX_CARD_H > rootH - 8 ? Math.max(8, y - CTX_CARD_H) : y

  return (
    <View style={sidebarStyles.sheetOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <SheetCardAnim
        style={[
          sidebarStyles.sheetCard,
          {
            left,
            top,
            backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
            borderColor: theme.border
          }
        ]}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Text
            style={[sidebarStyles.sheetTitle, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {conversationTitle}
          </Text>
          <TouchableOpacity style={sidebarStyles.sheetItem} onPress={onDelete}>
            <Text style={[sidebarStyles.sheetItemText, { color: '#ef4444' }]}>
              删除
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={sidebarStyles.sheetItem} onPress={onCancel}>
            <Text style={[sidebarStyles.sheetItemText, { color: theme.textMain }]}>
              取消
            </Text>
          </TouchableOpacity>
        </Pressable>
      </SheetCardAnim>
    </View>
  )
}
