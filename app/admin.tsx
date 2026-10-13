import React, { useMemo, useState } from 'react';
import {
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAdminPreview,
  useTheme,
} from '../src/context/appContexts';
import { isPCWebWidth } from '../src/constants/theme';
import { adminPreviewRecords } from '../src/services/adminPreviewData';
import type { DeviceUsageRecord } from '../src/types/admin';

const formatNumber = (value: number) => value.toLocaleString('en-US');

export default function AdminDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isAdminPreview, setAdminPreview } = useAdminPreview();
  const { theme } = useTheme();
  const isDesktop = isPCWebWidth(width);
  const [records, setRecords] = useState(adminPreviewRecords);
  const [query, setQuery] = useState('');
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  // 退出动画进行中：保持本屏内容挂载，避免 <Redirect/> 在侧滑转场前
  // 把内容提前清空（表现为"内容先消失、外框再滑出"）
  const [isExiting, setIsExiting] = useState(false);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) =>
        record.uuid.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query, records],
  );
  const totalTokensToday = records.reduce(
    (sum, record) => sum + record.todayTokens,
    0,
  );
  const totalRequestsToday = records.reduce(
    (sum, record) => sum + record.todayRequests,
    0,
  );
  const exhaustedDevices = records.filter(
    (record) => record.todayRequests >= record.dailyLimit,
  ).length;

  if (!isAdminPreview && !isExiting) return <Redirect href="/admin-login" />;

  /** 侧滑返回上一屏（聊天页）；无上级栈时兜底 replace 回首页 */
  const goBackToChat = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const saveLimit = (record: DeviceUsageRecord) => {
    const value = Number(draftLimits[record.id] ?? record.dailyLimit);
    if (!Number.isInteger(value) || value < 1 || value > 10000) {
      setNotice('每日次数需为 1 到 10,000 之间的整数');
      return;
    }
    setRecords((current) =>
      current.map((item) =>
        item.id === record.id ? { ...item, dailyLimit: value } : item,
      ),
    );
    setDraftLimits((current) => {
      const next = { ...current };
      delete next[record.id];
      return next;
    });
    setNotice('额度已在当前演示页面更新；尚未保存到服务器');
  };

  const logout = () => {
    // 顺序很重要：先标记"退出中"锁住本屏内容，再关闭演示模式、触发侧滑返回。
    // 这样 <Redirect/> 守卫不会在动画开始前清空屏幕内容。
    setIsExiting(true);
    setAdminPreview(false);
    // 侧滑退回聊天页（Stack pop）
    goBackToChat();
  };

  const cardStyle = {
    backgroundColor: theme.bgSidebar,
    borderColor: theme.border,
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.bgApp }]}>
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: theme.bgSidebar,
            borderBottomColor: theme.border,
            paddingTop: insets.top + (Platform.OS === 'web' ? 0 : 8),
          },
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
            <View style={[styles.previewBadge, { backgroundColor: theme.bgApp }]}>
              <Text style={[styles.previewBadgeText, { color: theme.textMuted }]}>
                演示数据
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={logout}
              style={[styles.logoutButton, { borderColor: theme.border }]}
            >
              <Text style={[styles.logoutText, { color: theme.textMain }]}>
                退出登录
              </Text>
            </Pressable>
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

          <View style={[styles.demoBanner, { backgroundColor: theme.historyActiveBg }]}>
            <Text style={[styles.demoBannerText, { color: theme.historyActiveText }]}>
              当前为前端演示数据。设备列表、用量统计和额度修改尚未连接后端，不会持久化。
            </Text>
          </View>

          <View style={[styles.summaryGrid, !isDesktop && styles.summaryGridMobile]}>
            <SummaryCard
              label="今日 Token 消耗"
              value={formatNumber(totalTokensToday)}
              detail="所有设备合计"
              theme={theme}
              cardStyle={cardStyle}
            />
            <SummaryCard
              label="今日请求次数"
              value={formatNumber(totalRequestsToday)}
              detail="所有设备合计"
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
            <View>
              <Text style={[styles.sectionTitle, { color: theme.textMain }]}>
                设备列表
              </Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                按 UUID 搜索 · 可分别设置每日请求次数
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
                { backgroundColor: theme.bgSidebar, borderColor: theme.border, color: theme.textMain },
                !isDesktop && styles.searchInputMobile,
              ]}
              value={query}
            />
          </View>

          {notice ? (
            <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.textMuted }]}>
              {notice}
            </Text>
          ) : null}

          {isDesktop ? (
            <View style={[styles.table, cardStyle]}>
              <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
                <TableHeader label="设备 UUID" flex={3} theme={theme} />
                <TableHeader label="累计 Token" flex={1} theme={theme} />
                <TableHeader label="今日 Token" flex={1} theme={theme} />
                <TableHeader label="今日请求 / 上限" flex={1.4} theme={theme} />
                <TableHeader label="最后活跃" flex={1} theme={theme} />
                <View style={{ width: 96 }} />
              </View>
              {filteredRecords.map((record) => (
                <DeviceTableRow
                  key={record.id}
                  record={record}
                  theme={theme}
                  draftLimit={draftLimits[record.id] ?? String(record.dailyLimit)}
                  onLimitChange={(value) =>
                    setDraftLimits((current) => ({ ...current, [record.id]: value }))
                  }
                  onSave={() => saveLimit(record)}
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
                  draftLimit={draftLimits[record.id] ?? String(record.dailyLimit)}
                  onLimitChange={(value) =>
                    setDraftLimits((current) => ({ ...current, [record.id]: value }))
                  }
                  onSave={() => saveLimit(record)}
                  cardStyle={cardStyle}
                />
              ))}
              {filteredRecords.length === 0 ? <EmptyState theme={theme} /> : null}
            </View>
          )}
          <Text style={[styles.footerNote, { color: theme.textMuted }]}>
            每日次数按设备 UUID 统计；Token 显示累计用量及今日用量。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  theme,
  cardStyle,
}: {
  label: string;
  value: string;
  detail: string;
  theme: any;
  cardStyle: any;
}) {
  return (
    <View style={[styles.summaryCard, cardStyle]}>
      <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.textMain }]}>{value}</Text>
      <Text style={[styles.summaryDetail, { color: theme.textMuted }]}>{detail}</Text>
    </View>
  );
}

function TableHeader({
  label,
  flex,
  theme,
}: {
  label: string;
  flex: number;
  theme: any;
}) {
  return (
    <Text style={[styles.tableHeaderText, { color: theme.textMuted, flex }]}>
      {label}
    </Text>
  );
}

function DeviceTableRow({
  record,
  theme,
  draftLimit,
  onLimitChange,
  onSave,
}: {
  record: DeviceUsageRecord;
  theme: any;
  draftLimit: string;
  onLimitChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <View style={[styles.tableRow, { borderBottomColor: theme.border }]}>
      <Text selectable numberOfLines={1} style={[styles.uuidText, { color: theme.textMain, flex: 3 }]}>
        {record.uuid}
      </Text>
      <Text style={[styles.tableCell, { color: theme.textMain, flex: 1 }]}>
        {formatNumber(record.totalTokens)}
      </Text>
      <Text style={[styles.tableCell, { color: theme.textMain, flex: 1 }]}>
        {formatNumber(record.todayTokens)}
      </Text>
      <Text style={[styles.tableCell, { color: theme.textMain, flex: 1.4 }]}>
        {record.todayRequests} / {record.dailyLimit}
      </Text>
      <Text style={[styles.tableCell, { color: theme.textMuted, flex: 1 }]}>
        {record.lastActiveAt}
      </Text>
      <LimitEditor
        theme={theme}
        value={draftLimit}
        onChange={onLimitChange}
        onSave={onSave}
      />
    </View>
  );
}

function DeviceCard({
  record,
  theme,
  draftLimit,
  onLimitChange,
  onSave,
  cardStyle,
}: {
  record: DeviceUsageRecord;
  theme: any;
  draftLimit: string;
  onLimitChange: (value: string) => void;
  onSave: () => void;
  cardStyle: any;
}) {
  const atLimit = record.todayRequests >= record.dailyLimit;
  return (
    <View style={[styles.deviceCard, cardStyle]}>
      <Text style={[styles.mobileLabel, { color: theme.textMuted }]}>设备 UUID</Text>
      <Text selectable style={[styles.uuidText, styles.mobileUuid, { color: theme.textMain }]}>
        {record.uuid}
      </Text>
      <View style={styles.metricsRow}>
        <Metric label="累计 Token" value={formatNumber(record.totalTokens)} theme={theme} />
        <Metric label="今日 Token" value={formatNumber(record.todayTokens)} theme={theme} />
      </View>
      <View style={styles.metricsRow}>
        <View style={styles.requestMetric}>
          <Text style={[styles.mobileLabel, { color: theme.textMuted }]}>今日请求</Text>
          <Text style={[styles.metricValue, { color: atLimit ? '#ef4444' : theme.textMain }]}>
            {record.todayRequests} / {record.dailyLimit}
          </Text>
        </View>
        <View style={styles.requestMetric}>
          <Text style={[styles.mobileLabel, { color: theme.textMuted }]}>最后活跃</Text>
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
      />
    </View>
  );
}

function Metric({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={styles.requestMetric}>
      <Text style={[styles.mobileLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.textMain }]}>{value}</Text>
    </View>
  );
}

function LimitEditor({
  theme,
  value,
  onChange,
  onSave,
}: {
  theme: any;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
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
          { backgroundColor: theme.bgApp, borderColor: theme.border, color: theme.textMain },
        ]}
        value={value}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onSave}
        style={[styles.saveButton, { backgroundColor: theme.historyActiveBg }]}
      >
        <Text style={[styles.saveButtonText, { color: theme.historyActiveText }]}>
          保存
        </Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ theme }: { theme: any }) {
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.textMain }]}>没有找到设备</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
        试试其他 UUID 关键词
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  topBar: {
    minHeight: 62,
    borderBottomWidth: 1,
    justifyContent: 'center',
  },
  topBarInner: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIcon: {
    fontSize: 22,
    marginRight: 9,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '700',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 48,
  },
  contentInner: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: '700',
    marginBottom: 7,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 7,
    marginBottom: 22,
  },
  demoBanner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 18,
  },
  demoBannerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 32,
  },
  summaryGridMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minHeight: 126,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryValue: {
    fontSize: 27,
    fontWeight: '700',
    marginTop: 13,
  },
  summaryDetail: {
    fontSize: 11,
    marginTop: 4,
  },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 5,
  },
  searchInput: {
    width: 260,
    height: 40,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    fontSize: 12,
  },
  searchInputMobile: {
    flex: 1,
    width: undefined,
    maxWidth: 150,
  },
  notice: {
    fontSize: 12,
    marginBottom: 10,
  },
  table: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  tableHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    backgroundColor: 'rgba(128,128,128,0.04)',
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tableRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  uuidText: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  tableCell: {
    fontSize: 12,
    paddingRight: 8,
  },
  limitEditor: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  limitInput: {
    flex: 1,
    minWidth: 0,
    height: 32,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 12,
  },
  saveButton: {
    height: 32,
    borderRadius: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mobileList: {
    gap: 12,
  },
  deviceCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  mobileLabel: {
    fontSize: 10,
    marginBottom: 5,
  },
  mobileUuid: {
    fontSize: 10,
    marginBottom: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  requestMetric: {
    flex: 1,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 36,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 12,
    marginTop: 5,
  },
  footerNote: {
    fontSize: 11,
    marginTop: 16,
  },
});
