import React, { useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useAdminPreview, useAuth, useRole, useTheme } from '../src/context/appContexts'
import { MyToast } from '../src/components/GlobalToast'

export default function AdminLoginScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isAdminPreview, setAdminPreview } = useAdminPreview()
  const { loginAsAdmin } = useAuth()
  const { theme } = useTheme()
  const { setRole } = useRole()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // 登录跳转进行中：保持本屏内容挂载到转场结束，避免 <Redirect/> 提前清空内容
  const [isRedirecting, setIsRedirecting] = useState(false)
  const passwordInputRef = useRef<TextInput>(null)

  // 离开本页时复位 admin 选中态（典型：Android 硬件返回后，侧栏角色段仍高亮 Admin）。
  // 只有「正向进入 /admin」（登录成功 / 已有 admin 会话自动重定向）才保留，
  // 否则返回后 role 会一直停在 admin。
  const enteringAdminRef = useRef(false)
  useEffect(() => {
    return () => {
      if (enteringAdminRef.current) return
      setAdminPreview(false)
      setRole('user')
    }
  }, [setAdminPreview, setRole])

  if (isAdminPreview && !isRedirecting) {
    enteringAdminRef.current = true
    return <Redirect href="/admin" />
  }

  /** 侧滑返回上一屏（聊天页）；无上级栈时兜底 replace 回首页 */
  const goBackToChat = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/')
    }
  }

  const handleLogin = async () => {
    if (!password.trim()) {
      setError('请输入管理员密码')
      return
    }
    if (loading) return
    setError('')
    setLoading(true)
    try {
      // 后端 admin-login：deviceId 会把当前设备升级为 admin
      // loginAsAdmin 内部已同步 setRole('admin') + 缓存 admin 会话（下次免密）
      await loginAsAdmin(password.trim())
      // 登录成功 = 正向进入 /admin：离开本页时保留 admin 态
      enteringAdminRef.current = true
      // 顺序很重要：先标记"跳转中"锁住本屏内容，避免 <Redirect/> 守卫
      // 在转场动画前把登录页内容清空
      setIsRedirecting(true)
      // 登录成功 → 直接进管理后台详情页（token/角色已在 loginAsAdmin 里落地并缓存）
      router.replace('/admin')
    } catch (e: any) {
      const status = e?.response?.status
      const msg =
        status === 401
          ? '密码错误，请重试'
          : (e?.response?.data?.message ?? '登录失败，请检查网络或后端连接')
      setError(msg)
      MyToast.show(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: theme.bgApp }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable
        accessibilityRole="button"
        onPress={goBackToChat}
        style={[
          styles.backButton,
          { top: insets.top + 8, left: Math.max(insets.left, 16) }
        ]}
      >
        <View style={styles.backButtonRow}>
          <Feather
            name="arrow-left"
            size={16}
            color={theme.textMuted}
          />
          <Text style={[styles.backText, { color: theme.textMuted }]}>
            返回聊天
          </Text>
        </View>
      </Pressable>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 24
          }
        ]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.card,
            { backgroundColor: theme.bgSidebar, borderColor: theme.border }
          ]}
        >
          <View
            style={[
              styles.brandMark,
              { backgroundColor: theme.historyActiveBg }
            ]}
          >
            <Text
              style={[styles.brandIcon, { color: theme.historyActiveText }]}
            >
              ◈
            </Text>
          </View>
          <Text style={[styles.eyebrow, { color: theme.textMuted }]}>
            ADMIN CONSOLE
          </Text>
          <Text style={[styles.title, { color: theme.textMain }]}>
            管理员登录
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            输入管理员密码登录（默认 123456）
          </Text>

          <Text style={[styles.label, { color: theme.textMain }]}>密码</Text>
          <TextInput
            ref={passwordInputRef}
            accessibilityLabel="管理员密码"
            autoComplete="current-password"
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            placeholder="输入密码"
            placeholderTextColor={theme.textMuted}
            returnKeyType="done"
            secureTextEntry
            style={[
              styles.input,
              {
                backgroundColor: theme.bgApp,
                borderColor: theme.border,
                color: theme.textMain
              }
            ]}
            value={password}
          />
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={handleLogin}
            style={[
              styles.loginButton,
              { backgroundColor: theme.sendBtnActive }
            ]}
          >
            <Text style={styles.loginButtonText}>
              {loading ? '登录中…' : '登录管理后台'}
            </Text>
          </Pressable>
          <View style={[styles.previewNote, { backgroundColor: theme.bgApp }]}>
            <Text style={[styles.previewNoteText, { color: theme.textMuted }]}>
              管理员登录后当前设备升级为 admin，配额不受限，可查看全站统计。
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  backButton: {
    position: 'absolute',
    zIndex: 1,
    padding: 8
  },
  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  backText: {
    fontSize: 14
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 32,
    borderWidth: 1,
    borderRadius: 20,
    boxShadow: '0px 16px 48px rgba(0, 0, 0, 0.12)'
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22
  },
  brandIcon: {
    fontSize: 24,
    fontWeight: '700'
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 7
  },
  title: {
    fontSize: 26,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 26
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8
  },
  passwordLabel: {
    marginTop: 18
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 13,
    fontSize: 14,
    outlineStyle: 'none'
  } as any,
  error: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 10
  },
  loginButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginTop: 22
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  },
  previewNote: {
    padding: 11,
    borderRadius: 9,
    marginTop: 18
  },
  previewNoteText: {
    fontSize: 11,
    lineHeight: 16
  }
})
