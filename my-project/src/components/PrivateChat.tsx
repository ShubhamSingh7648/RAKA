import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type PrivateMessage = {
  id: string
  conversationId: string
  senderId: string
  content: string
  createdAt: number
  readBy: string[]
}

type PrivateError = {
  message: string
  statusCode?: number
}

const PRIVATE_SOCKET_URL = 'http://localhost:3001/private'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function PrivateChat() {
  const navigate = useNavigate()
  const { conversationId: routeConversationId } = useParams<{ conversationId?: string }>()
  const [searchParams] = useSearchParams()
  const { token, user } = useAuth()

  const socketRef = useRef<Socket | null>(null)
  const messagesWrapRef = useRef<HTMLDivElement | null>(null)
  const paginationSentinelRef = useRef<HTMLDivElement | null>(null)
  const markedReadRef = useRef<Set<string>>(new Set())
  const pendingLoadCursorRef = useRef<string | null>(null)
  const typingThrottleUntilRef = useRef(0)
  const partnerTypingTimeoutRef = useRef<number | null>(null)

  const [messages, setMessages] = useState<PrivateMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string>('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isPartnerTyping, setIsPartnerTyping] = useState(false)
  const [isPartnerOnline, setIsPartnerOnline] = useState<boolean | null>(null)

  const friendUserId = useMemo(() => searchParams.get('friendUserId')?.trim() || '', [searchParams])
  const wordCount = useMemo(
    () => input.trim().split(/\s+/).filter(Boolean).length,
    [input],
  )
  const overWordLimit = wordCount > 30

  // Effect 1: socket lifecycle (depends only on token)
  useEffect(() => {
    if (!token) return

    const s = io(PRIVATE_SOCKET_URL, {
      transports: ['websocket'],
      auth: { token },
    })
    socketRef.current = s

    s.on('private_error', (err: PrivateError) => {
      const message = err?.message || 'Private socket error'
      setError(message)
      setLoadingHistory(false)
      setLoadingMore(false)
      setIsPartnerTyping(false)
      setIsPartnerOnline(null)

      const isMissingConversation =
        err?.statusCode === 404 &&
        routeConversationId &&
        message.toLowerCase().includes('conversation not found')

      if (isMissingConversation) {
        window.dispatchEvent(new CustomEvent('private-conversations:refresh'))
        navigate('/chat', { replace: true })
      }
    })

    s.on('private_chat_opened', ({ conversationId: openedConversationId }: { conversationId: string }) => {
      navigate(`/chat/private/${openedConversationId}`, { replace: true })
    })

    s.on(
      'private_messages_loaded',
      ({
        conversationId: loadedConversationId,
        messages: loadedMessages,
        nextCursor: loadedNextCursor,
      }: {
        conversationId: string
        messages: Array<{ id: string; senderId: string; content: string; createdAt: number; readBy: string[] }>
        nextCursor: string | null
      }) => {
        const requestedCursor = pendingLoadCursorRef.current
        pendingLoadCursorRef.current = null

        setLoadingHistory(false)
        setLoadingMore(false)
        setNextCursor(loadedNextCursor)

        const mapped = loadedMessages.map((m) => ({
          id: m.id,
          conversationId: loadedConversationId,
          senderId: m.senderId,
          content: m.content,
          createdAt: m.createdAt,
          readBy: m.readBy ?? [],
        }))

        if (requestedCursor) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id))
            const toPrepend = mapped.filter((m) => !seen.has(m.id))
            return [...toPrepend, ...prev]
          })
          return
        }

        setMessages(mapped)
      },
    )

    s.on(
      'private_message',
      (payload: { id: string; conversationId: string; senderId: string; content: string; createdAt: number; readBy: string[] }) => {
        setMessages((prev) => {
          return [
            ...prev,
            {
              id: payload.id,
              conversationId: payload.conversationId,
              senderId: payload.senderId,
              content: payload.content,
              createdAt: payload.createdAt,
              readBy: payload.readBy ?? [],
            },
          ]
        })
      },
    )

    s.on(
      'private_message_read',
      ({ messageId, readerId }: { conversationId: string; messageId: string; readerId: string }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId && !m.readBy.includes(readerId)
              ? { ...m, readBy: [...m.readBy, readerId] }
              : m,
          ),
        )
      },
    )

    s.on(
      'typing',
      ({ conversationId, userId }: { conversationId: string; userId: string }) => {
        if (!routeConversationId || conversationId !== routeConversationId) return
        if (user?._id && userId === user._id) return

        setIsPartnerTyping(true)
        if (partnerTypingTimeoutRef.current) {
          window.clearTimeout(partnerTypingTimeoutRef.current)
        }
        partnerTypingTimeoutRef.current = window.setTimeout(() => {
          setIsPartnerTyping(false)
        }, 3000)
      },
    )

    s.on(
      'stopped_typing',
      ({ conversationId, userId }: { conversationId: string; userId: string }) => {
        if (!routeConversationId || conversationId !== routeConversationId) return
        if (user?._id && userId === user._id) return

        setIsPartnerTyping(false)
        if (partnerTypingTimeoutRef.current) {
          window.clearTimeout(partnerTypingTimeoutRef.current)
          partnerTypingTimeoutRef.current = null
        }
      },
    )

    s.on(
      'private_presence',
      ({ conversationId, userId, isOnline }: { conversationId: string; userId: string; isOnline: boolean }) => {
        if (!routeConversationId || conversationId !== routeConversationId) return
        if (user?._id && userId === user._id) return
        setIsPartnerOnline(isOnline)
      },
    )

    return () => {
      if (routeConversationId) {
        s.emit('stopped_typing', { conversationId: routeConversationId })
      }
      s.disconnect()
      if (socketRef.current === s) {
        socketRef.current = null
      }
      if (partnerTypingTimeoutRef.current) {
        window.clearTimeout(partnerTypingTimeoutRef.current)
        partnerTypingTimeoutRef.current = null
      }
    }
  }, [navigate, routeConversationId, token, user?._id])

  // Effect 2: load conversation history when conversation changes
  useEffect(() => {
    markedReadRef.current.clear()
    setMessages([])
    setError('')
    setNextCursor(null)
    setLoadingMore(false)
    setIsPartnerTyping(false)
    setIsPartnerOnline(null)
    pendingLoadCursorRef.current = null

    const socket = socketRef.current
    if (!socket || !routeConversationId) return

    setLoadingHistory(true)
    pendingLoadCursorRef.current = null
    socket.emit('load_private_messages', { conversationId: routeConversationId, limit: 30 })
  }, [routeConversationId])

  // Mark read (deduplicated)
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !routeConversationId || messages.length === 0 || !user?._id) return

    const unread = messages.filter((m) => m.senderId !== user._id && !m.readBy.includes(user._id))
    unread.forEach((m) => {
      if (markedReadRef.current.has(m.id)) return
      socket.emit('mark_read', { conversationId: routeConversationId, messageId: m.id })
      markedReadRef.current.add(m.id)
    })
  }, [routeConversationId, messages, user?._id])

  // Open chat by friendUserId when route conversation isn't set
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || routeConversationId || !friendUserId) return
    socket.emit('open_private_chat', { friendUserId })
  }, [routeConversationId, friendUserId])

  // Pagination: load older messages when top sentinel enters viewport
  useEffect(() => {
    const wrap = messagesWrapRef.current
    const sentinel = paginationSentinelRef.current
    const socket = socketRef.current
    if (!wrap || !sentinel || !socket || !routeConversationId || !nextCursor || loadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || loadingMore) return
        setLoadingMore(true)
        pendingLoadCursorRef.current = nextCursor
        socket.emit('load_private_messages', {
          conversationId: routeConversationId,
          cursor: nextCursor,
          limit: 30,
        })
      },
      {
        root: wrap,
        threshold: 0.1,
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [routeConversationId, nextCursor, loadingMore])

  const sendMessage = () => {
    const content = input.trim()
    const socket = socketRef.current
    if (!socket || !routeConversationId || !content || overWordLimit) return

    socket.emit('send_private_message', { conversationId: routeConversationId, content })
    socket.emit('stopped_typing', { conversationId: routeConversationId })
    setInput('')
  }

  const emitTyping = () => {
    const socket = socketRef.current
    if (!socket || !routeConversationId) return

    const now = Date.now()
    if (now < typingThrottleUntilRef.current) return
    typingThrottleUntilRef.current = now + 2000

    socket.emit('typing', { conversationId: routeConversationId })
  }

  const emitStoppedTyping = () => {
    const socket = socketRef.current
    if (!socket || !routeConversationId) return
    socket.emit('stopped_typing', { conversationId: routeConversationId })
  }

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    const onDeleted = ({ conversationId }: { conversationId: string }) => {
      window.dispatchEvent(new CustomEvent('private-conversations:refresh'))
      if (conversationId === routeConversationId) {
        navigate('/chat', { replace: true })
      }
    }
    socket.on('delete_private_conversation_success', onDeleted)
    return () => {
      socket.off('delete_private_conversation_success', onDeleted)
    }
  }, [navigate, routeConversationId])

  if (!routeConversationId) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 px-6 text-center text-slate-300">
        <div>
          <div className="text-xl font-semibold">Select a chat</div>
          <p className="mt-2 text-sm text-slate-500">
            Choose a private conversation from the sidebar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      {error && <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">{error}</div>}
      {isPartnerOnline !== null && (
        <div
          className={[
            'border-b px-4 py-2 text-xs',
            isPartnerOnline
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
              : 'border-slate-800 text-slate-400',
          ].join(' ')}
        >
          {isPartnerOnline ? 'Partner online' : 'Partner offline'}
        </div>
      )}
      {isPartnerTyping && (
        <div className="border-b border-slate-800 px-4 py-2 text-xs text-slate-400">typing...</div>
      )}

      <div ref={messagesWrapRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {nextCursor && (
          <div ref={paginationSentinelRef} className="flex items-center justify-center py-1 text-[11px] text-slate-500">
            {loadingMore ? 'Loading older messages...' : 'Load older messages'}
          </div>
        )}
        {loadingHistory && <div className="text-xs text-slate-500">Loading messages...</div>}
        {!loadingHistory && messages.length === 0 && (
          <div className="text-xs text-slate-500">No messages yet.</div>
        )}

        {messages.map((msg) => {
          const own = user?._id ? msg.senderId === user._id : false
          return (
            <div key={msg.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[75%] min-w-0 rounded-xl border px-3 py-2 text-sm break-words [overflow-wrap:anywhere]',
                  own
                    ? 'border-violet-500/30 bg-violet-500/15 text-violet-100'
                    : 'border-slate-800 bg-slate-900 text-slate-100',
                ].join(' ')}
              >
                <div>{msg.content}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{formatTime(msg.createdAt)}</span>
                  {own && <span>{msg.readBy.length > 0 ? '✓✓' : '✓'}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-slate-800 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (e.target.value.trim()) {
                emitTyping()
              } else {
                emitStoppedTyping()
              }
            }}
            placeholder="Type a private message"
            rows={1}
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none"
            onBlur={emitStoppedTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!routeConversationId || !input.trim() || overWordLimit}
            className="rounded-md bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <div
          className={[
            'mt-2 text-[11px]',
            wordCount > 25 ? 'text-rose-300' : 'text-slate-500',
          ].join(' ')}
        >
          {wordCount} / 30 words
        </div>
      </div>
    </div>
  )
}
