import { apiFetch } from '../../lib/api'

export type TaxRule = {
  id: string
  name: string
  ratePercent: string
  activeFrom: string | null
  activeUntil: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type TaxRuleInput = Omit<TaxRule, 'id' | 'createdAt' | 'updatedAt'>
export type TaxPreview = {
  ruleId: string
  name: string
  onDate: string
  applies: boolean
  baseAmount: string
  ratePercent: string
  taxAmount: string
  totalAmount: string
  currency: string
  snapshot: null | { name: string; ratePercent: string; taxAmount: string; currency: string }
}

export async function listTaxRules(search = '', cursor?: string): Promise<{ items: TaxRule[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: '25' })
  if (search) params.set('search', search)
  if (cursor) params.set('cursor', cursor)
  return apiFetch<{ items: TaxRule[]; nextCursor: string | null }>(`tax-rules?${params.toString()}`)
}

export async function createTaxRule(input: TaxRuleInput) {
  return apiFetch<TaxRule>('tax-rules', { method: 'POST', body: JSON.stringify(input) })
}

export async function updateTaxRule(id: string, input: Partial<TaxRuleInput>) {
  return apiFetch<TaxRule>(`tax-rules/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export async function previewTax(id: string, amount: string, currency: string, onDate?: string) {
  const params = new URLSearchParams({ amount, currency })
  if (onDate) params.set('onDate', onDate)
  return apiFetch<TaxPreview>(`tax-rules/${id}/preview?${params.toString()}`)
}
