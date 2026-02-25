import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ChatWindow from './components/ChatWindow'
import PrivateChat from './components/PrivateChat'
import { useAuth } from './context/AuthContext'

function RootRedirect({ authenticated }: { authenticated: boolean }) {
  if (authenticated) return <Navigate to="/chat" replace />
  return <Navigate to="/chat/random" replace />
}

function ProtectedPrivateRoute({
  authenticated,
  children,
}: {
  authenticated: boolean
  children: ReactElement
}) {
  if (!authenticated) return <Navigate to="/" replace />
  return children
}

function ChatNeutralState() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-950 px-6 text-center text-slate-300">
      <div>
        <div className="text-xl font-semibold">Select a chat</div>
        <p className="mt-2 text-sm text-slate-500">
          Select a chat or start anonymous chat.
        </p>
      </div>
    </div>
  )
}

function App() {
  const { isAuthenticated } = useAuth()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect authenticated={isAuthenticated} />} />

        <Route path="/chat" element={<AppLayout />}>
          <Route index element={<ChatNeutralState />} />
          <Route path="random" element={<ChatWindow />} />
          <Route
            path="private"
            element={
              <ProtectedPrivateRoute authenticated={isAuthenticated}>
                <PrivateChat />
              </ProtectedPrivateRoute>
            }
          />
          <Route
            path="private/:conversationId"
            element={
              <ProtectedPrivateRoute authenticated={isAuthenticated}>
                <PrivateChat />
              </ProtectedPrivateRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
