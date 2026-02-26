import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

type AuthMode = 'login' | 'signup'

type AuthModalProps = {
  open: boolean
  onClose: () => void
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { setAuthToken, refreshProfile } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const submit = async () => {
    setSaving(true)
    setError('')

    try {
      const endpoint =
        mode === 'signup'
          ? `${API_BASE_URL}/api/v1/auth/register`
          : `${API_BASE_URL}/api/v1/auth/login`
      const body =
        mode === 'signup'
          ? { email: email.trim(), password: password.trim(), username: username.trim() }
          : { email: email.trim(), password: password.trim() }

      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string
        data?: { accessToken?: string }
      }

      if (!response.ok) {
        throw new Error(payload?.message || 'Authentication failed')
      }

      const token = payload?.data?.accessToken || ''
      if (!token) {
        throw new Error('Invalid auth response')
      }

      setAuthToken(token)
      await refreshProfile()
      onClose()
      setEmail('')
      setPassword('')
      setUsername('')
      setMode('login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{mode === 'login' ? 'Login' : 'Create account'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={[
              'rounded-md px-3 py-1.5 text-xs font-medium',
              mode === 'login'
                ? 'bg-violet-500/20 text-violet-200'
                : 'border border-slate-700 text-slate-300',
            ].join(' ')}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={[
              'rounded-md px-3 py-1.5 text-xs font-medium',
              mode === 'signup'
                ? 'bg-violet-500/20 text-violet-200'
                : 'border border-slate-700 text-slate-300',
            ].join(' ')}
          >
            Sign Up
          </button>
        </div>

        <div className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
          />

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="mt-5 w-full rounded-md border border-violet-500/40 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 disabled:opacity-50"
        >
          {saving ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </div>
    </div>
  )
}
