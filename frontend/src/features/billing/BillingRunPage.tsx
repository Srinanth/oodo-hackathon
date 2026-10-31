import { useEffect, useState } from 'react'
import type { BillingRun } from './billingApi'
import {
  fetchBillingRun,
  fetchBillingRuns,
  triggerBillingRun,
} from './billingApi'
import { ApiError } from '../../lib/api'

export function BillingRunPage() {
  const [runs, setRuns] = useState<BillingRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Trigger form state
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().split('T')[0])
  const [dryRun, setDryRun] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null)

  // Inspection drawer state
  const [selectedRun, setSelectedRun] = useState<BillingRun | null>(null)
  const [inspectLoading, setInspectLoading] = useState(false)

  const loadRuns = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchBillingRuns()
      setRuns(data)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to connect to billing API server.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    async function init() {
      try {
        const data = await fetchBillingRuns()
        if (!ignore) {
          setRuns(data)
          setLoading(false)
        }
      } catch (err) {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to connect to billing API server.')
          }
          setLoading(false)
        }
      }
    }
    init()
    return () => {
      ignore = true
    }
  }, [])

  const handleTriggerRun = async (e: React.FormEvent) => {
    e.preventDefault()
    setTriggering(true)
    setError(null)
    setTriggerSuccess(null)

    try {
      const result = await triggerBillingRun(businessDate, dryRun)
      setTriggerSuccess(
        `Billing run initiated successfully for ${result.businessDate}! Invoices created: ${result.invoicesCreated}, Failures: ${result.failures}.`,
      )
      await loadRuns()
      setSelectedRun(result)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Could not complete billing run trigger.')
      }
    } finally {
      setTriggering(false)
    }
  }

  const handleInspect = async (runId: string) => {
    setInspectLoading(true)
    try {
      const runDetail = await fetchBillingRun(runId)
      setSelectedRun(runDetail)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load billing run details.')
      }
    } finally {
      setInspectLoading(false)
    }
  }

  // Calculate summary metrics
  const totalInvoices = runs.reduce((acc, r) => acc + (r.invoicesCreated || 0), 0)
  const totalProcessed = runs.reduce((acc, r) => acc + (r.subscriptionsSeen || 0), 0)
  const totalFailures = runs.reduce((acc, r) => acc + (r.failures || 0), 0)

  return (
    <div className="space-y-8">
      {/* Top Banner & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-violet-700">
            <span className="size-2 rounded-full bg-violet-600 animate-pulse" />
            Recurring Invoicing Engine
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Billing Run Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Trigger idempotent recurring billing runs, monitor execution status, and inspect per-subscription outcomes.
          </p>
        </div>

        <button
          onClick={loadRuns}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
        >
          <svg
            className={`size-4 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh Runs
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-md">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Invoices Created</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-emerald-600">{totalInvoices}</div>
          <div className="mt-1 text-xs text-slate-500">Across {runs.length} completed run(s)</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-md">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Subscriptions Evaluated</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-indigo-600">{totalProcessed}</div>
          <div className="mt-1 text-xs text-slate-500">Due-date matched periods</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-md">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Idempotent Deduplication</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-violet-600">Active</div>
          <div className="mt-1 text-xs text-slate-500">1 invoice max per subscription/period</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-md">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Recorded Failures</div>
          <div className={`mt-2 text-3xl font-bold tracking-tight ${totalFailures > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {totalFailures}
          </div>
          <div className="mt-1 text-xs text-slate-500">Detailed logs visible below</div>
        </div>
      </div>

      {/* Trigger Recurring Run Form */}
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/50 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Execute Recurring Run</h2>
            <p className="text-xs text-slate-500">
              Evaluates all active subscriptions due on or before the selected business date.
            </p>
          </div>
          <div className="text-xs text-slate-400">
            CLI: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 font-mono">manage.py run_billing --business-date {businessDate}</code>
          </div>
        </div>

        <form onSubmit={handleTriggerRun} className="mt-6 flex flex-wrap items-end gap-4">
          <div className="w-full sm:w-64">
            <label htmlFor="businessDate" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Business Date
            </label>
            <input
              id="businessDate"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              required
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-xs focus:border-violet-500 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="flex items-center gap-2 pb-2">
            <input
              id="dryRun"
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <label htmlFor="dryRun" className="text-sm font-medium text-slate-700 select-none">
              Dry Run Simulation (no changes saved)
            </label>
          </div>

          <button
            type="submit"
            disabled={triggering}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-500/40 disabled:opacity-50"
          >
            {triggering ? (
              <>
                <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Processing Subscriptions...
              </>
            ) : (
              <>
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run Billing Now
              </>
            )}
          </button>
        </form>

        {/* Notifications */}
        {triggerSuccess && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-medium">
              <svg className="size-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {triggerSuccess}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800">
            <div className="flex items-center gap-2 font-medium">
              <svg className="size-5 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Runs History Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">Billing Run History</h2>
          <p className="text-xs text-slate-500">Audit trail of all automated and manual billing runs.</p>
        </div>

        {loading && runs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            <svg className="mx-auto size-8 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="mt-3">Loading billing run history...</p>
          </div>
        ) : runs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            No billing runs recorded yet. Use the control above or run <code className="font-mono text-slate-700">python manage.py run_billing</code>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Business Date</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Subscriptions Evaluated</th>
                  <th scope="col" className="px-6 py-3.5">Invoices Created</th>
                  <th scope="col" className="px-6 py-3.5">Failures</th>
                  <th scope="col" className="px-6 py-3.5">Started At</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => {
                  let statusBadgeClass = 'bg-slate-100 text-slate-800'
                  if (run.status === 'completed') statusBadgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  else if (run.status === 'completed_with_errors') statusBadgeClass = 'bg-amber-50 text-amber-700 border border-amber-200'
                  else if (run.status === 'failed') statusBadgeClass = 'bg-rose-50 text-rose-700 border border-rose-200'
                  else if (run.status === 'running') statusBadgeClass = 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse'

                  return (
                    <tr key={run.id} className="transition hover:bg-slate-50/60">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {run.businessDate}
                        <div className="text-xs font-normal text-slate-400 font-mono">
                          ID: {run.id.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass}`}>
                          {run.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">{run.subscriptionsSeen}</td>
                      <td className="px-6 py-4 font-medium text-emerald-600">{run.invoicesCreated}</td>
                      <td className="px-6 py-4 font-medium">
                        {run.failures > 0 ? (
                          <span className="font-semibold text-rose-600">{run.failures}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(run.startedAt).toLocaleString()}
                        {run.triggeredByEmail && (
                          <div className="text-slate-400">by {run.triggeredByEmail}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleInspect(run.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run Drilldown Details Modal / Panel */}
      {selectedRun && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Run Details: {selectedRun.businessDate} ({selectedRun.id.slice(0, 8)})
              </h2>
              <p className="text-xs text-slate-500">
                Status: <span className="font-semibold capitalize">{selectedRun.status.replace(/_/g, ' ')}</span> | Started: {new Date(selectedRun.startedAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => setSelectedRun(null)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {selectedRun.errorSummary && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-mono text-rose-800 whitespace-pre-wrap">
              <div className="font-bold text-rose-900 mb-1">Error Summary:</div>
              {selectedRun.errorSummary}
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Itemized Subscriptions Evaluated</h3>
            {inspectLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading subscription items...</div>
            ) : !selectedRun.items || selectedRun.items.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center text-xs text-slate-500">
                No subscription items recorded for this run.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5">Subscription</th>
                      <th className="px-4 py-2.5">Period Start</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Generated Invoice</th>
                      <th className="px-4 py-2.5">Errors / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {selectedRun.items.map((item) => {
                      let itemBadge = 'bg-slate-100 text-slate-700'
                      if (item.status === 'created') itemBadge = 'bg-emerald-50 text-emerald-700 font-semibold'
                      else if (item.status === 'already_exists') itemBadge = 'bg-indigo-50 text-indigo-700 font-semibold'
                      else if (item.status === 'failed') itemBadge = 'bg-rose-50 text-rose-700 font-semibold'

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-mono text-slate-900">{item.subscriptionId}</td>
                          <td className="px-4 py-2.5">{item.periodStart}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] capitalize ${itemBadge}`}>
                              {item.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {item.invoiceNumber ? (
                              <span className="font-semibold text-violet-700 font-mono">
                                {item.invoiceNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-rose-600 font-mono text-[11px]">
                            {item.errorMessage || <span className="text-slate-400">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
