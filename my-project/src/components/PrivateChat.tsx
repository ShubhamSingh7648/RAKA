import { useEffect, useState } from 'react'
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

  const [socket, setSocket] = useState<Socket | null>(null)
  const [messages, setMessages] = useState<PrivateMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string>('')
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    setMessages([])
    setError('')
  }, [routeConversationId])

  useEffect(() => {
    if (!token) return

    const s = io(PRIVATE_SOCKET_URL, {
      transports: ['websocket'],
      auth: { token },
    })

    s.on('private_error', (err: PrivateError) => {
      const message = err?.message || 'Private socket error'
      setError(message)
      setLoadingHistory(false)

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
      }: {
        conversationId: string
        messages: Array<{ id: string; senderId: string; content: string; createdAt: number; readBy: string[] }>
      }) => {
        setLoadingHistory(false)
        setMessages(
          loadedMessages.map((m) => ({
            id: m.id,
            conversationId: loadedConversationId,
            senderId: m.senderId,
            content: m.content,
            createdAt: m.createdAt,
            readBy: m.readBy ?? [],
          })),
        )
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

    setSocket(s)

    return () => {
      s.disconnect()
      setSocket(null)
    }
  }, [navigate, routeConversationId, token])

  useEffect(() => {
    if (!socket || !routeConversationId) return
    setLoadingHistory(true)
    socket.emit('load_private_messages', { conversationId: routeConversationId, limit: 30 })
  }, [socket, routeConversationId])

  useEffect(() => {
    if (!socket || !routeConversationId || messages.length === 0 || !user?._id) return

    const unread = messages.filter((m) => m.senderId !== user._id && !m.readBy.includes(user._id))
    unread.forEach((m) => {
      socket.emit('mark_read', { conversationId: routeConversationId, messageId: m.id })
    })
  }, [socket, routeConversationId, messages, user?._id])

  useEffect(() => {
    if (!socket || routeConversationId || !searchParams.get('friendUserId')) return
    socket.emit('open_private_chat', { friendUserId: searchParams.get('friendUserId') })
  }, [socket, routeConversationId, searchParams])

  const sendMessage = () => {
    const content = input.trim()
    if (!socket || !routeConversationId || !content) return

    socket.emit('send_private_message', { conversationId: routeConversationId, content })
    setInput('')
  }

  const deleteConversation = () => {
    if (!socket || !routeConversationId) return
    socket.emit('delete_private_conversation', { conversationId: routeConversationId })
    setMessages([])
  }

  useEffect(() => {
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
  }, [navigate, routeConversationId, socket])

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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={deleteConversation}
            disabled={!routeConversationId}
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete
          </button>
        </div>
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
                  'max-w-[75%] rounded-xl border px-3 py-2 text-sm',
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
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a private message"
            rows={1}
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none"
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
            disabled={!routeConversationId || !input.trim()}
            className="rounded-md bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
