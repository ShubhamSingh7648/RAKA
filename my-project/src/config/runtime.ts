const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

if (!rawApiBaseUrl && import.meta.env.PROD) {
  throw new Error('VITE_API_BASE_URL is required in production')
}

export const API_BASE_URL = normalizeBaseUrl(rawApiBaseUrl || 'http://localhost:3001')
export const CHAT_SOCKET_URL = `${API_BASE_URL}/chat`
export const PRIVATE_SOCKET_URL = `${API_BASE_URL}/private`
