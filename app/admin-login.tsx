import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminPreview, useTheme } from '../src/context/appContexts';

export default function AdminLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdminPreview, setAdminPreview } = useAdminPreview();
  const { theme } = useTheme();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const passwordInputRef = useRef<TextInput>(null);

  if (isAdminPreview) return <Redirect href="/admin" />;

  const handleLogin = () => {
    if (!account.trim() || !password.trim()) {
      setError('请输入管理员账号和密码');
      return;
    }
    setError('');
    setAdminPreview(true);
    router.replace('/admin');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: theme.bgApp }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/')}
        style={[
          styles.backButton,
          { top: insets.top + 8, left: Math.max(insets.left, 16) },
        ]}
      >
        <Text style={[styles.backText, { color: theme.textMuted }]}>
          ‹ 返回聊天
        </Text>
      </Pressable>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.card,
            { backgroundColor: theme.bgSidebar, borderColor: theme.border },
          ]}
        >
          <View
            style={[
              styles.brandMark,
              { backgroundColor: theme.historyActiveBg },
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
            登录后查看设备使用量与每日额度
          </Text>

          <Text style={[styles.label, { color: theme.textMain }]}>
            管理员账号
          </Text>
          <TextInput
            accessibilityLabel="管理员账号"
            autoCapitalize="none"
            autoComplete="username"
            onChangeText={setAccount}
            onSubmitEditing={(event) => {
              event.preventDefault();
              passwordInputRef.current?.focus();
            }}
            placeholder="输入管理员账号"
            placeholderTextColor={theme.textMuted}
            returnKeyType="next"
            style={[
              styles.input,
              {
                backgroundColor: theme.bgApp,
                borderColor: theme.border,
                color: theme.textMain,
              },
            ]}
            value={account}
          />
          <Text
            style={[
              styles.label,
              styles.passwordLabel,
              { color: theme.textMain },
            ]}
          >
            密码
          </Text>
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
                color: theme.textMain,
              },
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
              { backgroundColor: theme.sendBtnActive },
            ]}
          >
            <Text style={styles.loginButtonText}>登录管理后台</Text>
          </Pressable>
          <View style={[styles.previewNote, { backgroundColor: theme.bgApp }]}>
            <Text style={[styles.previewNoteText, { color: theme.textMuted }]}>
              前端演示模式：任意非空账号和密码均可进入。此登录尚未连接后端，不提供真实身份验证或安全保护。
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    zIndex: 1,
    padding: 8,
  },
  backText: {
    fontSize: 14,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 32,
    borderWidth: 1,
    borderRadius: 20,
    boxShadow: '0px 16px 48px rgba(0, 0, 0, 0.12)',
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  brandIcon: {
    fontSize: 24,
    fontWeight: '700',
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 7,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 26,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  passwordLabel: {
    marginTop: 18,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 13,
    fontSize: 14,
    outlineStyle: 'none',
  } as any,
  error: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 10,
  },
  loginButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginTop: 22,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  previewNote: {
    padding: 11,
    borderRadius: 9,
    marginTop: 18,
  },
  previewNoteText: {
    fontSize: 11,
    lineHeight: 16,
  },
});
