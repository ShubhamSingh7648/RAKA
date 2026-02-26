import { useState } from 'react'

export type AnonymousChatItem = {
  active: boolean
  name: string
  lastMessagePreview?: string
  unreadCount?: number
}

export type PrivateConversationItem = {
  conversationId: string
  name: string
  lastMessagePreview?: string
  unreadCount?: number
}

type LeftSidebarProps = {
  anonymousChat?: AnonymousChatItem | null
  privateConversations?: PrivateConversationItem[]
  selectedConversationId?: string | null
  selectedAnonymous?: boolean
  selectedFriends?: boolean
  onNavigate?: (path: string) => void
  onDeleteConversation?: (conversationId: string) => void
  onClose?: () => void
}

function UnreadBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null
  return (
    <span className="ml-2 rounded-full bg-violet-500/25 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function LeftSidebar({
  anonymousChat = null,
  privateConversations = [],
  selectedConversationId = null,
  selectedAnonymous = false,
  selectedFriends = false,
  onNavigate,
  onDeleteConversation,
  onClose,
}: LeftSidebarProps) {
  const [pendingDelete, setPendingDelete] = useState<PrivateConversationItem | null>(null)
  const hasAnonymous = Boolean(anonymousChat?.active)
  const anonymousName = hasAnonymous ? anonymousChat?.name || 'Stranger' : 'Anonymous Chat'
  const anonymousSubtitle = hasAnonymous
    ? anonymousChat?.lastMessagePreview || 'Anonymous chat is active'
    : 'Start new'

  const handleAnonymousClick = () => {
    onNavigate?.('/chat/random')
  }

  const handlePrivateClick = (conversationId: string) => {
    onNavigate?.(`/chat/private/${conversationId}`)
  }

  const handleFriendsClick = () => {
    onNavigate?.('/chat/friends')
  }

  return (
    <aside className="h-full w-full bg-slate-950 text-slate-100">
      <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
        <h2 className="text-sm font-semibold tracking-wide">Chats</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs md:hidden"
          >
            Close
          </button>
        )}
      </div>

      <div className="h-[calc(100%-56px)] overflow-y-auto p-3">
        <div className="mb-3">
          <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Anonymous
          </div>
          <button
            type="button"
            onClick={handleAnonymousClick}
            className={[
              'group w-full rounded-xl border px-3 py-2 text-left transition',
              selectedAnonymous
                ? 'border-violet-500/40 bg-slate-800 shadow-[0_0_0_1px_rgba(124,106,255,0.2)]'
                : 'border-slate-800 bg-slate-900 hover:border-violet-500/20 hover:bg-slate-800',
            ].join(' ')}
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-medium text-slate-100">{anonymousName}</span>
              <UnreadBadge count={hasAnonymous ? anonymousChat?.unreadCount : undefined} />
            </div>
            <div className="mt-1 truncate text-xs text-slate-400">{anonymousSubtitle}</div>
          </button>
        </div>

        <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Private
        </div>

        <button
          type="button"
          onClick={handleFriendsClick}
          className={[
            'mb-3 w-full rounded-xl border px-3 py-2 text-left transition',
            selectedFriends
              ? 'border-violet-500/40 bg-slate-800 shadow-[0_0_0_1px_rgba(124,106,255,0.2)]'
              : 'border-slate-800 bg-slate-900 hover:border-violet-500/20 hover:bg-slate-800',
          ].join(' ')}
        >
          <div className="text-sm font-medium text-slate-100">Friends</div>
          <div className="mt-1 text-xs text-slate-400">Open friend list</div>
        </button>

        <div className="space-y-1">
          {privateConversations.map((chat) => {
            const isSelected = selectedConversationId === chat.conversationId
            return (
              <div
                key={chat.conversationId}
                className={[
                  'group rounded-xl border transition',
                  isSelected
                    ? 'border-violet-500/40 bg-slate-800 shadow-[0_0_0_1px_rgba(124,106,255,0.2)]'
                    : 'border-slate-800 bg-slate-900 hover:border-violet-500/20 hover:bg-slate-800',
                ].join(' ')}
              >
                <div className="flex items-center px-3 py-2">
                  <button
                    type="button"
                    onClick={() => handlePrivateClick(chat.conversationId)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {chat.name}
                      </span>
                      <UnreadBadge count={chat.unreadCount} />
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-400">
                      {chat.lastMessagePreview || 'No messages yet'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPendingDelete(chat)}
                    className="ml-2 rounded-md px-2 py-1 text-xs text-slate-400 opacity-0 transition hover:bg-slate-700 hover:text-rose-300 group-hover:opacity-100"
                    aria-label={`Delete ${chat.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {!privateConversations.length && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-4 text-xs text-slate-500">
            No private conversations yet.
          </div>
        )}
      </div>

      {pendingDelete && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-3">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100">Delete conversation?</h3>
            <p className="mt-2 text-xs text-slate-400">
              This will remove <span className="text-slate-200">{pendingDelete.name}</span> from
              your list.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteConversation?.(pendingDelete.conversationId)
                  setPendingDelete(null)
                }}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
