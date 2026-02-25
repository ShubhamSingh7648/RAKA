import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import LeftSidebar, { type PrivateConversationItem } from './LeftSidebar'
import RightSidebar from './RightSidebar'
import { useAuth } from '../context/AuthContext'

export default function AppLayout() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarConversations, setSidebarConversations] = useState<PrivateConversationItem[]>([])
  const [anonymousActive, setAnonymousActive] = useState(false)

  const selectedAnonymous = location.pathname === '/chat/random'
  const selectedConversationId = location.pathname.startsWith('/chat/private/')
    ? location.pathname.replace('/chat/private/', '')
    : null
  const query = new URLSearchParams(location.search)
  const selectedConversation = sidebarConversations.find(
    (conversation) => conversation.conversationId === selectedConversationId,
  )
  const headerTitle = (() => {
    if (location.pathname === '/chat') return 'No chat selected'
    if (location.pathname === '/chat/random') return 'Stranger'
    if (location.pathname.startsWith('/chat/private/')) {
      return selectedConversation?.name || query.get('name')?.trim() || 'Conversation'
    }
    return 'No chat selected'
  })()
  const refreshPrivateConversations = useCallback(
    (privateSocket: Socket) => {
      privateSocket.emit('list_private_conversations')
    },
    [],
  )

  useEffect(() => {
    if (!token) return

    const privateSocket = io('http://localhost:3001/private', {
      transports: ['websocket'],
      auth: { token },
    })

    privateSocket.on('connect', () => {
      refreshPrivateConversations(privateSocket)
    })

    privateSocket.on(
      'private_conversations_listed',
      ({
        conversations,
      }: {
        conversations: Array<{
          conversationId: string
          participantUserIds: string[]
          participantProfiles: Array<{ userId: string; username: string }>
          lastMessage: { senderId: string; content: string; createdAt: number } | null
          updatedAt: number
          isActive: boolean
        }>
      }) => {
        const mapped: PrivateConversationItem[] = conversations.map((conversation) => ({
          conversationId: conversation.conversationId,
          name:
            conversation.participantProfiles.find((profile) => profile.userId !== user?._id)
              ?.username || `Chat ${conversation.conversationId.slice(-6)}`,
          lastMessagePreview: conversation.lastMessage?.content || 'No messages yet',
          unreadCount: 0,
        }))
        setSidebarConversations(mapped)
      },
    )

    const onBridgeMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.source !== 'chat-window') return
      if (data.type === 'random_matched') {
        setAnonymousActive(true)
      }
      if (data.type === 'random_disconnected') {
        setAnonymousActive(false)
      }
      if (data.type === 'friend_request_accepted') {
        setAnonymousActive(false)
        refreshPrivateConversations(privateSocket)
      }
    }

    const onPrivateRefresh = () => {
      refreshPrivateConversations(privateSocket)
    }

    window.addEventListener('message', onBridgeMessage)
    window.addEventListener('private-conversations:refresh', onPrivateRefresh)

    return () => {
      window.removeEventListener('message', onBridgeMessage)
      window.removeEventListener('private-conversations:refresh', onPrivateRefresh)
      privateSocket.disconnect()
    }
  }, [refreshPrivateConversations, token, user?._id])

  return (
    <div className="h-dvh w-full overflow-hidden bg-slate-900">
      <div className="flex h-full w-full">
        <div className="hidden h-full w-[280px] shrink-0 border-r border-slate-800 md:block">
          <LeftSidebar
            anonymousChat={{
              active: anonymousActive,
              name: 'Stranger',
              lastMessagePreview: anonymousActive ? 'Anonymous chat is active' : 'Start new',
            }}
            privateConversations={sidebarConversations}
            selectedAnonymous={selectedAnonymous}
            selectedConversationId={selectedConversationId}
            onNavigate={(path) => navigate(path)}
          />
        </div>

        <main className="flex h-full min-w-0 flex-1 flex-col">
          <div className="h-14 shrink-0 border-b border-slate-800 px-4">
            <div className="flex h-full items-center text-sm font-semibold text-slate-100">
              {headerTitle}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </main>

        <div className="hidden h-full w-[300px] shrink-0 border-l border-slate-800 md:block">
          <RightSidebar isPrivateView={false} />
        </div>
      </div>
    </div>
  )
}
