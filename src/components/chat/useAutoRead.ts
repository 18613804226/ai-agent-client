import { useState, useEffect, useRef, useCallback, type MutableRefObject } from 'react'
import { api } from '../../services/api'
import { playText, stopSpeech } from '../../services/speechPlayer'
import type { Message, StreamingRenderMsg } from '../../types/chat'

interface UseAutoReadOptions {
  activeId: string
  autoRead: boolean
  streamingRenderMsg: StreamingRenderMsg | null
  /** 最新 displayMessages（ref，避免放进 deps 导致每 token 重跑） */
  displayMessagesRef: MutableRefObject<Message[]>
}

/**
 * 自动朗读：开即读 + 后续跟读（纯搬运自 ChatArea）。
 *  - 打开开关立刻读当前最后一条已完成 AI 气泡；之后每条新 AI 气泡完成都跟读
 *  - 只在「吐字结束、内容落盘」后触发（streamingRenderMsg 为空且目标无 isStreaming），
 *    避免边吐边读频繁切分 TTS
 *  - 关闭开关 / 切会话 / 卸载时若是自动播的就停掉；手动点的喇叭不受开关影响
 */
export function useAutoRead({
  activeId,
  autoRead,
  streamingRenderMsg,
  displayMessagesRef
}: UseAutoReadOptions) {
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null)
  const lastAutoReadKeyRef = useRef<string | null>(null)
  const autoPlayingRef = useRef(false)
  const autoMsgIdRef = useRef<string | null>(null)

  // 播放归属包装：playingMsgId 被手动喇叭接管（变成非自动播的 id / 清空）时，
  // 自动朗读要让位，避免旧 effect 误判还在自动播、后续乱停别人的音
  const handlePlayingChange = useCallback((id: string | null) => {
    if (id !== autoMsgIdRef.current) autoPlayingRef.current = false
    setPlayingMsgId(id)
  }, [])

  useEffect(() => {
    if (!autoRead) {
      if (autoPlayingRef.current) {
        autoPlayingRef.current = false
        autoMsgIdRef.current = null
        stopSpeech()
        setPlayingMsgId(null)
      }
      return
    }
    // 吐字中不读：等流式结束、内容落盘后再跟读
    if (streamingRenderMsg) return
    const list = displayMessagesRef.current ?? []
    let target: { id: string; content: string } | null = null
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (
        m.role === 'assistant' &&
        !m.systemNote &&
        !m.isStreaming &&
        m.content?.trim()
      ) {
        target = m
        break
      }
    }
    if (!target) return
    const key = `${activeId}:${target.id}`
    if (lastAutoReadKeyRef.current === key) return
    lastAutoReadKeyRef.current = key
    // 新播放顶掉旧的（与手动喇叭语义一致），并接管 playingMsgId 让气泡显示中止态
    stopSpeech()
    const id = target.id
    const text = target.content
    setPlayingMsgId(id)
    autoPlayingRef.current = true
    autoMsgIdRef.current = id
    playText(text, {
      fetchUrl: async (sentence) => {
        const data = await api.textToSpeech(sentence, 'Nini')
        return data.url
      },
      onEnd: () => {
        if (autoMsgIdRef.current !== id) return // 已被手动喇叭接管：别动别人的状态
        autoPlayingRef.current = false
        autoMsgIdRef.current = null
        setPlayingMsgId((prev: string | null) => (prev === id ? null : prev))
      }
    }).catch((e) => {
      console.error('[自动朗读] 播放失败:', e)
      if (autoMsgIdRef.current !== id) return
      autoPlayingRef.current = false
      autoMsgIdRef.current = null
      setPlayingMsgId((prev: string | null) => (prev === id ? null : prev))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, streamingRenderMsg, activeId])

  // 切会话重置跟读记忆（key={activeId} 本就会重挂，这里兜底同实例切会话的情况）
  useEffect(() => {
    lastAutoReadKeyRef.current = null
  }, [activeId])

  // 卸载时若是自动播的就停掉，避免切走后还在后台念
  useEffect(() => {
    return () => {
      if (autoPlayingRef.current) {
        autoPlayingRef.current = false
        stopSpeech()
      }
    }
  }, [])

  return { playingMsgId, handlePlayingChange }
}
