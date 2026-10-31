import { apiFetch } from '../../lib/api'

export type Quote = {
  id: string
  number: string
  customerId: string
  customerName: string
  templateId: string | null
  templateName: string | null
  status: 'draft' | 'quotation' | 'confirmed' | 'expired' | 'cancelled'
  validUntil: string
  expiryDate: string | null
  startDate: string
  paymentTerms: string
  currency: string
  subtotal: string
  taxTotal: string
  discountTotal: string
  total: string
  createdById: number | null
  createdAt: string
  updatedAt: string
  subscriptionId: string | null
  lines: QuoteLine[]
}

export type QuoteLine = {
  id: string
  lineNumber: number
  planId: string | null
  productId: string | null
  variantId: string | null
  description: string
  quantity: string
  unitPrice: string
  currency: string
  subtotal: string
  taxTotal: string
  discountTotal: string
  total: string
  taxRules: Array<{ id: string; taxRuleId: string | null; nameSnapshot: string; ratePercentSnapshot: string; amount: string }>
}

export type QuotePage = { items: Quote[]; nextCursor: string | null }

export type QuoteInput = {
  customerId: string
  templateId: string | null
  validUntil: string
  expiryDate?: string | null
  paymentTerms: string
  currency: string
  lines?: Array<{ planId: string | null; productId: string | null; variantId: string | null; description: string; quantity: string; taxRuleIds: string[] }>
}

export function getQuotes(search: string, cursor: string | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: '25' })
  if (search.trim()) params.set('search', search.trim())
  if (cursor) params.set('cursor', cursor)
  return apiFetch<QuotePage>(`quotes?${params.toString()}`, { signal })
}

export function createQuote(quote: QuoteInput) {
  return apiFetch<Quote>('quotes', { method: 'POST', body: JSON.stringify(quote) })
}

export function updateQuote(id: string, quote: Partial<QuoteInput>) {
  return apiFetch<Quote>(`quotes/${id}`, { method: 'PATCH', body: JSON.stringify(quote) })
}

export function sendQuote(id: string) {
  return apiFetch<Quote & { deliveryStatus: 'simulated'; deliveryMessage: string }>(`quotes/${id}/send`, { method: 'POST', body: JSON.stringify({}) })
}

export function confirmQuote(id: string) {
  return apiFetch<Quote>(`quotes/${id}/confirm`, { method: 'POST', body: JSON.stringify({}) })
}
