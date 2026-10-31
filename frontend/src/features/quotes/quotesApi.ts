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
}

export type QuotePage = { items: Quote[]; nextCursor: string | null }

export type QuoteInput = {
  customerId: string
  templateId: string | null
  validUntil: string
  paymentTerms: string
  currency: string
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
