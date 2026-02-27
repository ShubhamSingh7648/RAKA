import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ProfileEditModal from './ProfileEditModal'

function formatJoinedDate(rawDate?: string) {
  if (!rawDate) return 'Unknown'
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString()
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [showEdit, setShowEdit] = useState(false)

  const joinedAt = useMemo(() => formatJoinedDate(user?.createdAt), [user?.createdAt])

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

        <div className="mt-8 rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-6 shadow-[0_10px_30px_rgba(2,6,23,0.6)]">
          <div className="flex flex-col items-center">
            <div className="h-24 w-24 overflow-hidden rounded-full border border-slate-700 bg-slate-900 ring-2 ring-violet-500/50">
              {user?.displayPicture ? (
                <img
                  src={user.displayPicture}
                  alt={`${user.username} avatar`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-violet-300">
                  {(user?.username || 'G').charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="mt-4 text-2xl font-semibold tracking-tight">{user?.username || 'Guest'}</div>
            <div className="mt-1 text-xs text-slate-400">{user?.email || 'No email'}</div>
          </div>

          <div className="mt-6 grid gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Bio</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-200">
                {user?.bio?.trim() || 'No bio yet.'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Member Since</div>
              <div className="mt-2 text-sm text-slate-200">{joinedAt}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="mt-6 w-full rounded-lg border border-violet-500/40 bg-violet-500/15 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25"
          >
            Edit Profile
          </button>
        </div>
      </div>

      <ProfileEditModal open={showEdit} onClose={() => setShowEdit(false)} />
    </div>
  )
}
