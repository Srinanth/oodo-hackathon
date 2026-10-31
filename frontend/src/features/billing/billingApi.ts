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

export async function fetchBillingRuns(): Promise<BillingRun[]> {
  const data = await apiFetch<BillingRun[]>('billing-runs')
  return data ?? []
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
