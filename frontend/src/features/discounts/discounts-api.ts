import { apiFetch } from '../../lib/api'

export type DiscountRule = {
  id: string
  name: string
  discountType: 'fixed' | 'percentage'
  value: string
  currency: string | null
  minimumPurchase: string
  minimumQuantity: number
  scope: 'products' | 'whole_subscription'
  productIds: string[]
  startsAt: string | null
  endsAt: string | null
  maximumUses: number | null
  usesCount: number
  usesRemaining: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type DiscountRuleInput = Omit<DiscountRule, 'id' | 'usesCount' | 'usesRemaining' | 'createdAt' | 'updatedAt'>
export type DiscountLineInput = { productId: string; amount: string; currency: string; quantity: number }
export type DiscountPreview = {
  ruleId: string
  name: string
  discountType: 'fixed' | 'percentage'
  value: string
  eligible: boolean
  reason: string | null
  eligibleAmount: string
  eligibleQuantity: number
  discountAmount: string
  currency: string
  usesCount: number
  usesRemaining: number | null
  evaluatedAt: string
}

export async function listDiscountRules(search = '', cursor?: string) {
  const params = new URLSearchParams({ limit: '25' })
  if (search) params.set('search', search)
  if (cursor) params.set('cursor', cursor)
  return apiFetch<{ items: DiscountRule[]; nextCursor: string | null }>(`discount-rules?${params.toString()}`)
}

export async function createDiscountRule(input: DiscountRuleInput) {
  return apiFetch<DiscountRule>('discount-rules', { method: 'POST', body: JSON.stringify(input) })
}

export async function updateDiscountRule(id: string, input: Partial<DiscountRuleInput>) {
  return apiFetch<DiscountRule>(`discount-rules/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export async function previewDiscount(id: string, lines: DiscountLineInput[]) {
  return apiFetch<DiscountPreview>(`discount-rules/${id}/preview`, { method: 'POST', body: JSON.stringify({ lines }) })
}
