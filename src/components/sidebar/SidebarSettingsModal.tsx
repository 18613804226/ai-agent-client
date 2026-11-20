import React from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { RADIUS, SEMANTIC_COLORS } from '../../constants/theme'
import type { RoleMode, ThemeMode } from '../../context/appContexts'
import type { AuthDevice } from '../../services/authStore'
import HoverTouchable from '../HoverTouchable'
import { InputBarIcon } from '../InputBarIcon'
import { SheetCardAnim } from './SheetCardAnim'
import { sidebarStyles } from './sidebarStyles'

interface SidebarSettingsModalProps {
  visible: boolean
  onClose: () => void
  theme: any
  isDarkMode: boolean
  themeMode: ThemeMode
  onThemeModeChange: (mode: ThemeMode) => void
  role: RoleMode
  effectiveRole: RoleMode
  pendingRole: RoleMode | null
  device: AuthDevice | null
  onSwitchToAdmin: () => Promise<void>
  onSwitchToUser: () => Promise<void>
  onOpenAdmin: () => void
}

const APPEARANCE_OPTIONS = [
  { mode: 'light' as const, label: '浅色', icon: 'sun' as const },
  { mode: 'dark' as const, label: '深色', icon: 'moon' as const },
  { mode: 'system' as const, label: '跟随系统', icon: 'monitor' as const }
]

export function SidebarSettingsModal({
  visible,
  onClose,
  theme,
  isDarkMode,
  themeMode,
  onThemeModeChange,
  role,
  effectiveRole,
  pendingRole,
  device,
  onSwitchToAdmin,
  onSwitchToUser,
  onOpenAdmin
}: SidebarSettingsModalProps) {
  if (!visible) return null

  const primaryColor = theme.primary ?? theme.sendBtnActive ?? '#2F7DE1'
  const primarySoft =
    theme.primarySoft ??
    (isDarkMode ? 'rgba(47, 125, 225, 0.16)' : 'rgba(37, 99, 235, 0.10)')
  const primaryBorder =
    theme.primaryBorder ??
    (isDarkMode ? 'rgba(47, 125, 225, 0.40)' : 'rgba(37, 99, 235, 0.28)')
  const neutralHoverBg = isDarkMode
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(0, 0, 0, 0.05)'
  const dangerColor = theme.danger ?? SEMANTIC_COLORS.danger
  const subtleBorder = theme.borderSubtle ?? theme.border

  const hasQuota =
    typeof device?.usedToday === 'number' &&
    typeof device?.dailyQuota === 'number'
  const roleSubtitle =
    effectiveRole === 'admin'
      ? '无额度限制'
      : hasQuota
        ? `今日已用 ${device!.usedToday} / ${device!.dailyQuota}`
        : '设备默认模式'

  const isAdminEffective = effectiveRole === 'admin'

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={sidebarStyles.confirmOverlay}>
        <Pressable style={sidebarStyles.confirmBackdrop} onPress={onClose} />
        <SheetCardAnim
          style={[
            styles.card,
            {
              backgroundColor: isDarkMode ? '#18191C' : '#FFFFFF',
              borderColor: isDarkMode
                ? (theme.borderStrong ?? theme.border)
                : theme.border
            }
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {/* 顶栏 */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.textMain }]}>设置</Text>
              <HoverTouchable
                accessibilityRole="button"
                accessibilityLabel="关闭设置"
                style={styles.closeBtn}
                hoverBg={neutralHoverBg}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={onClose}
              >
                <InputBarIcon name="x" size={16} color={theme.textMuted} />
              </HoverTouchable>
            </View>

            {/* 分区一：外观 */}
            <Text
              style={[
                styles.sectionLabel,
                { color: theme.textSecondary ?? theme.textMuted }
              ]}
            >
              外观
            </Text>
            <View
              style={[
                styles.segmentWrap,
                {
                  backgroundColor:
                    theme.surfaceElevated ??
                    (isDarkMode ? 'rgba(255,255,255,0.04)' : '#F6F8FA'),
                  borderColor: subtleBorder
                }
              ]}
            >
              {APPEARANCE_OPTIONS.map(({ mode, label, icon }) => {
                const selected = themeMode === mode
                const activeText = isDarkMode ? '#EBF4FF' : primaryColor
                return (
                  <HoverTouchable
                    key={mode}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${label}模式`}
                    style={[
                      styles.segmentItem,
                      selected
                        ? {
                            backgroundColor: primarySoft,
                            borderColor: primaryBorder
                          }
                        : { borderColor: 'transparent' }
                    ]}
                    hoverBg={
                      selected
                        ? isDarkMode
                          ? 'rgba(47, 125, 225, 0.24)'
                          : 'rgba(37, 99, 235, 0.16)'
                        : neutralHoverBg
                    }
                    onPress={() => onThemeModeChange(mode)}
                  >
                    <InputBarIcon
                      name={icon}
                      size={14}
                      color={selected ? activeText : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: selected ? activeText : theme.textMuted,
                          fontWeight: selected ? '600' : '500'
                        }
                      ]}
                    >
                      {label}
                    </Text>
                  </HoverTouchable>
                )
              })}
            </View>

            <View style={[styles.divider, { backgroundColor: subtleBorder }]} />

            {/* 分区二：身份与权限（低频高权操作，与外观视觉区隔） */}
            <Text
              style={[
                styles.sectionLabel,
                { color: theme.textSecondary ?? theme.textMuted }
              ]}
            >
              身份与权限
            </Text>
            <View
              style={[
                styles.roleCard,
                {
                  backgroundColor:
                    theme.surfaceElevated ??
                    (isDarkMode ? 'rgba(255,255,255,0.04)' : '#F6F8FA'),
                  borderColor: subtleBorder
                }
              ]}
            >
              <View style={styles.roleLeft}>
                <View
                  style={[
                    styles.roleBadge,
                    {
                      backgroundColor: isAdminEffective
                        ? primarySoft
                        : isDarkMode
                          ? 'rgba(255, 255, 255, 0.06)'
                          : 'rgba(0, 0, 0, 0.05)'
                    }
                  ]}
                >
                  <InputBarIcon
                    name="shield"
                    size={16}
                    color={isAdminEffective ? primaryColor : theme.textMuted}
                  />
                </View>
                <View style={styles.roleTextWrap}>
                  <Text
                    style={[styles.roleTitle, { color: theme.textMain }]}
                    numberOfLines={1}
                  >
                    {isAdminEffective ? '管理员' : '普通用户'}
                  </Text>
                  <Text
                    style={[styles.roleSubtitle, { color: theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {roleSubtitle}
                  </Text>
                </View>
              </View>

              {isAdminEffective ? (
                <HoverTouchable
                  accessibilityRole="button"
                  accessibilityLabel="退出管理员模式"
                  disabled={!!pendingRole}
                  style={[
                    styles.roleActionBtn,
                    {
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      opacity: pendingRole ? 0.6 : 1
                    }
                  ]}
                  hoverBg="rgba(239, 68, 68, 0.20)"
                  onPress={onSwitchToUser}
                >
                  <Text
                    style={[
                      styles.roleActionText,
                      { color: dangerColor, fontWeight: '600' }
                    ]}
                  >
                    {pendingRole === 'user' ? '切换中…' : '退出管理'}
                  </Text>
                </HoverTouchable>
              ) : (
                <HoverTouchable
                  accessibilityRole="button"
                  accessibilityLabel="切换为管理员"
                  disabled={!!pendingRole}
                  style={[
                    styles.roleActionBtn,
                    {
                      borderWidth: 1,
                      borderColor: theme.borderStrong ?? theme.border,
                      opacity: pendingRole ? 0.6 : 1
                    }
                  ]}
                  hoverBg={neutralHoverBg}
                  onPress={onSwitchToAdmin}
                >
                  <Text
                    style={[
                      styles.roleActionText,
                      { color: theme.textMain, fontWeight: '500' }
                    ]}
                  >
                    {pendingRole === 'admin' ? '切换中…' : '切换管理员'}
                  </Text>
                </HoverTouchable>
              )}
            </View>

            {role === 'admin' && (
              <HoverTouchable
                accessibilityRole="button"
                accessibilityLabel="进入管理后台"
                style={[
                  styles.adminRow,
                  {
                    backgroundColor: primarySoft,
                    borderColor: primaryBorder
                  }
                ]}
                hoverBg={
                  isDarkMode
                    ? 'rgba(47, 125, 225, 0.24)'
                    : 'rgba(37, 99, 235, 0.16)'
                }
                onPress={onOpenAdmin}
              >
                <View style={styles.adminRowLeft}>
                  <InputBarIcon
                    name="shield"
                    size={15}
                    color={isDarkMode ? '#D6ECFF' : primaryColor}
                  />
                  <Text
                    style={[
                      styles.adminRowText,
                      { color: isDarkMode ? '#D6ECFF' : primaryColor }
                    ]}
                  >
                    进入管理后台
                  </Text>
                </View>
                <InputBarIcon
                  name="chevron-right"
                  size={16}
                  color={isDarkMode ? '#D6ECFF' : primaryColor}
                />
              </HoverTouchable>
            )}
          </Pressable>
        </SheetCardAnim>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '86%',
    maxWidth: 340,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: 20,
    ...Platform.select({
      web: { boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.45)' } as any,
      default: { elevation: 10 }
    })
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  title: {
    fontSize: 16,
    fontWeight: '600'
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8
  },
  segmentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 3,
    gap: 3
  },
  segmentItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1
  },
  segmentText: {
    fontSize: 12
  },
  divider: {
    height: 1,
    marginVertical: 16
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1
  },
  roleLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  roleBadge: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  roleTextWrap: {
    flex: 1,
    minWidth: 0
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: '600'
  },
  roleSubtitle: {
    fontSize: 11,
    marginTop: 2
  },
  roleActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    flexShrink: 0
  },
  roleActionText: {
    fontSize: 12
  },
  adminRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1
  },
  adminRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  adminRowText: {
    fontSize: 13,
    fontWeight: '600'
  }
})
