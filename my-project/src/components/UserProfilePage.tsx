import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type PublicUserProfile = {
  userId: string
  username: string
  bio?: string
  displayPicture?: string
  createdAt?: string
  joinedAt?: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

function formatJoinedDate(raw?: string) {
  if (!raw) return 'Unknown'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString()
}

export default function UserProfilePage() {
  const navigate = useNavigate()
  const { userId } = useParams<{ userId?: string }>()
  const { token, refreshProfile } = useAuth()

  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token || !userId) {
      setLoading(false)
      setError('User not found')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const run = async () => {
      const doFetch = async () => {
        return fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('jwt') || token}`,
          },
        })
      }

      try {
        let response = await doFetch()
        if (response.status === 401) {
          await refreshProfile()
          response = await doFetch()
        }

        if (response.status === 404) {
          throw new Error('User not found')
        }
        if (!response.ok) {
          throw new Error('Failed to load user profile')
        }

        const payload = (await response.json()) as { data?: PublicUserProfile }
        if (!cancelled) {
          setProfile(payload?.data || null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load user profile')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [refreshProfile, token, userId])

  const joinedAt = useMemo(
    () => formatJoinedDate(profile?.joinedAt || profile?.createdAt),
    [profile?.createdAt, profile?.joinedAt],
  )

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
        >
          ← Back
        </button>

        {loading && (
          <div className="mt-8 space-y-3">
            <div className="h-24 animate-pulse rounded-xl bg-slate-800" />
            <div className="h-24 animate-pulse rounded-xl bg-slate-800" />
            <div className="h-12 animate-pulse rounded-xl bg-slate-800" />
          </div>
        )}

        {!loading && error && (
          <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {!loading && !error && profile && (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-6 shadow-[0_10px_30px_rgba(2,6,23,0.6)]">
            <div className="flex flex-col items-center">
              <div className="h-24 w-24 overflow-hidden rounded-full border border-slate-700 bg-slate-900 ring-2 ring-violet-500/50">
                {profile.displayPicture ? (
                  <img
                    src={profile.displayPicture}
                    alt={`${profile.username} avatar`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-violet-300">
                    {(profile.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="mt-4 text-2xl font-semibold tracking-tight">{profile.username}</div>
            </div>

            <div className="mt-6 grid gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Bio</div>
                <div className="mt-2 text-sm leading-relaxed text-slate-200">
                  {profile.bio?.trim() || 'No bio yet.'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Joined</div>
                <div className="mt-2 text-sm text-slate-200">{joinedAt}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate(`/chat/private?friendUserId=${profile.userId}`)}
              className="mt-6 w-full rounded-lg border border-violet-500/40 bg-violet-500/15 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25"
            >
              Open Chat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
