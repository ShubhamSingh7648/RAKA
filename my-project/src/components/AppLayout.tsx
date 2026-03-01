import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import Logo from './Logo'
import LeftSidebar, { type PrivateConversationItem } from './LeftSidebar'
import AuthModal from './AuthModal'
import ProfileEditModal from './ProfileEditModal'
import RightSidebar from './RightSidebar'
import { useAuth } from '../context/AuthContext'
import { useChatSocket } from '../hooks/useChatSocket'
import { PRIVATE_SOCKET_URL } from '../config/runtime'

export default function AppLayout() {
  const { token, user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarConversations, setSidebarConversations] = useState<PrivateConversationItem[]>([])
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const privateSocketRef = useRef<Socket | null>(null)
  const anonymousChat = useChatSocket({ token, username: user?.username })

  const selectedAnonymous = location.pathname === '/chat/random'
  const selectedFriends = location.pathname === '/chat/friends'
  const selectedPrivate = location.pathname.startsWith('/chat/private')
  const selectedProfile = location.pathname.startsWith('/chat/profile')
  const selectedConversationId = location.pathname.startsWith('/chat/private/')
    ? location.pathname.replace('/chat/private/', '')
    : null
  const refreshPrivateConversations = useCallback(
    (privateSocket: Socket) => {
      privateSocket.emit('list_private_conversations')
    },
    [],
  )

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      const privateSocket = privateSocketRef.current
      if (!privateSocket) return
      privateSocket.emit('delete_private_conversation', { conversationId })
      setSidebarConversations((prev) =>
        prev.filter((conversation) => conversation.conversationId !== conversationId),
      )
      refreshPrivateConversations(privateSocket)
    },
    [refreshPrivateConversations],
  )

  useEffect(() => {
    if (!token) return

    const privateSocket = io(PRIVATE_SOCKET_URL, {
      transports: ['websocket'],
      auth: { token },
    })
    privateSocketRef.current = privateSocket

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
          unreadCount?: number
        }>
      }) => {
        const mapped: PrivateConversationItem[] = conversations.map((conversation) => ({
          conversationId: conversation.conversationId,
          name:
            conversation.participantProfiles.find((profile) => profile.userId !== user?._id)
              ?.username || `Chat ${conversation.conversationId.slice(-6)}`,
          lastMessagePreview: conversation.lastMessage?.content || 'No messages yet',
          unreadCount: conversation.unreadCount ?? 0,
        }))
        setSidebarConversations(mapped)
      },
    )

    const onPrivateRefresh = () => {
      refreshPrivateConversations(privateSocket)
    }

    window.addEventListener('private-conversations:refresh', onPrivateRefresh)

    return () => {
      window.removeEventListener('private-conversations:refresh', onPrivateRefresh)
      if (privateSocketRef.current === privateSocket) {
        privateSocketRef.current = null
      }
      privateSocket.disconnect()
    }
  }, [refreshPrivateConversations, token, user?._id])

  useEffect(() => {
    if (!anonymousChat.friendReqState.lastAcceptedAt) return
    privateSocketRef.current?.emit('list_private_conversations')
  }, [anonymousChat.friendReqState.lastAcceptedAt])

  useEffect(() => {
    if (!anonymousChat.privateChatStarted?.conversationId) return
    privateSocketRef.current?.emit('list_private_conversations')
  }, [anonymousChat.privateChatStarted?.conversationId])

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname, location.search])

  const lastAnonymousMessagePreview = anonymousChat.messages
    .slice()
    .reverse()
    .find((message) => message.sender !== 'system')?.message

  return (
    <div className="h-dvh w-full overflow-hidden bg-slate-900">
      <div className="flex h-full w-full">
        <div className="hidden h-full w-[280px] shrink-0 border-r border-slate-800 md:block">
          <LeftSidebar
            anonymousChat={{
              active: anonymousChat.matched,
              name: 'Stranger',
              lastMessagePreview:
                anonymousChat.matched && lastAnonymousMessagePreview
                  ? lastAnonymousMessagePreview
                  : anonymousChat.matched
                    ? 'Anonymous chat is active'
                    : 'Start new',
            }}
            privateConversations={sidebarConversations}
            selectedAnonymous={selectedAnonymous}
            selectedFriends={selectedFriends}
            selectedConversationId={selectedConversationId}
            onNavigate={(path) => navigate(path)}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>

        <div
          className={[
            'fixed inset-0 z-40 md:hidden',
            sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none',
          ].join(' ')}
        >
          <div
            onClick={() => setSidebarOpen(false)}
            className={[
              'absolute inset-0 bg-black/50 transition-opacity',
              sidebarOpen ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />
          <div
            className={[
              'absolute inset-y-0 left-0 w-[86%] max-w-[320px] border-r border-slate-800 bg-slate-950 transition-transform',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            ].join(' ')}
          >
            <LeftSidebar
              anonymousChat={{
                active: anonymousChat.matched,
                name: 'Stranger',
                lastMessagePreview:
                  anonymousChat.matched && lastAnonymousMessagePreview
                    ? lastAnonymousMessagePreview
                    : anonymousChat.matched
                      ? 'Anonymous chat is active'
                      : 'Start new',
              }}
              privateConversations={sidebarConversations}
              selectedAnonymous={selectedAnonymous}
              selectedFriends={selectedFriends}
              selectedConversationId={selectedConversationId}
              onNavigate={(path) => navigate(path)}
              onDeleteConversation={handleDeleteConversation}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>

        <main className="flex h-full min-w-0 flex-1 flex-col">
          <div className="h-14 shrink-0 border-b border-slate-800 px-4">
            <div className="flex h-full items-center justify-between text-sm font-semibold text-slate-100">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 md:hidden"
                  aria-label="Open chats sidebar"
                >
                  Menu
                </button>
                <Logo size="sm" />
              </div>
              <div className="flex items-center gap-2">
                {isAuthenticated ? (
                  <>
                    <span className="hidden text-xs text-slate-400 sm:block">{user?.username}</span>
                    <button
                      type="button"
                      onClick={logout}
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="rounded-md border border-violet-500/40 bg-violet-500/15 px-2 py-1 text-xs text-violet-100"
                  >
                    Login
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 pb-14 md:pb-0">
            <Outlet context={anonymousChat} />
          </div>
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 p-2 md:hidden">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => navigate('/chat/random')}
                className={[
                  'flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium',
                  selectedAnonymous
                    ? 'bg-violet-500/20 text-violet-200'
                    : 'bg-slate-900 text-slate-300',
                ].join(' ')}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M5 9.5V21h14V9.5" />
                </svg>
                Home
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate(selectedConversationId ? `/chat/private/${selectedConversationId}` : '/chat/private')
                }
                className={[
                  'flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium',
                  selectedPrivate
                    ? 'bg-violet-500/20 text-violet-200'
                    : 'bg-slate-900 text-slate-300',
                ].join(' ')}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18" />
                  <path d="M3 12h18" />
                  <path d="M3 18h18" />
                </svg>
                Chats
              </button>
              <button
                type="button"
                onClick={() => navigate('/chat/profile')}
                className={[
                  'flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium',
                  selectedProfile
                    ? 'bg-violet-500/20 text-violet-200'
                    : 'bg-slate-900 text-slate-300',
                ].join(' ')}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
                You
              </button>
            </div>
          </nav>
        </main>

        <div className="hidden h-full w-[300px] shrink-0 border-l border-slate-800 md:block">
          <RightSidebar
            isPrivateView={false}
            onEditProfile={() => setShowProfileEdit(true)}
          />
        </div>
      </div>
      <ProfileEditModal open={showProfileEdit} onClose={() => setShowProfileEdit(false)} />
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}
