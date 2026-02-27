export async function apiFetch(
  url: string,
  options: RequestInit = {},
  token: string,
  refreshProfile: () => Promise<void>,
): Promise<Response> {
  const buildHeaders = (authToken: string) => {
    const headers = new Headers(options.headers || {})
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`)
    }
    return headers
  }

  let response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: buildHeaders(token),
  })

  if (response.status !== 401) {
    return response
  }

  await refreshProfile()
  const refreshedToken = localStorage.getItem('jwt') || ''

  response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: buildHeaders(refreshedToken),
  })

  if (response.status === 401) {
    throw new Error('Unauthorized')
  }

  return response
}
