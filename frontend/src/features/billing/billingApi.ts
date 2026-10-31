import { apiFetch } from '../../lib/api'

export type BillingRunItem = {
  id: string
  subscriptionId: string
  periodStart: string
  invoiceId: string | null
  invoiceNumber: string | null
  status: 'created' | 'already_exists' | 'skipped' | 'failed'
  errorMessage: string
  createdAt: string
}

export type BillingRun = {
  id: string
  businessDate: string
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed'
  startedAt: string
  finishedAt: string | null
  subscriptionsSeen: number
  invoicesCreated: number
  failures: number
  errorSummary: string
  triggeredByEmail: string | null
  items?: BillingRunItem[]
}

export type InvoiceStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled'

export type InvoiceLineTax = {
  id: string
  taxRuleId: string | null
  nameSnapshot: string
  ratePercentSnapshot: string
  amount: string
}

export type InvoiceDiscountLine = {
  id: string
  discountRuleId: string | null
  nameSnapshot: string
  discountTypeSnapshot: string
  valueSnapshot: string
  amount: string
  currency: string
}

export type InvoiceLine = {
  id: string
  lineNumber: number
  lineType: string
  productId: string | null
  description: string
  quantity: string
  unitPrice: string
  currency: string
  subtotal: string
  taxAmount: string
  discountAmount: string
  total: string
  taxes?: InvoiceLineTax[]
}

export type Payment = {
  id: string
  invoiceId: string
  method: string
  amount: string
  currency: string
  status: string
  paidAt: string
  note: string
  recordedByEmail: string | null
  createdAt: string
}

export type Invoice = {
  id: string
  number: string
  customerId: string
  subscriptionId: string
  customerName: string
  customerEmail: string
  billingPeriod: {
    start: string
    end: string
  }
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  currency: string
  subtotal: string
  taxTotal: string
  discountTotal: string
  total: string
  paidAmount: string
  balanceDue: string
  isOverdue: boolean
  confirmedAt: string | null
  createdAt: string
}

export type InvoiceDetail = Invoice & {
  billingAddressSnapshot: string
  lines: InvoiceLine[]
  discountLines: InvoiceDiscountLine[]
  payments: Payment[]
}

export type InvoiceFilters = {
  status?: string
  customerId?: string
  from?: string
  to?: string
  subscriptionId?: string
  dueBefore?: string
}

export type PaymentPayload = {
  method: string
  amount: string
  currency?: string
  paidAt?: string
  note?: string
}

export type FinanceMetrics = {
  activeSubscriptions: number
  invoicedAmount: string
  collectedRevenue: string
  outstandingBalance: string
  overdueCount: number
  overdueAmount: string
  currency: string
}

export type FinanceReportData = {
  metrics: FinanceMetrics
  invoices: Invoice[]
}

// --- Billing Run APIs ---

export async function fetchBillingRuns(): Promise<BillingRun[]> {
  const data = await apiFetch<any>('billing-runs')
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return []
}

export async function fetchBillingRun(runId: string): Promise<BillingRun> {
  return apiFetch<BillingRun>(`billing-runs/${runId}`)
}

export async function triggerBillingRun(
  businessDate: string,
  dryRun: boolean = false,
): Promise<BillingRun> {
  return apiFetch<BillingRun>('billing-runs', {
    method: 'POST',
    body: JSON.stringify({
      businessDate,
      dryRun,
    }),
  })
}

// --- Invoice APIs ---

export async function fetchInvoices(filters?: InvoiceFilters): Promise<Invoice[]> {
  const params = new URLSearchParams()
  if (filters?.status && filters.status !== 'all') params.append('status', filters.status)
  if (filters?.customerId) params.append('customerId', filters.customerId)
  if (filters?.from) params.append('from', filters.from)
  if (filters?.to) params.append('to', filters.to)
  if (filters?.subscriptionId) params.append('subscriptionId', filters.subscriptionId)
  if (filters?.dueBefore) params.append('dueBefore', filters.dueBefore)

  const queryStr = params.toString()
  const path = queryStr ? `invoices?${queryStr}` : 'invoices'
  const data = await apiFetch<any>(path)

  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return []
}

export async function fetchInvoice(id: string): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`invoices/${id}`)
}

export async function performInvoiceAction(
  id: string,
  action: 'confirm' | 'cancel' | 'send' | 'print',
): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`invoices/${id}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function recordInvoicePayment(
  invoiceId: string,
  payload: PaymentPayload,
): Promise<Payment> {
  return apiFetch<Payment>(`invoices/${invoiceId}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchInvoicePayments(invoiceId: string): Promise<Payment[]> {
  const data = await apiFetch<any>(`invoices/${invoiceId}/payments`)
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return []
}

// --- Finance Report APIs ---

export async function fetchFinanceReport(params?: {
  from?: string
  to?: string
  status?: string
  customerId?: string
}): Promise<FinanceReportData> {
  const searchParams = new URLSearchParams()
  if (params?.from) searchParams.append('from', params.from)
  if (params?.to) searchParams.append('to', params.to)
  if (params?.status) searchParams.append('status', params.status)
  if (params?.customerId) searchParams.append('customerId', params.customerId)

  const queryStr = searchParams.toString()
  const path = queryStr ? `reports/finance?${queryStr}` : 'reports/finance'
  return apiFetch<FinanceReportData>(path)
}
