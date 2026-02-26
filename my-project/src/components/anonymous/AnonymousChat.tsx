import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { UseChatSocketResult } from '../../hooks/useChatSocket'
import { useSwipeToSkip } from '../../hooks/useSwipeToSkip'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AnonymousChat() {
  const navigate = useNavigate()
  const chat = useOutletContext<UseChatSocketResult>()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [input, setInput] = useState('')

  useSwipeToSkip({
    container: containerRef.current,
    enabled: chat.matched,
    onSwipe: chat.skip,
  })

  useEffect(() => {
    const conversationId = chat.privateChatStarted?.conversationId
    if (!conversationId) return
    navigate(`/chat/private/${conversationId}`, { replace: true })
  }, [chat.privateChatStarted?.conversationId, navigate])

  const statusLabel = useMemo(() => {
    if (chat.status === 'searching') return 'Searching for a stranger...'
    if (chat.status === 'matched') return 'Connected with a stranger'
    if (chat.status === 'disconnected') return 'Disconnected. Reconnecting...'
    if (chat.status === 'connecting') return 'Connecting...'
    return 'Connected. Start random chat.'
  }, [chat.status])

  const send = () => {
    const text = input.trim()
    if (!text) return
    chat.sendMessage(text)
    chat.emitStoppedTyping()
    setInput('')
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-xs text-slate-400">
        <div>{statusLabel}</div>
        <div className="mt-1">{chat.onlineCount} online</div>
        {chat.skipCooldownMs > 0 && (
          <div className="mt-1 text-[11px] text-amber-300">
            Skip cooldown active: {Math.ceil(chat.skipCooldownMs / 1000)}s
          </div>
        )}
      </div>

      {chat.error && (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          <div className="flex items-center justify-between gap-3">
            <span>{chat.error}</span>
            <button
              type="button"
              onClick={chat.clearError}
              className="rounded border border-rose-400/40 px-2 py-0.5 text-[10px] uppercase tracking-wide"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {chat.friendReqState.pendingIncoming && (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100">
          <div className="flex items-center justify-between gap-2">
            <span>
              {chat.friendReqState.pendingIncoming.fromUsername} sent a friend request.
            </span>
            <button
              type="button"
              onClick={() => chat.acceptFriendRequest(chat.friendReqState.pendingIncoming!.requestId)}
              className="rounded border border-emerald-300/40 bg-emerald-500/20 px-2 py-1 text-[11px] font-medium"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {!chat.matched && (
          <div className="mx-auto max-w-md rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-center text-xs text-slate-400">
            <div>Quick skip shortcuts</div>
            <div className="mt-1 hidden sm:block">Desktop: press Shift + Enter to skip</div>
            <div className="mt-1 sm:hidden">Mobile: swipe right to left to skip</div>
          </div>
        )}
        {chat.isPartnerTyping && (
          <div className="text-xs text-slate-400">Stranger is typing...</div>
        )}
        {chat.messages.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-500">
            No messages yet.
          </div>
        )}

        {chat.messages.map((msg) => {
          const isSystem = msg.sender === 'system'
          const own = !isSystem && msg.sender === chat.socketId
          if (isSystem) {
            return (
              <div
                key={msg.id}
                className="mx-auto w-fit rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-400"
              >
                {msg.message}
              </div>
            )
          }
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
                <div>{msg.message}</div>
                <div className="mt-1 text-[11px] text-slate-400">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-slate-800 p-3">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={chat.findMatch}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
          >
            Start Random
          </button>
          <button
            type="button"
            onClick={chat.skip}
            disabled={!chat.matched}
            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={chat.sendFriendRequest}
            disabled={!chat.friendReqState.canSend}
            className="rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {chat.friendReqState.sent ? 'Request Sent' : 'Add Friend'}
          </button>
        </div>

        <div className="flex items-end gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (e.target.value.trim()) {
                chat.emitTyping()
              } else {
                chat.emitStoppedTyping()
              }
            }}
            placeholder="Type a message"
            rows={1}
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none"
            onBlur={chat.emitStoppedTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault()
                chat.skip()
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={!chat.matched || !input.trim()}
            className="rounded-md bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
