import { apiFetch } from '../../lib/api'

export type SubscriptionLine = {
  id: string
  lineNumber: number
  planId: string | null
  productId: string | null
  variantId: string | null
  description: string
  quantity: string
  unitPrice: string
  currency: string
}

export type SubscriptionEvent = {
  id: string
  action: string
  fromStatus: string
  toStatus: string
  note: string
  actorEmail: string | null
  createdAt: string
}

export type Subscription = {
  id: string
  number: string
  customerId: string
  customerName: string
  customerEmail: string
  planId: string | null
  planName: string | null
  planAllowPause: boolean
  planAllowRenewal: boolean
  planEndPolicy: 'close_at_end' | 'renew_until_closed' | null
  sourceQuoteId: string | null
  status: 'confirmed' | 'active' | 'paused' | 'closed'
  startDate: string
  expiryDate: string | null
  nextPeriodStart: string
  nextBillingAt: string
  paymentTerms: string
  currency: string
  closeAtPeriodEnd: boolean
  createdAt: string
  lines: SubscriptionLine[]
  events?: SubscriptionEvent[]
}

export type SubscriptionPage = { items: Subscription[]; nextCursor: string | null }

export function getSubscriptions(search = '', status = '', cursor: string | null = null) {
  const params = new URLSearchParams({ limit: '25' })
  if (search.trim()) params.set('search', search.trim())
  if (status) params.set('status', status)
  if (cursor) params.set('cursor', cursor)
  return apiFetch<SubscriptionPage>(`subscriptions?${params.toString()}`)
}

export function getPortalSubscriptions() {
  return apiFetch<SubscriptionPage>('portal/subscriptions?limit=25')
}

export function applySubscriptionAction(id: string, action: string) {
  return apiFetch<Subscription>(`subscriptions/${id}/actions`, { method: 'POST', body: JSON.stringify({ action }) })
}
