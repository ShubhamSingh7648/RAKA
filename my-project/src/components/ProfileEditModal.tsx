import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL } from '../config/runtime'

type ProfileEditModalProps = {
  open: boolean
  onClose: () => void
}

type CloudinarySignaturePayload = {
  cloudName: string
  apiKey: string
  folder: string
  timestamp: number
  publicId: string
  signature: string
}

type UploadedImage = {
  secureUrl: string
  publicId: string
}

export default function ProfileEditModal({ open, onClose }: ProfileEditModalProps) {
  const { token, user, refreshProfile } = useAuth()
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [displayPicture, setDisplayPicture] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setUsername(user?.username || '')
    setBio(user?.bio || '')
    setDisplayPicture(user?.displayPicture || '')
    setSelectedFile(null)
    setError('')
  }, [open, user?.bio, user?.displayPicture, user?.username])

  if (!open) return null

  const onFileChange = (file: File | null) => {
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Only PNG, JPG, and WEBP are supported')
      return
    }
    if (file.size > 1_000_000) {
      setError('Image must be smaller than 1 MB')
      return
    }

    setError('')
    setSelectedFile(file)
    setDisplayPicture(URL.createObjectURL(file))
  }

  const uploadToCloudinary = async (file: File): Promise<UploadedImage> => {
    if (!token) {
      throw new Error('Unauthorized')
    }

    const signResponse = await fetch(`${API_BASE_URL}/api/v1/uploads/profile/signature`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!signResponse.ok) {
      const payload = (await signResponse.json().catch(() => ({}))) as { message?: string }
      throw new Error(payload?.message || 'Unable to get upload signature')
    }

    const signPayload = (await signResponse.json()) as { data?: CloudinarySignaturePayload }
    const signatureData = signPayload?.data

    if (!signatureData) {
      throw new Error('Invalid upload signature response')
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('api_key', signatureData.apiKey)
    formData.append('timestamp', String(signatureData.timestamp))
    formData.append('signature', signatureData.signature)
    formData.append('folder', signatureData.folder)
    formData.append('public_id', signatureData.publicId)

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      },
    )

    if (!uploadResponse.ok) {
      const uploadErrorPayload = (await uploadResponse.json().catch(() => ({}))) as {
        error?: { message?: string }
      }
      throw new Error(uploadErrorPayload?.error?.message || 'Cloudinary upload failed')
    }

    const uploadPayload = (await uploadResponse.json()) as {
      secure_url?: string
      public_id?: string
    }

    if (!uploadPayload.secure_url || !uploadPayload.public_id) {
      throw new Error('Cloudinary upload response is invalid')
    }

    return {
      secureUrl: uploadPayload.secure_url,
      publicId: uploadPayload.public_id,
    }
  }

  const save = async () => {
    if (!token) return
    setSaving(true)
    setError('')

    try {
      let nextDisplayPicture = displayPicture
      let nextDisplayPicturePublicId = ''

      if (selectedFile) {
        const uploadedImage = await uploadToCloudinary(selectedFile)
        nextDisplayPicture = uploadedImage.secureUrl
        nextDisplayPicturePublicId = uploadedImage.publicId
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username,
          bio,
          displayPicture: nextDisplayPicture,
          displayPicturePublicId: nextDisplayPicturePublicId,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload?.message || 'Failed to save profile')
      }

      await refreshProfile()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-100">
        <h3 className="text-lg font-semibold">Edit Profile</h3>
        <p className="mt-1 text-xs text-slate-400">
          Update your username and bio. Username supports letters, numbers, `_`, `.`, and `-`.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="mb-1 text-xs text-slate-400">Profile Picture</div>
            <div className="mb-2 flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
                {displayPicture ? (
                  <img src={displayPicture} alt="Profile preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                    No image
                  </div>
                )}
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => onFileChange(event.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-violet-500/20 file:px-2 file:py-1 file:text-xs file:text-violet-100"
              />
            </div>
            {displayPicture && (
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null)
                  setDisplayPicture('')
                }}
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300"
              >
                Remove picture
              </button>
            )}
          </label>

          <label className="block">
            <div className="mb-1 text-xs text-slate-400">Username</div>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
              maxLength={30}
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs text-slate-400">Bio</div>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="h-24 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
              maxLength={280}
            />
            <div className="mt-1 text-right text-[11px] text-slate-500">{bio.length} / 280</div>
          </label>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
