import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type FriendItem = {
  userId: string
  username: string
  friendsSince: number
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString()
}

export default function FriendsList() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [friends, setFriends] = useState<FriendItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setLoading(true)
    setError('')

    fetch(`${API_BASE_URL}/api/v1/friends`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load friends')
        }
        const payload = (await response.json()) as {
          data?: { friends?: FriendItem[] }
        }
        if (!cancelled) {
          setFriends(payload?.data?.friends || [])
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load friends')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const hasFriends = useMemo(() => friends.length > 0, [friends.length])

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">
        Friends
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading && <div className="text-sm text-slate-400">Loading friends...</div>}
        {!loading && error && <div className="text-sm text-rose-300">{error}</div>}

        {!loading && !error && !hasFriends && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-5 text-sm text-slate-400">
            No friends yet. Add people from anonymous chat to see them here.
          </div>
        )}

        {!loading && !error && hasFriends && (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div
                key={friend.userId}
                className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {friend.username}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Friends since {formatDate(friend.friendsSince)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/chat/private?friendUserId=${friend.userId}`)}
                    className="rounded-md border border-violet-500/35 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200"
                  >
                    Open Chat
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
