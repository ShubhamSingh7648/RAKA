import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { CHAT_SOCKET_URL } from '../config/runtime'

export type ChatStatus = 'connecting' | 'idle' | 'searching' | 'matched' | 'disconnected'

export type ChatMessage = {
  id: string
  sender: string
  message: string
  timestamp: number
}

export type FriendReqState = {
  canSend: boolean
  sent: boolean
  pendingIncoming: { requestId: string; fromUsername: string } | null
  lastAcceptedAt: number | null
}

export type PrivateChatStart = {
  conversationId: string
  roomId: string
} | null

export type UseChatSocketResult = {
  status: ChatStatus
  messages: ChatMessage[]
  matched: boolean
  onlineCount: number
  skipCooldownMs: number
  isPartnerTyping: boolean
  socketId: string
  error: string | null
  friendReqState: FriendReqState
  privateChatStarted: PrivateChatStart
  sendMessage: (text: string) => void
  skip: () => void
  findMatch: () => void
  sendFriendRequest: () => void
  acceptFriendRequest: (requestId: string) => void
  emitTyping: () => void
  emitStoppedTyping: () => void
  clearError: () => void
}

type UseChatSocketArgs = {
  token: string
  username?: string
}

export function useChatSocket({ token, username }: UseChatSocketArgs): UseChatSocketResult {
  const socketRef = useRef<Socket | null>(null)

  const [status, setStatus] = useState<ChatStatus>('connecting')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [matched, setMatched] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [skipCooldownMs, setSkipCooldownMs] = useState(0)
  const [isPartnerTyping, setIsPartnerTyping] = useState(false)
  const [socketId, setSocketId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [friendReqState, setFriendReqState] = useState<FriendReqState>({
    canSend: false,
    sent: false,
    pendingIncoming: null,
    lastAcceptedAt: null,
  })
  const [privateChatStarted, setPrivateChatStarted] = useState<PrivateChatStart>(null)
  const typingThrottleUntilRef = useRef(0)
  const partnerTypingTimeoutRef = useRef<number | null>(null)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const addSystemMessage = useCallback((message: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sender: 'system',
        message,
        timestamp: Date.now(),
      },
    ])
  }, [])

  useEffect(() => {
    const socket = io(CHAT_SOCKET_URL, {
      transports: ['websocket'],
      auth: token ? { token } : {},
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setSocketId(socket.id || '')
      setStatus('idle')
      setError(null)
      setPrivateChatStarted(null)
      if (token) {
        socket.emit('upgrade_identity', token)
      }
    })

    socket.on('disconnect', () => {
      setStatus('disconnected')
      setMatched(false)
      setIsPartnerTyping(false)
      setSocketId('')
      setFriendReqState((prev) => ({
        ...prev,
        canSend: false,
        pendingIncoming: null,
      }))
    })

    socket.on('online_count', ({ count }: { count: number }) => {
      setOnlineCount(count)
    })

    socket.on('matched', () => {
      setMessages([])
      setMatched(true)
      setIsPartnerTyping(false)
      setStatus('matched')
      setError(null)
      setFriendReqState({
        canSend: Boolean(token),
        sent: false,
        pendingIncoming: null,
        lastAcceptedAt: null,
      })
    })

    socket.on(
      'message',
      (payload: {
        sender: string
        message: string
        timestamp: number
      }) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `${payload.timestamp}-${payload.sender}-${prev.length}`,
            sender: payload.sender,
            message: payload.message,
            timestamp: payload.timestamp,
          },
        ])
      },
    )

    socket.on('partner_skipped', () => {
      setMatched(false)
      setIsPartnerTyping(false)
      setStatus('idle')
      setFriendReqState((prev) => ({
        ...prev,
        canSend: false,
        sent: false,
        pendingIncoming: null,
      }))
      addSystemMessage('Stranger skipped the chat.')
    })

    socket.on('partner_disconnected', () => {
      setMatched(false)
      setIsPartnerTyping(false)
      setStatus('idle')
      setFriendReqState((prev) => ({
        ...prev,
        canSend: false,
        sent: false,
        pendingIncoming: null,
      }))
      addSystemMessage('Stranger disconnected.')
    })

    socket.on('skip_cooldown', ({ remaining }: { remaining: number }) => {
      setSkipCooldownMs(remaining)
      setError(`Skip cooldown: wait ${Math.ceil(remaining / 1000)}s`)
    })

    socket.on('rate_limited', ({ message }: { message: string }) => {
      setError(message)
    })

    socket.on('message_error', ({ message }: { message: string }) => {
      setError(message)
    })

    socket.on('server_error', (payload: { message?: string }) => {
      setError(payload?.message || 'Server error')
    })

    socket.on('friend_error', (payload: { message?: string }) => {
      setError(payload?.message || 'Friend action failed')
      setFriendReqState((prev) => ({ ...prev, sent: false }))
    })

    socket.on('typing', () => {
      setIsPartnerTyping(true)
      if (partnerTypingTimeoutRef.current) {
        window.clearTimeout(partnerTypingTimeoutRef.current)
      }
      partnerTypingTimeoutRef.current = window.setTimeout(() => {
        setIsPartnerTyping(false)
      }, 3000)
    })

    socket.on('stopped_typing', () => {
      setIsPartnerTyping(false)
      if (partnerTypingTimeoutRef.current) {
        window.clearTimeout(partnerTypingTimeoutRef.current)
        partnerTypingTimeoutRef.current = null
      }
    })

    socket.on(
      'friend_request_message',
      (payload: {
        requestId: string
        fromUsername: string
      }) => {
        const isOwn = username ? payload.fromUsername === username : false
        if (isOwn) {
          setFriendReqState((prev) => ({
            ...prev,
            sent: true,
            pendingIncoming: null,
          }))
          return
        }
        setFriendReqState((prev) => ({
          ...prev,
          pendingIncoming: {
            requestId: payload.requestId,
            fromUsername: payload.fromUsername,
          },
        }))
      },
    )

    socket.on('friend_request_accepted', () => {
      setMatched(false)
      setStatus('idle')
      setFriendReqState({
        canSend: false,
        sent: false,
        pendingIncoming: null,
        lastAcceptedAt: Date.now(),
      })
    })

    socket.on(
      'private_chat_started',
      (payload: { conversationId: string; roomId: string }) => {
        setPrivateChatStarted({
          conversationId: payload.conversationId,
          roomId: payload.roomId,
        })
      },
    )

    return () => {
      socket.disconnect()
      if (partnerTypingTimeoutRef.current) {
        window.clearTimeout(partnerTypingTimeoutRef.current)
        partnerTypingTimeoutRef.current = null
      }
      if (socketRef.current === socket) {
        socketRef.current = null
      }
    }
  }, [addSystemMessage, token, username])

  const sendMessage = useCallback((text: string) => {
    const socket = socketRef.current
    const trimmed = text.trim()
    if (!socket || !trimmed) return
    socket.emit('message', trimmed)
    socket.emit('stopped_typing')
  }, [])

  const skip = useCallback(() => {
    const socket = socketRef.current
    if (!socket) return
    setMatched(false)
    setStatus('searching')
    setMessages([])
    setIsPartnerTyping(false)
    setFriendReqState((prev) => ({
      ...prev,
      canSend: false,
      sent: false,
      pendingIncoming: null,
    }))
    socket.emit('skip')
  }, [])

  const findMatch = useCallback(() => {
    const socket = socketRef.current
    if (!socket) return
    setError(null)
    setStatus('searching')
    socket.emit('find_match')
  }, [])

  const sendFriendRequest = useCallback(() => {
    const socket = socketRef.current
    if (!socket) return
    setError(null)
    setFriendReqState((prev) => ({ ...prev, sent: true }))
    socket.emit('send_friend_request')
  }, [])

  const acceptFriendRequest = useCallback((requestId: string) => {
    const socket = socketRef.current
    const trimmed = requestId.trim()
    if (!socket || !trimmed) return
    setError(null)
    socket.emit('accept_friend_request', trimmed)
  }, [])

  const emitTyping = useCallback(() => {
    const socket = socketRef.current
    if (!socket || !matched) return
    const now = Date.now()
    if (now < typingThrottleUntilRef.current) return
    typingThrottleUntilRef.current = now + 2000
    socket.emit('typing')
  }, [matched])

  const emitStoppedTyping = useCallback(() => {
    const socket = socketRef.current
    if (!socket || !matched) return
    socket.emit('stopped_typing')
  }, [matched])

  const value = useMemo<UseChatSocketResult>(
    () => ({
      status,
      messages,
      matched,
      onlineCount,
      skipCooldownMs,
      isPartnerTyping,
      socketId,
      error,
      friendReqState: {
        ...friendReqState,
        canSend: matched && Boolean(token) && !friendReqState.sent,
      },
      privateChatStarted,
      sendMessage,
      skip,
      findMatch,
      sendFriendRequest,
      acceptFriendRequest,
      emitTyping,
      emitStoppedTyping,
      clearError,
    }),
    [
      clearError,
      error,
      findMatch,
      friendReqState,
      matched,
      messages,
      onlineCount,
      skipCooldownMs,
      isPartnerTyping,
      privateChatStarted,
      sendFriendRequest,
      sendMessage,
      skip,
      emitTyping,
      emitStoppedTyping,
      socketId,
      status,
      token,
      acceptFriendRequest,
    ],
  )

  return value
}
