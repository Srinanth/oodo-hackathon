import { apiFetch } from '../../lib/api'

export type Customer = {
  id: string
  accountUserId: number | null
  accountUserEmail: string | null
  companyName: string
  contactName: string
  email: string
  phone: string
  billingAddress: string
  createdAt: string
  updatedAt: string
}

export type CustomerInput = Pick<
  Customer,
  'accountUserEmail' | 'companyName' | 'contactName' | 'email' | 'phone' | 'billingAddress'
>

export type CustomerPage = {
  items: Customer[]
  nextCursor: string | null
}

export function getCustomers(
  search: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: '25' })
  if (search.trim()) params.set('search', search.trim())
  if (cursor) params.set('cursor', cursor)
  return apiFetch<CustomerPage>(`customers?${params.toString()}`, { signal })
}

export function createCustomer(customer: CustomerInput) {
  return apiFetch<Customer>('customers', {
    method: 'POST',
    body: JSON.stringify(customer),
  })
}

export function updateCustomer(id: string, customer: CustomerInput) {
  return apiFetch<Customer>(`customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(customer),
  })
}
