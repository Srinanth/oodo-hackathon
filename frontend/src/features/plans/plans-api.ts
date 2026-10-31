import { apiFetch } from '../../lib/api'

export type PlanInterval = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type Plan = {
  id: string
  name: string
  interval: PlanInterval
  intervalCount: number
  price: { amount: string; currency: string }
  minimumQuantity: number
  availableFrom: string | null
  availableUntil: string | null
  endPolicy: 'close_at_end' | 'renew_until_closed'
  allowPause: boolean
  allowRenewal: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type PlanInput = Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>

export async function listPlans(search = '', cursor?: string): Promise<{ items: Plan[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: '25' })
  if (search) params.set('search', search)
  if (cursor) params.set('cursor', cursor)
  return apiFetch<{ items: Plan[]; nextCursor: string | null }>(`plans?${params.toString()}`)
}

export async function createPlan(input: PlanInput): Promise<Plan> {
  return apiFetch<Plan>('plans', { method: 'POST', body: JSON.stringify(input) })
}

export async function updatePlan(id: string, input: Partial<PlanInput>): Promise<Plan> {
  return apiFetch<Plan>(`plans/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}
