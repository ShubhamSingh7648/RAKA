import { useAuth } from '../context/AuthContext'

export type ProfileData = {
  displayPictureUrl?: string
  name: string
  status?: string
  bio?: string
  gender?: string
}

type RightSidebarProps = {
  isPrivateView?: boolean
  friendProfile?: ProfileData | null
  onEditProfile?: () => void
  onClose?: () => void
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-200">{value?.trim() ? value : '-'}</div>
    </div>
  )
}

export default function RightSidebar({
  isPrivateView = false,
  friendProfile = null,
  onEditProfile,
  onClose,
}: RightSidebarProps) {
  const { user } = useAuth()
  const ownProfile: ProfileData = {
    displayPictureUrl: user?.displayPicture || '',
    name: user?.username || 'Guest',
    status: user?.email || '',
    bio: user?.bio || '',
    gender: '',
  }
  const showingFriend = isPrivateView && Boolean(friendProfile)
  const profile = showingFriend ? friendProfile! : ownProfile

  return (
    <aside className="h-full w-full bg-slate-950 text-slate-100">
      <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
        <h2 className="text-sm font-semibold tracking-wide">
          {showingFriend ? 'Friend Profile' : 'My Profile'}
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs md:hidden"
          >
            Close
          </button>
        )}
      </div>

      <div className="p-4">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_0_0_1px_rgba(124,106,255,0.08)]">
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
              {profile.displayPictureUrl ? (
                <img
                  src={profile.displayPictureUrl}
                  alt={`${profile.name} avatar`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl text-slate-400">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold text-violet-300">
                {profile.name}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {profile.status?.trim() ? profile.status : 'No status set'}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <InfoRow label="Bio" value={profile.bio} />
            <InfoRow label="Gender" value={profile.gender} />
          </div>

          {!showingFriend && (
            <button
              type="button"
              onClick={onEditProfile}
              className="mt-4 w-full rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-500/20"
            >
              Edit Profile
            </button>
          )}
        </section>
      </div>
    </aside>
  )
}
