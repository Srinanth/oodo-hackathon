import { apiFetch } from '../../lib/api'

export type QuoteTemplate = {
  id: string
  name: string
  validityDays: number
  paymentTerms: string
  createdById: number | null
  createdAt: string
  updatedAt: string
}

export type QuoteTemplatePage = {
  items: QuoteTemplate[]
  nextCursor: string | null
}

export type QuoteTemplateInput = {
  name: string
  validityDays: number
  paymentTerms: string
}

export function getQuoteTemplates(search: string, cursor: string | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: '25' })
  if (search.trim()) params.set('search', search.trim())
  if (cursor) params.set('cursor', cursor)
  return apiFetch<QuoteTemplatePage>(`quote-templates?${params.toString()}`, { signal })
}

export function createQuoteTemplate(template: QuoteTemplateInput) {
  return apiFetch<QuoteTemplate>('quote-templates', {
    method: 'POST',
    body: JSON.stringify(template),
  })
}

export function updateQuoteTemplate(id: string, template: QuoteTemplateInput) {
  return apiFetch<QuoteTemplate>(`quote-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(template),
  })
}
