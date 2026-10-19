import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useAdminPreview,
  useAuth,
  useRole,
  useTheme
} from '../src/context/appContexts'
import { isPCWebWidth } from '../src/constants/theme'
import { api, type DeviceInfo, type AdminStats } from '../src/services/api'
import GlobalToastContainer, { MyToast } from '../src/components/GlobalToast'
import HoverTouchable from '../src/components/HoverTouchable'
import type { DeviceUsageRecord } from '../src/types/admin'
import { diag } from '../src/devDiag'

const formatNumber = (value: number) => value.toLocaleString('en-US')

export default function AdminDashboardScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { isAdminPreview, setAdminPreview } = useAdminPreview()
  const { device, logoutToDevice } = useAuth()
  // 当前登录设备的 deviceId：列表里据此高亮「本机」这一行/卡
  const currentDeviceId = device?.deviceId ?? ''
  const { setRole } = useRole()
  const { theme } = useTheme()
  const isDesktop = isPCWebWidth(width)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  // 退出动画进行中：保持本屏内容挂载，避免 <Redirect/> 在侧滑转场前
  // 把内容提前清空（表现为"内容先消失、外框再滑出"）
  const [isExiting, setIsExiting] = useState(false)

  const loadAdmin = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const [s, d] = await Promise.all([
        api.getAdminStats(),
        api.getAdminDevices(p, pageSize)
      ])
      setStats(s)
      setDevices(d.list ?? [])
      setTotal(d.total ?? 0)
      setPage(d.page ?? p)
      setNotice('')
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ?? '管理后台加载失败，请检查 admin 登录态'
      setNotice(String(msg))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdminPreview) loadAdmin(1)
  }, [isAdminPreview, loadAdmin])

  // 后端字段 → 展示字段（totalTokens 是 string，转 number 显示）
  const records: DeviceUsageRecord[] = useMemo(
    () =>
      devices.map((d) => ({
        id: d.id,
        uuid: d.deviceId,
        totalTokens: Number(d.totalTokens ?? 0) || 0,
        todayTokens: Number(d.usedTokensToday ?? 0) || 0,
        todayRequests: d.usedToday ?? 0,
        dailyLimit: d.dailyQuota ?? 50,
        lastActiveAt: d.lastSeenAt
          ? new Date(d.lastSeenAt).toLocaleString()
          : '',
        role: d.role ?? 'user',
        platform: d.platform ?? '',
        model: d.model ?? '',
        osVersion: d.osVersion ?? '',
        createdAt: d.createdAt ? new Date(d.createdAt).toLocaleString() : ''
      })),
    [devices]
  )

  const filteredRecords = useMemo(
    () =>
      records.filter((record) =>
        record.uuid.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [query, records]
  )
  const exhaustedDevices = records.filter(
    (record) => record.todayRequests >= record.dailyLimit
  ).length
  const totalTokensAll = Number(stats?.totalTokens ?? 0) || 0

  if (!isAdminPreview && !isExiting) return <Redirect href="/admin-login" />

  /** 侧滑返回上一屏（聊天页）；无上级栈时兜底 replace 回首页 */
  const goBackToChat = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/')
    }
  }

  const saveLimit = async (record: DeviceUsageRecord) => {
    const value = Number(draftLimits[record.id] ?? record.dailyLimit)
    if (!Number.isInteger(value) || value < 1 || value > 10000) {
      MyToast.show('每日次数需为 1 到 10,000 之间的整数')
      return
    }
    if (saving) return
    setSaving(true)
    try {
      // PUT /admin/devices/:id/quota（需 admin token）
      await api.updateDeviceQuota(record.id, value)
      // 服务端确认后再更新本地列表，保证前后端一致
      setDevices((current) =>
        current.map((item) =>
          item.id === record.id ? { ...item, dailyQuota: value } : item
        )
      )
      setDraftLimits((current) => {
        const next = { ...current }
        delete next[record.id]
        return next
      })
      MyToast.show(`保存成功：每日限额已更新为 ${value} 次`)
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? '保存失败，请检查网络后重试'
      MyToast.show(String(msg))
    } finally {
      setSaving(false)
    }
  }

  const logout = async () => {
    // 顺序很重要：先标记"退出中"锁住本屏内容，再关闭演示模式、触发侧滑返回。
    // 这样 <Redirect/> 守卫不会在动画开始前清空屏幕内容。
    setIsExiting(true)
    setAdminPreview(false)
    // 退出 admin：token 降级回 user 设备，避免一直拿 admin token 聊天
    try {
      await logoutToDevice()
    } catch {}
    // 侧栏角色分段器的高亮跟着切回 User（role 的真源是 RoleContext）
    diag.lastSet = 'adminLogout'
    setRole('user')
    // 侧滑退回聊天页（Stack pop）
    goBackToChat()
  }

  const cardStyle = {
    backgroundColor: theme.bgSidebar,
    borderColor: theme.border
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.bgApp }]}>
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: theme.bgSidebar,
            borderBottomColor: theme.border,
            paddingTop: insets.top + (Platform.OS === 'web' ? 0 : 9)
          }
        ]}
      >
        <View style={styles.topBarInner}>
          <Pressable
            accessibilityRole="button"
            onPress={goBackToChat}
            style={styles.brand}
          >
            <Text style={[styles.brandIcon, { color: theme.sendBtnActive }]}>
              ◈
            </Text>
            <Text style={[styles.brandName, { color: theme.textMain }]}>
              AI 管理后台
            </Text>
          </Pressable>
          <View style={styles.topActions}>
            <View
              style={[styles.previewBadge, { backgroundColor: theme.bgApp }]}
            >
              <Text
                style={[styles.previewBadgeText, { color: theme.textMuted }]}
              >
                {loading ? '加载中…' : `共 ${total} 台 · 在线统计`}
              </Text>
            </View>

            <HoverTouchable
              accessibilityRole="button"
              onPress={logout}
              hoverBg={theme.historyActiveBg}
              rippleColor={
                theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'
              }
              style={[styles.logoutButton, { borderColor: theme.border }]}
            >
              <Text style={[styles.logoutText, { color: theme.textMain }]}>
                退出登录
              </Text>
            </HoverTouchable>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentInner}>
          <Text style={[styles.eyebrow, { color: theme.sendBtnActive }]}>
            USAGE OVERVIEW
          </Text>
          <Text style={[styles.title, { color: theme.textMain }]}>
            设备用量
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            查看设备 Token 消耗与每日请求额度
          </Text>

          {notice ? (
            <View
              style={[
                styles.demoBanner,
                { backgroundColor: theme.historyActiveBg }
              ]}
            >
              <Text
                style={[
                  styles.demoBannerText,
                  { color: theme.historyActiveText }
                ]}
              >
                {notice}
              </Text>
            </View>
          ) : null}

          <View
            style={[styles.summaryGrid, !isDesktop && styles.summaryGridMobile]}
          >
            <SummaryCard
              label="累计 Token"
              value={formatNumber(totalTokensAll)}
              detail={`共 ${stats?.deviceCount ?? total} 台设备`}
              theme={theme}
              cardStyle={cardStyle}
            />
            <SummaryCard
              label="今日活跃设备"
              value={formatNumber(stats?.todayActiveDevices ?? 0)}
              detail={`累计请求 ${formatNumber(stats?.totalRequests ?? 0)}`}
              theme={theme}
              cardStyle={cardStyle}
            />
            <SummaryCard
              label="已达每日上限"
              value={formatNumber(exhaustedDevices)}
              detail={`共 ${records.length} 台设备`}
              theme={theme}
              cardStyle={cardStyle}
            />
          </View>

          <View style={styles.listHeading}>
            <View style={styles.listHeadingText}>
              <Text style={[styles.sectionTitle, { color: theme.textMain }]}>
                设备列表
              </Text>
              <Text
                style={[styles.sectionSubtitle, { color: theme.textMuted }]}
              >
                可分别设置每日请求次数
              </Text>
            </View>
            <TextInput
              accessibilityLabel="按设备 UUID 搜索"
              autoCapitalize="none"
              onChangeText={setQuery}
              placeholder="搜索 UUID"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.searchInput,
                !isDesktop && styles.searchInputFull,
                {
                  backgroundColor: theme.bgSidebar,
                  borderColor: theme.border,
                  color: theme.textMain
                }
              ]}
              value={query}
            />
          </View>

          {isDesktop ? (
            <View style={[styles.table, cardStyle]}>
              <View
                style={[
                  styles.tableHeader,
                  { borderBottomColor: theme.border }
                ]}
              >
                <TableHeader
                  label="设备 UUID"
                  width="34%"
                  theme={theme}
                  align="left"
                />
                <TableHeader label="累计 Token" width="13%" theme={theme} />
                <TableHeader label="今日 Token" width="13%" theme={theme} />
                <TableHeader
                  label="今日请求 / 上限"
                  width="16%"
                  theme={theme}
                />
                <TableHeader label="最后活跃" width="16%" theme={theme} />
                <View style={{ width: 96 }} />
              </View>
              {filteredRecords.map((record) => (
                <DeviceTableRow
                  key={record.id}
                  record={record}
                  theme={theme}
                  isCurrent={
                    !!currentDeviceId && record.uuid === currentDeviceId
                  }
                  draftLimit={
                    draftLimits[record.id] ?? String(record.dailyLimit)
                  }
                  onLimitChange={(value) =>
                    setDraftLimits((current) => ({
                      ...current,
                      [record.id]: value
                    }))
                  }
                  onSave={() => saveLimit(record)}
                  saving={saving}
                />
              ))}
              {filteredRecords.length === 0 ? (
                <EmptyState theme={theme} />
              ) : null}
            </View>
          ) : (
            <View style={styles.mobileList}>
              {filteredRecords.map((record) => (
                <DeviceCard
                  key={record.id}
                  record={record}
                  theme={theme}
                  isCurrent={
                    !!currentDeviceId && record.uuid === currentDeviceId
                  }
                  draftLimit={
                    draftLimits[record.id] ?? String(record.dailyLimit)
                  }
                  onLimitChange={(value) =>
                    setDraftLimits((current) => ({
                      ...current,
                      [record.id]: value
                    }))
                  }
                  onSave={() => saveLimit(record)}
                  saving={saving}
                  cardStyle={cardStyle}
                />
              ))}
              {filteredRecords.length === 0 ? (
                <EmptyState theme={theme} />
              ) : null}
            </View>
          )}
          <Pager
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            theme={theme}
            onPageChange={(p) => loadAdmin(p)}
          />
          <Text style={[styles.footerNote, { color: theme.textMuted }]}>
            每日次数按设备 UUID 统计；Token 显示累计用量及今日用量。
          </Text>
        </View>
      </ScrollView>

      <GlobalToastContainer />
    </View>
  )
}

function Pager({
  page,
  pageSize,
  total,
  loading,
  theme,
  onPageChange
}: {
  page: number
  pageSize: number
  total: number
  loading: boolean
  theme: any
  onPageChange: (p: number) => void
}) {
  // total<=0 时不渲染，避免 0 条还露出一行分页器
  if (total <= 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // 生成要展示的页码：总是首末 + 当前页邻近窗口 + 省略号，避免页数多时撑爆
  const buildPages = (): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const set = new Set<number>([1, totalPages, page])
    for (let i = 1; i <= 2; i++) {
      if (page - i >= 1) set.add(page - i)
      if (page + i <= totalPages) set.add(page + i)
    }
    const sorted = [...set].sort((a, b) => a - b)
    const out: (number | string)[] = []
    let prev = 0
    for (const n of sorted) {
      if (prev && n - prev > 1) out.push('…')
      out.push(n)
      prev = n
    }
    return out
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <View style={styles.pager}>
      <Text style={[styles.pagerInfo, { color: theme.textMuted }]}>
        共 {formatNumber(total)} 台 · 第 {page}/{totalPages} 页 · 每页{' '}
        {pageSize}
      </Text>
      <View style={styles.pagerControls}>
        <PagerButton
          label="‹ 上一页"
          disabled={loading || page <= 1}
          theme={theme}
          onPress={() => onPageChange(page - 1)}
        />
        {buildPages().map((item, idx) =>
          typeof item === 'number' ? (
            <PagerButton
              key={`p-${item}`}
              label={String(item)}
              active={item === page}
              disabled={loading}
              theme={theme}
              onPress={() => onPageChange(item)}
            />
          ) : (
            <Text
              key={`e-${idx}`}
              style={[styles.pagerEllipsis, { color: theme.textMuted }]}
            >
              …
            </Text>
          )
        )}
        <PagerButton
          label="下一页 ›"
          disabled={loading || page >= totalPages}
          theme={theme}
          onPress={() => onPageChange(page + 1)}
        />
      </View>
    </View>
  )
}

function PagerButton({
  label,
  active,
  disabled,
  theme,
  onPress
}: {
  label: string
  active?: boolean
  disabled?: boolean
  theme: any
  onPress: () => void
}) {
  return (
    <HoverTouchable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      // 非选中按钮 hover 提亮；选中按钮 hover 保持自身选中色，避免闪回默认背景
      hoverBg={active ? theme.historyActiveBg : 'rgba(127, 127, 127, 0.14)'}
      style={[
        styles.pagerBtn,
        { borderColor: theme.border, backgroundColor: theme.bgSidebar },
        active && {
          backgroundColor: theme.historyActiveBg,
          borderColor: theme.historyActiveBg
        },
        disabled && styles.pagerBtnDisabled
      ]}
    >
      <Text
        style={[
          styles.pagerBtnText,
          { color: active ? theme.historyActiveText : theme.textMain },
          disabled && styles.pagerBtnTextDisabled
        ]}
      >
        {label}
      </Text>
    </HoverTouchable>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  theme,
  cardStyle
}: {
  label: string
  value: string
  detail: string
  theme: any
  cardStyle: any
}) {
  return (
    <View style={[styles.summaryCard, cardStyle]}>
      <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
        {label}
      </Text>
      <Text style={[styles.summaryValue, { color: theme.textMain }]}>
        {value}
      </Text>
      <Text style={[styles.summaryDetail, { color: theme.textMuted }]}>
        {detail}
      </Text>
    </View>
  )
}

function TableHeader({
  label,
  width,
  theme,
  align = 'center'
}: {
  label: string
  width: `${number}%`
  theme: any
  align?: 'left' | 'center'
}) {
  return (
    <Text
      numberOfLines={1}
      style={[
        styles.tableHeaderText,
        { color: theme.textMuted, width, textAlign: align }
      ]}
    >
      {label}
    </Text>
  )
}

function DeviceTableRow({
  record,
  theme,
  isCurrent,
  draftLimit,
  onLimitChange,
  onSave,
  saving
}: {
  record: DeviceUsageRecord
  theme: any
  isCurrent?: boolean
  draftLimit: string
  onLimitChange: (value: string) => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <View
      style={[
        styles.tableRow,
        { borderBottomColor: theme.border },
        isCurrent && styles.tableRowCurrent
      ]}
    >
      <View
        style={{
          width: '34%',
          justifyContent: 'center'
        }}
      >
        <Text
          selectable
          numberOfLines={1}
          style={[styles.uuidText, { color: theme.textMain }]}
        >
          {record.uuid}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.deviceSubText, { color: theme.textMuted }]}
        >
          {[
            isCurrent ? '本机' : '',
            [record.model, record.platform, record.osVersion]
              .filter(Boolean)
              .join(' · '),
            record.role === 'admin' ? 'Admin' : 'User',
            record.createdAt ? `注册 ${record.createdAt}` : ''
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.tableCell,
          styles.tableCellCenter,
          { color: theme.textMain, width: '13%' }
        ]}
      >
        {formatNumber(record.totalTokens)}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.tableCell,
          styles.tableCellCenter,
          { color: theme.textMain, width: '13%' }
        ]}
      >
        {formatNumber(record.todayTokens)}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.tableCell,
          styles.tableCellCenter,
          { color: theme.textMain, width: '16%' }
        ]}
      >
        {record.todayRequests} / {record.dailyLimit}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.tableCell,
          styles.tableCellCenter,
          { color: theme.textMuted, width: '16%' }
        ]}
      >
        {record.lastActiveAt}
      </Text>
      <LimitEditor
        theme={theme}
        value={draftLimit}
        onChange={onLimitChange}
        onSave={onSave}
        saving={saving}
      />
    </View>
  )
}

function DeviceCard({
  record,
  theme,
  isCurrent,
  draftLimit,
  onLimitChange,
  onSave,
  saving,
  cardStyle
}: {
  record: DeviceUsageRecord
  theme: any
  isCurrent?: boolean
  draftLimit: string
  onLimitChange: (value: string) => void
  onSave: () => void
  saving: boolean
  cardStyle: any
}) {
  const atLimit = record.todayRequests >= record.dailyLimit
  return (
    <View
      style={[
        styles.deviceCard,
        cardStyle,
        isCurrent && styles.deviceCardCurrent
      ]}
    >
      <Text style={[styles.mobileLabel, { color: theme.textMuted }]}>
        设备 UUID
      </Text>
      <Text
        selectable
        style={[styles.uuidText, styles.mobileUuid, { color: theme.textMain }]}
      >
        {record.uuid}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.deviceSubText,
          styles.mobileSubText,
          { color: theme.textMuted }
        ]}
      >
        {[
          isCurrent ? '本机' : '',
          [record.model, record.platform, record.osVersion]
            .filter(Boolean)
            .join(' · '),
          record.role === 'admin' ? 'Admin' : 'User',
          record.createdAt ? `注册 ${record.createdAt}` : ''
        ]
          .filter(Boolean)
          .join(' · ') || '—'}
      </Text>
      <View style={styles.metricsRow}>
        <Metric
          label="累计 Token"
          value={formatNumber(record.totalTokens)}
          theme={theme}
        />
        <Metric
          label="今日 Token"
          value={formatNumber(record.todayTokens)}
          theme={theme}
        />
      </View>
      <View style={styles.metricsRow}>
        <View style={styles.requestMetric}>
          <Text style={[styles.mobileLabel, { color: theme.textMuted }]}>
            今日请求
          </Text>
          <Text
            style={[
              styles.metricValue,
              { color: atLimit ? '#ef4444' : theme.textMain }
            ]}
          >
            {record.todayRequests} / {record.dailyLimit}
          </Text>
        </View>
        <View style={styles.requestMetric}>
          <Text style={[styles.mobileLabel, { color: theme.textMuted }]}>
            最后活跃
          </Text>
          <Text style={[styles.metricValue, { color: theme.textMain }]}>
            {record.lastActiveAt}
          </Text>
        </View>
      </View>
      <LimitEditor
        theme={theme}
        value={draftLimit}
        onChange={onLimitChange}
        onSave={onSave}
        saving={saving}
      />
    </View>
  )
}

function Metric({
  label,
  value,
  theme
}: {
  label: string
  value: string
  theme: any
}) {
  return (
    <View style={styles.requestMetric}>
      <Text style={[styles.mobileLabel, { color: theme.textMuted }]}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: theme.textMain }]}>
        {value}
      </Text>
    </View>
  )
}

function LimitEditor({
  theme,
  value,
  onChange,
  onSave,
  saving
}: {
  theme: any
  value: string
  onChange: (value: string) => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <View style={styles.limitEditor}>
      <TextInput
        accessibilityLabel="每日请求次数上限"
        keyboardType="number-pad"
        onChangeText={onChange}
        onSubmitEditing={onSave}
        selectTextOnFocus
        style={[
          styles.limitInput,
          {
            backgroundColor: theme.bgApp,
            borderColor: theme.border,
            color: theme.textMain
          }
        ]}
        value={value}
      />
      <HoverTouchable
        accessibilityRole="button"
        accessibilityLabel="保存每日请求次数上限"
        disabled={saving}
        onPress={onSave}
        hoverBg={theme.sendBtnHover ?? theme.historyActiveBg}
        activeOpacity={0.8}
        style={[styles.saveButton, { backgroundColor: theme.historyActiveBg }]}
      >
        <Text
          style={[styles.saveButtonText, { color: theme.historyActiveText }]}
        >
          保存
        </Text>
      </HoverTouchable>
    </View>
  )
}

function EmptyState({ theme }: { theme: any }) {
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.textMain }]}>
        没有找到设备
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
        试试其他 UUID 关键词
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1
  },
  topBar: {
    minHeight: 62,
    borderBottomWidth: 1,
    justifyContent: 'center',
    paddingBottom: 2
  },
  topBarInner: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  brandIcon: {
    fontSize: 22,
    marginRight: 9
  },
  brandName: {
    fontSize: 16,
    fontWeight: '700'
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  previewBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '600'
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '600'
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 48
  },
  contentInner: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center'
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: '700',
    marginBottom: 7
  },
  title: {
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: 14,
    marginTop: 7,
    marginBottom: 22
  },
  demoBanner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 18
  },
  demoBannerText: {
    fontSize: 12,
    lineHeight: 18
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 32
  },
  summaryGridMobile: {
    flexDirection: 'column',
    gap: 10
  },
  summaryCard: {
    flex: 1,
    minHeight: 126,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1
  },
  summaryLabel: {
    fontSize: 12
  },
  summaryValue: {
    fontSize: 27,
    fontWeight: '700',
    marginTop: 13
  },
  summaryDetail: {
    fontSize: 11,
    marginTop: 4
  },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 14,
    gap: 10
  },
  listHeadingText: {
    flexShrink: 1,
    minWidth: 160
  },
  searchInputFull: {
    width: '100%',
    height: 40
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700'
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 5
  },
  searchInput: {
    width: 260,
    height: 40,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    fontSize: 12
  },
  searchInputMobile: {
    flex: 1,
    width: undefined,
    maxWidth: 150
  },
  notice: {
    fontSize: 12,
    marginBottom: 10
  },
  table: {
    minWidth: 880,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden'
  },
  tableHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    backgroundColor: 'rgba(128,128,128,0.04)'
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '600'
  },
  tableRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1
  },
  uuidText: {
    fontSize: 11,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace'
    })
  },
  tableCell: {
    fontSize: 12,
    paddingHorizontal: 4
  },
  tableCellCenter: {
    textAlign: 'center'
  },
  limitEditor: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  limitInput: {
    flex: 1,
    minWidth: 0,
    height: 36,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 12
  },
  saveButton: {
    width: 44,
    height: 32,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButtonText: {
    fontSize: 11,
    fontWeight: '600'
  },
  mobileList: {
    gap: 12
  },
  deviceCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16
  },
  tableRowCurrent: {
    backgroundColor: 'rgba(75, 146, 238, 0.12)'
  },
  deviceCardCurrent: {
    borderColor: '#4b92ee',
    borderWidth: 1.5
  },
  mobileLabel: {
    fontSize: 10,
    marginBottom: 5
  },
  mobileUuid: {
    fontSize: 10,
    marginBottom: 14
  },
  deviceSubText: {
    fontSize: 10,
    marginTop: 3,
    fontWeight: '400'
  },
  mobileSubText: {
    marginTop: -8,
    marginBottom: 14
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12
  },
  requestMetric: {
    flex: 1
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600'
  },
  emptyState: {
    alignItems: 'center',
    padding: 36
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600'
  },
  emptySubtitle: {
    fontSize: 12,
    marginTop: 5
  },
  footerNote: {
    fontSize: 11,
    marginTop: 16
  },
  pager: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12
  },
  pagerInfo: {
    fontSize: 12
  },
  pagerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6
  },
  pagerBtn: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pagerBtnText: {
    fontSize: 13,
    fontWeight: '600'
  },
  pagerBtnDisabled: {
    opacity: 0.4
  },
  pagerBtnTextDisabled: {
    opacity: 0.6
  },
  pagerEllipsis: {
    fontSize: 13,
    paddingHorizontal: 4
  }
})
