import React from 'react'
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native'
import { SheetCardAnim } from './SheetCardAnim'
import { sidebarStyles } from './sidebarStyles'

// ⚠️ 三端统一的二次确认弹窗（文件）
interface ConfirmDeleteDialogProps {
  visible: boolean
  fileName: string
  onCancel: () => void
  onConfirm: () => void
  theme: any
  isDarkMode: boolean
}

export function ConfirmDeleteDialog({
  visible,
  fileName,
  onCancel,
  onConfirm,
  theme,
  isDarkMode
}: ConfirmDeleteDialogProps) {
  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onCancel}
    >
      <View style={sidebarStyles.confirmOverlay}>
        <Pressable style={sidebarStyles.confirmBackdrop} onPress={onCancel} />
        <SheetCardAnim
          style={[
            sidebarStyles.confirmCard,
            {
              backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
              borderColor: theme.border
            }
          ]}
        >
          <Text style={[sidebarStyles.confirmTitle, { color: theme.textMain }]}>
            删除文件
          </Text>
          <Text style={[sidebarStyles.confirmDesc, { color: theme.textMuted }]}>
            确定要删除「{fileName}」吗？删除后将无法恢复。
          </Text>
          <View style={sidebarStyles.confirmBtnRow}>
            <TouchableOpacity
              style={[sidebarStyles.confirmBtn, { backgroundColor: theme.btnBg }]}
              onPress={onCancel}
            >
              <Text style={[sidebarStyles.confirmBtnText, { color: theme.textMain }]}>
                取消
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sidebarStyles.confirmBtn, { backgroundColor: '#ef4444' }]}
              onPress={onConfirm}
            >
              <Text style={[sidebarStyles.confirmBtnText, { color: '#fff' }]}>
                删除
              </Text>
            </TouchableOpacity>
          </View>
        </SheetCardAnim>
      </View>
    </Modal>
  )
}

// ⚠️ 对话删除二次确认弹窗
interface ConfirmDeleteConversationDialogProps {
  visible: boolean
  conversationTitle: string
  onCancel: () => void
  onConfirm: () => void
  theme: any
  isDarkMode: boolean
}

export function ConfirmDeleteConversationDialog({
  visible,
  conversationTitle,
  onCancel,
  onConfirm,
  theme,
  isDarkMode
}: ConfirmDeleteConversationDialogProps) {
  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onCancel}
    >
      <View style={sidebarStyles.confirmOverlay}>
        <Pressable style={sidebarStyles.confirmBackdrop} onPress={onCancel} />
        <SheetCardAnim
          style={[
            sidebarStyles.confirmCard,
            {
              backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF',
              borderColor: theme.border
            }
          ]}
        >
          <Text style={[sidebarStyles.confirmTitle, { color: theme.textMain }]}>
            删除对话
          </Text>
          <Text style={[sidebarStyles.confirmDesc, { color: theme.textMuted }]}>
            确定要删除「{conversationTitle}」吗？删除后将无法恢复。
          </Text>
          <View style={sidebarStyles.confirmBtnRow}>
            <TouchableOpacity
              style={[sidebarStyles.confirmBtn, { backgroundColor: theme.btnBg }]}
              onPress={onCancel}
            >
              <Text style={[sidebarStyles.confirmBtnText, { color: theme.textMain }]}>
                取消
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sidebarStyles.confirmBtn, { backgroundColor: '#ef4444' }]}
              onPress={onConfirm}
            >
              <Text style={[sidebarStyles.confirmBtnText, { color: '#fff' }]}>
                删除
              </Text>
            </TouchableOpacity>
          </View>
        </SheetCardAnim>
      </View>
    </Modal>
  )
}
