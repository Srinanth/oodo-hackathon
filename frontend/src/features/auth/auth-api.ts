import { apiFetch } from '../../lib/api'

export type CurrentUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'staff' | 'customer'
  customerId: string | null
}

type AuthResponse = { user: CurrentUser }
type MessageResponse = { message: string }

export async function prepareCsrf(): Promise<void> {
  await apiFetch<{ detail: string }>('auth/csrf')
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await apiFetch<AuthResponse>('auth/me')
  return response.user
}

export async function signIn(email: string, password: string): Promise<CurrentUser> {
  const response = await apiFetch<AuthResponse>('auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return response.user
}

export async function registerCustomer(
  name: string,
  email: string,
  password: string,
): Promise<CurrentUser> {
  const response = await apiFetch<AuthResponse>('auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
  return response.user
}

export async function signOut(): Promise<void> {
  await prepareCsrf()
  await apiFetch<void>('auth/logout', { method: 'POST' })
}

export async function requestPasswordReset(email: string): Promise<string> {
  const response = await apiFetch<MessageResponse>('auth/password-reset-requests', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  return response.message
}

export async function resetPassword(
  uid: string,
  token: string,
  newPassword: string,
): Promise<string> {
  const response = await apiFetch<MessageResponse>('auth/password-resets', {
    method: 'POST',
    body: JSON.stringify({ uid, token, newPassword }),
  })
  return response.message
}
