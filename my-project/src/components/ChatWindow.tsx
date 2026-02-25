import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'

export default function ChatWindow() {
  const { token } = useAuth()
  const src = useMemo(() => {
    if (!token) return '/chat-window.html'
    return `/chat-window.html?token=${encodeURIComponent(token)}`
  }, [token])

  return (
    <div className="h-full w-full bg-black">
      <iframe
        title="Chat Window"
        src={src}
        className="h-full w-full border-0"
      />
    </div>
  )
}
