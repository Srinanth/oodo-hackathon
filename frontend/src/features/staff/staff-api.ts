import { apiFetch } from '../../lib/api'

export type StaffAccount = {
  id: string
  email: string
  name: string
  role: 'staff'
  isActive: boolean
  createdAt: string
}

export async function listStaff(cursor?: string, search = ''): Promise<{ items: StaffAccount[]; nextCursor: string | null; total: number; activeCount: number; inactiveCount: number }> {
  const params = new URLSearchParams({ limit: '25' })
  if (cursor) params.set('cursor', cursor)
  if (search.trim()) params.set('search', search.trim())
  return apiFetch<{ items: StaffAccount[]; nextCursor: string | null; total: number; activeCount: number; inactiveCount: number }>(`staff?${params.toString()}`)
}

export async function createStaff(input: {
  email: string
  name: string
  password: string
}): Promise<StaffAccount> {
  return apiFetch<StaffAccount>('staff', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
