import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  DeviceEventEmitter,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { MyToast } from './GlobalToast'
import { InputBarIcon } from './InputBarIcon'
import { setChatQuote } from '../utils/chatQuote'

interface MenuState {
  text: string
  top: number
  centerX: number
}

const DEFAULT_MENU_WIDTH = 190
const MENU_HEIGHT = 40

function getSelectionElement(node: Node | null): Element | null {
  if (!node) return null
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  return !!el.closest('input, textarea, [contenteditable="true"]')
}

/**
 * 划词追问入口：
 * - 原生端（Android）：监听 MainActivity ActionMode 注入的「问问 DieTai」事件。
 * - Web 端（PC Web / 手机 H5）：监听聊天区（#chat-scroll）与文档预览区（#doc-scroll）
 *   的文本选区，在选区上方弹出深色悬浮条「问问 DieTai | 复制」。
 */
export default function SelectionAskMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [menuWidth, setMenuWidth] = useState(DEFAULT_MENU_WIDTH)
  const interactingRef = useRef(false)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 原生端：接收来自 MainActivity.kt 的「问问 DieTai」系统菜单点击事件
  useEffect(() => {
    if (Platform.OS === 'web') return
    const sub = DeviceEventEmitter.addListener(
      'onAskDieTaiSelection',
      (text: unknown) => {
        if (typeof text === 'string' && text.trim()) {
          setChatQuote(text.trim())
        }
      }
    )
    return () => sub.remove()
  }, [])

  const clearSelection = useCallback(() => {
    if (Platform.OS !== 'web') return
    try {
      const sel = (globalThis as any).getSelection?.()
      sel?.removeAllRanges?.()
    } catch {}
  }, [])

  const syncSelection = useCallback(() => {
    if (Platform.OS !== 'web') return
    if (interactingRef.current) return
    const win = globalThis as any
    const sel = win.getSelection?.()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setMenu(null)
      return
    }
    const text = String(sel.toString?.() ?? '').trim()
    if (!text) {
      setMenu(null)
      return
    }

    const anchorEl = getSelectionElement(sel.anchorNode)
    const focusEl = getSelectionElement(sel.focusNode)
    if (isEditableElement(anchorEl) || isEditableElement(focusEl)) {
      setMenu(null)
      return
    }

    const inChat =
      !!anchorEl?.closest('#chat-scroll') && !!focusEl?.closest('#chat-scroll')
    const inDoc =
      !!anchorEl?.closest('#doc-scroll') && !!focusEl?.closest('#doc-scroll')
    if (!inChat && !inDoc) {
      setMenu(null)
      return
    }

    let rect: DOMRect | null = null
    try {
      rect = sel.getRangeAt(0).getBoundingClientRect()
    } catch {
      rect = null
    }
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setMenu(null)
      return
    }

    const vh = win.innerHeight || 667
    if (rect.bottom < 0 || rect.top > vh) {
      setMenu(null)
      return
    }

    const top =
      rect.top < 56
        ? Math.min(vh - MENU_HEIGHT - 12, rect.bottom + 10)
        : Math.max(8, rect.top - MENU_HEIGHT - 8)
    const centerX = rect.left + rect.width / 2

    setMenu({ text, top, centerX })
  }, [])

  const scheduleSync = useCallback(
    (delay = 16) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null
        syncSelection()
      }, delay)
    },
    [syncSelection]
  )

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const doc = (globalThis as any).document
    const win = globalThis as any
    if (!doc || !win) return

    const onSelectionChange = () => scheduleSync(24)
    const onPointerUp = () => scheduleSync(12)
    const onKeyUp = () => scheduleSync(12)
    const onScroll = () => syncSelection()
    const onResize = () => syncSelection()

    doc.addEventListener('selectionchange', onSelectionChange)
    doc.addEventListener('mouseup', onPointerUp)
    doc.addEventListener('touchend', onPointerUp)
    doc.addEventListener('keyup', onKeyUp)
    doc.addEventListener('scroll', onScroll, true)
    win.addEventListener('resize', onResize)

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      doc.removeEventListener('selectionchange', onSelectionChange)
      doc.removeEventListener('mouseup', onPointerUp)
      doc.removeEventListener('touchend', onPointerUp)
      doc.removeEventListener('keyup', onKeyUp)
      doc.removeEventListener('scroll', onScroll, true)
      win.removeEventListener('resize', onResize)
    }
  }, [scheduleSync, syncSelection])

  if (Platform.OS !== 'web' || !menu) return null

  const vw = (globalThis as any).innerWidth || 375
  const left = Math.max(
    12,
    Math.min(vw - menuWidth - 12, Math.round(menu.centerX - menuWidth / 2))
  )

  const handleAsk = () => {
    const selected = menu.text
    interactingRef.current = false
    setMenu(null)
    clearSelection()
    setChatQuote(selected)
  }

  const handleCopy = async () => {
    const selected = menu.text
    interactingRef.current = false
    setMenu(null)
    clearSelection()
    try {
      await Clipboard.setStringAsync(selected)
      MyToast.show('已复制到剪贴板')
    } catch {
      MyToast.show('复制失败，请稍后重试')
    }
  }

  return (
    <View
      onLayout={(e) => {
        const w = Math.ceil(e.nativeEvent.layout.width)
        if (w > 0 && Math.abs(w - menuWidth) > 2) setMenuWidth(w)
      }}
      {...({
        onMouseDown: (e: any) => {
          interactingRef.current = true
          e.preventDefault()
        },
        onMouseUp: () => {
          setTimeout(() => {
            interactingRef.current = false
          }, 0)
        },
        onTouchStart: () => {
          interactingRef.current = true
        },
        onTouchCancel: () => {
          interactingRef.current = false
        }
      } as any)}
      style={[
        styles.menu,
        {
          top: menu.top,
          left
        }
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={handleAsk}
        style={styles.btn}
      >
        <InputBarIcon name="corner-down-right" size={14} color="#FFFFFF" />
        <Text style={styles.btnText}>问问 DieTai</Text>
      </TouchableOpacity>
      <View style={styles.divider} />
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={handleCopy}
        style={styles.btn}
      >
        <Text style={styles.btnText}>复制</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  menu: {
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          userSelect: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.38)'
        } as any)
      : { position: 'absolute' }),
    zIndex: 9999,
    height: MENU_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#242529',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 4
  },
  btn: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null)
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : null)
  },
  divider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.16)'
  }
})
