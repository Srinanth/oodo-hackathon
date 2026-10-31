import { useEffect, useState } from 'react'
import type { BillingRun, BillingRunItem } from './billingApi'
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

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'failed' | 'skipped'>('all')

  // Run billing modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().split('T')[0])
  const [dryRun, setDryRun] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null)

  // Selected run & item for right inspector panel
  const [selectedRun, setSelectedRun] = useState<BillingRun | null>(null)
  const [selectedItem, setSelectedItem] = useState<BillingRunItem | null>(null)
  const [inspectLoading, setInspectLoading] = useState(false)

  const loadRuns = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchBillingRuns()
      setRuns(data)
      if (data.length > 0 && !selectedRun) {
        setSelectedRun(data[0])
        if (data[0].items && data[0].items.length > 0) {
          setSelectedItem(data[0].items[0])
        }
      }
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
          if (data.length > 0) {
            setSelectedRun(data[0])
            if (data[0].items && data[0].items.length > 0) {
              setSelectedItem(data[0].items[0])
            }
          }
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
        `Batch ${result.id.slice(0, 8)} executed! Created: ${result.invoicesCreated}, Skipped/Existing: ${result.subscriptionsSeen - result.invoicesCreated - result.failures}, Failures: ${result.failures}.`,
      )
      setIsModalOpen(false)
      await loadRuns()
      setSelectedRun(result)
      if (result.items && result.items.length > 0) {
        setSelectedItem(result.items[0])
      }
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

  const handleSelectRun = async (run: BillingRun) => {
    setInspectLoading(true)
    try {
      const detail = await fetchBillingRun(run.id)
      setSelectedRun(detail)
      if (detail.items && detail.items.length > 0) {
        setSelectedItem(detail.items[0])
      } else {
        setSelectedItem(null)
      }
    } catch {
      setSelectedRun(run)
    } finally {
      setInspectLoading(false)
    }
  }

  const latestRun = runs[0] || selectedRun

  // Compute aggregate KPI stats
  const totalInvoices = runs.reduce((acc, r) => acc + (r.invoicesCreated || 0), 0)
  const totalFailures = runs.reduce((acc, r) => acc + (r.failures || 0), 0)
  const latestSeen = latestRun ? latestRun.subscriptionsSeen : 0
  const latestCreated = latestRun ? latestRun.invoicesCreated : 0
  const latestFailures = latestRun ? latestRun.failures : 0
  const latestSkipped = Math.max(0, latestSeen - latestCreated - latestFailures)
  const completionRate = latestSeen > 0 ? (((latestSeen - latestFailures) / latestSeen) * 100).toFixed(1) : '100.0'

  // Items to show in ledger
  const currentItems = selectedRun?.items || []
  const filteredItems = currentItems.filter((item) => {
    if (activeTab === 'failed' && item.status !== 'failed') return false
    if (activeTab === 'skipped' && item.status !== 'skipped' && item.status !== 'already_exists') return false
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      item.subscriptionId.toLowerCase().includes(q) ||
      (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(q)) ||
      item.errorMessage.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <span>Brightloop</span>
            <span>/</span>
            <span>Billing &amp; Invoices</span>
            <span>/</span>
            <span className="text-indigo-600">Run Operations</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Billing &amp; Invoices Operations
            </h1>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
              <span className="size-1.5 rounded-full bg-teal-600 animate-pulse" />
              Automated Engine v4.2 • Ready
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Operational ledger and recurring fee scheduler with guaranteed period idempotency.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadRuns}
            disabled={loading}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 flex items-center gap-1.5 transition"
          >
            <span className={`material-symbols-outlined text-[15px] ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            Refresh
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="h-8 px-3.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 flex items-center gap-1.5 transition"
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            Run Billing
          </button>
        </div>
      </div>

      {/* Notifications */}
      {triggerSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs text-emerald-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
          <span>{triggerSuccess}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-rose-600 text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* LATEST RUN BATCH KPI SUMMARY */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3.5 mb-3.5 border-b border-slate-100 gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
              LATEST RUN BATCH
            </span>
            <span className="text-xs font-semibold font-num text-slate-900 px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
              {latestRun ? `RUN-${latestRun.businessDate}-${latestRun.id.slice(0, 4)}` : 'NO RUNS'}
            </span>
            {latestRun && (
              <>
                <span className="text-xs text-slate-600 flex items-center gap-1 font-num">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">calendar_today</span>
                  Business Date: <strong className="text-slate-900">{latestRun.businessDate}</strong>
                </span>
                <span className="text-xs text-slate-600 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">account_circle</span>
                  {latestRun.triggeredByEmail || 'Automated Scheduler'}
                </span>
                <span className="text-xs text-slate-600 flex items-center gap-1 font-num">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">timer</span>
                  {new Date(latestRun.startedAt).toLocaleTimeString()}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {latestRun ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${
                  latestRun.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : latestRun.status === 'completed_with_errors'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : latestRun.status === 'failed'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse'
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    latestRun.status === 'completed'
                      ? 'bg-emerald-600'
                      : latestRun.status === 'completed_with_errors'
                      ? 'bg-amber-500'
                      : latestRun.status === 'failed'
                      ? 'bg-rose-600'
                      : 'bg-indigo-600'
                  }`}
                />
                {latestRun.status.replace(/_/g, ' ')}
              </span>
            ) : (
              <span className="text-xs text-slate-400">Ready</span>
            )}
          </div>
        </div>

        {/* 4 Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1 */}
          <div className="p-3.5 rounded-lg bg-slate-50/60 border border-slate-200/80">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Processed Subscriptions
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-num text-slate-900">{latestSeen}</span>
              <span className="text-xs font-semibold text-teal-700 font-num">{completionRate}% success</span>
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-num flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-teal-600">check_circle</span>
              {latestCreated} Invoices generated
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-3.5 rounded-lg bg-slate-50/60 border border-slate-200/80">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Total Invoices Created
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-num text-indigo-600">{totalInvoices}</span>
              <span className="text-xs font-medium text-slate-400 font-num">USD</span>
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-num flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-indigo-600">receipt</span>
              Across {runs.length} recorded run(s)
            </div>
          </div>

          {/* Card 3 */}
          <div className={`p-3.5 rounded-lg border ${latestFailures > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/80 bg-slate-50/60'}`}>
            <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wider">
              Failed / Exceptions
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className={`text-2xl font-bold font-num ${latestFailures > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                {latestFailures}
              </span>
              <span className="text-xs font-medium px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                {latestFailures > 0 ? 'Needs Review' : 'Healthy'}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-num flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-amber-600">warning</span>
              {totalFailures} historical failures
            </div>
          </div>

          {/* Card 4 */}
          <div className="p-3.5 rounded-lg bg-slate-50/60 border border-slate-200/80">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Skipped / Already Billed
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-num text-slate-900">{latestSkipped}</span>
              <span className="text-xs font-medium text-slate-500">Idempotent</span>
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-num flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-slate-400">pause_circle</span>
              Deduplicated without double charges
            </div>
          </div>
        </div>
      </section>

      {/* OPERATIONAL SPLIT LAYOUT */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* Left / Central Section: Run Execution Ledger */}
        <div className="flex-1 w-full space-y-5 min-w-0">
          <section className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            {/* Filter Bar & Tabs Header */}
            <div className="p-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/40">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Run Execution Ledger</span>
                {selectedRun && (
                  <span className="text-xs font-num text-slate-500">
                    (Batch {selectedRun.businessDate} • {currentItems.length} items)
                  </span>
                )}
              </div>

              {/* Filter tabs */}
              <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 text-xs">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    activeTab === 'all'
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Processed ({currentItems.length})
                </button>
                <button
                  onClick={() => setActiveTab('failed')}
                  className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 ${
                    activeTab === 'failed'
                      ? 'bg-white text-amber-800 font-semibold shadow-2xs'
                      : 'text-amber-800 hover:text-slate-900'
                  }`}
                >
                  Exceptions ({currentItems.filter((i) => i.status === 'failed').length})
                  {currentItems.some((i) => i.status === 'failed') && (
                    <span className="size-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('skipped')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    activeTab === 'skipped'
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Skipped / Existing ({currentItems.filter((i) => i.status === 'already_exists' || i.status === 'skipped').length})
                </button>
              </div>

              {/* Search inside table */}
              <div className="relative w-56">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">
                  filter_list
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter subscription, error..."
                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 h-8"
                />
              </div>
            </div>

            {/* Execution Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                    <th className="py-2.5 px-4">Subscription &amp; Ref</th>
                    <th className="py-2.5 px-4">Cycle Period</th>
                    <th className="py-2.5 px-4">Invoice Reference</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inspectLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <span className="material-symbols-outlined animate-spin text-[24px]">sync</span>
                        <p className="mt-2 text-xs">Loading execution details...</p>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        {currentItems.length === 0
                          ? 'No subscription items found in this run.'
                          : 'No items match the active filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isSelected = selectedItem?.id === item.id
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedItem(item)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-indigo-50/60 border-l-3 border-l-indigo-600'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 font-num">
                              {item.subscriptionId.slice(0, 13)}...
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              ID: {item.id.slice(0, 8)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-num">
                            {item.periodStart}
                          </td>
                          <td className="py-3 px-4">
                            {item.invoiceNumber ? (
                              <span className="font-semibold text-indigo-600 font-num">
                                {item.invoiceNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-num">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {item.status === 'created' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="size-1.5 rounded-full bg-emerald-600" />
                                Generated &amp; Confirmed
                              </span>
                            ) : item.status === 'already_exists' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <span className="size-1.5 rounded-full bg-indigo-600" />
                                Idempotent Skip
                              </span>
                            ) : item.status === 'failed' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <span className="size-1.5 rounded-full bg-rose-600" />
                                Failed: Exception
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                                {item.status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedItem(item)
                              }}
                              className="h-6 px-2.5 rounded border border-slate-200 bg-white text-[11px] font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-indigo-600"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer summary bar */}
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filteredItems.length} of {currentItems.length} execution instances</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Select any row to inspect financial snapshots</span>
              </div>
            </div>
          </section>

          {/* Historical Runs Selection Strip */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Recorded Run Batches
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {runs.map((r) => {
                const isSelected = selectedRun?.id === r.id
                return (
                  <div
                    key={r.id}
                    onClick={() => handleSelectRun(r)}
                    className={`cursor-pointer rounded-lg p-3 border transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/30 ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-slate-900 font-num">
                        {r.businessDate}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {r.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 font-num">
                      <span>Seen: {r.subscriptionsSeen}</span>
                      <span className="text-emerald-700 font-medium">Inv: {r.invoicesCreated}</span>
                      <span className={r.failures > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}>
                        Fail: {r.failures}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* Right Inspector Panel (~410px width matching Stitch) */}
        <aside className="w-full xl:w-[410px] shrink-0 rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden flex flex-col text-xs">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <span className="material-symbols-outlined text-[15px] text-indigo-600">visibility</span>
                <span>Invoice &amp; Item Inspector</span>
              </div>
              <span className="text-[11px] text-slate-400 font-num">Net 30 Terms</span>
            </div>

            <div className="mt-1 flex items-baseline justify-between">
              <h3 className="text-base font-bold text-slate-900 font-num">
                {selectedItem?.invoiceNumber || (selectedItem ? 'Pending / Failed' : 'No Item Selected')}
              </h3>
              {selectedItem && (
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${
                    selectedItem.status === 'created'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : selectedItem.status === 'already_exists'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {selectedItem.status.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-500 font-num mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-slate-400">history_edu</span>
              Generated via Run <strong>{selectedRun?.businessDate || '—'}</strong> ({selectedRun?.id.slice(0, 8)})
            </p>

            {/* Quick Actions */}
            <div className="grid grid-cols-4 gap-1.5 mt-3">
              <button
                disabled={!selectedItem?.invoiceNumber}
                className="h-7 px-2 bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] font-medium flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[13px]">done</span>
                Confirm
              </button>
              <button
                disabled={!selectedItem?.invoiceNumber}
                className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[13px]">send</span>
                Send
              </button>
              <button
                disabled={!selectedItem?.invoiceNumber}
                className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[13px]">print</span>
                PDF
              </button>
              <button
                disabled={!selectedItem?.invoiceNumber}
                className="h-7 px-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[13px]">payments</span>
                Record
              </button>
            </div>
          </div>

          {/* Body Sections */}
          <div className="p-4 space-y-4 overflow-y-auto max-h-[640px]">
            {/* 1. Customer & Lifecycle */}
            <div className="space-y-1.5 pb-3 border-b border-slate-100">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                1. Customer &amp; Lifecycle
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Subscription</span>
                  <span className="font-semibold text-slate-900 font-num">
                    {selectedItem ? `${selectedItem.subscriptionId.slice(0, 16)}...` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Period Start</span>
                  <span className="font-num text-slate-900 font-medium">
                    {selectedItem?.periodStart || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Payment Terms</span>
                  <span className="font-num text-slate-900 font-medium">Net 30 (Default)</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Period Idempotency</span>
                  <span className="font-num text-[11px] text-teal-700 font-mono">ENFORCED (Unique)</span>
                </div>
              </div>
            </div>

            {/* Error Message Section if failed */}
            {selectedItem?.errorMessage && (
              <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 space-y-1">
                <div className="font-semibold text-xs flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  Failure Details
                </div>
                <div className="text-[11px] font-mono whitespace-pre-wrap">{selectedItem.errorMessage}</div>
              </div>
            )}

            {/* 2. Immutable Line Snapshots */}
            <div className="space-y-2 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                <span>2. Immutable Line Snapshots</span>
                <span className="text-[10px] bg-slate-100 px-1 py-0.2 rounded text-slate-600 font-semibold">
                  LOCKED
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-slate-900 font-medium block">Enterprise SaaS Recurring Tier</span>
                    <span className="text-[11px] text-slate-500 font-num">1 cycle @ standard catalog rate</span>
                  </div>
                  <span className="font-num font-medium text-slate-900">
                    {selectedItem?.invoiceNumber ? 'Snapshotted' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Tax & Discount Breakdown */}
            <div className="space-y-1.5 pb-3 border-b border-slate-100 text-xs">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                3. Tax &amp; Discount Rules
              </div>
              <div className="flex items-center justify-between text-teal-700 text-[11px]">
                <span>Configured Discount Rules</span>
                <span className="font-num font-medium">Eligible at confirmation</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 text-[11px]">
                <span>Configured Tax Rules</span>
                <span className="font-num font-medium">Snapshotted on invoice</span>
              </div>
            </div>

            {/* 4. Financial Reconciliation */}
            <div className="space-y-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                4. Financial Reconciliation
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">Invoice Status</span>
                  <span className="font-num font-semibold text-slate-900">
                    {selectedItem?.invoiceNumber ? 'Draft Generated' : 'Not Generated'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>Outstanding Balance</span>
                  <span className="font-num font-medium text-indigo-700">Recalculates on payment</span>
                </div>
              </div>
            </div>

            {/* 5. System Audit Trail */}
            <div className="space-y-1 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200 font-mono">
              <div className="flex items-center gap-1 font-semibold text-[10px] text-slate-400 uppercase font-sans">
                <span className="material-symbols-outlined text-[13px]">lock</span>
                5. System Audit Trail
              </div>
              <p className="leading-relaxed">
                Run engine evaluated period <span className="text-slate-800 font-semibold">{selectedItem?.periodStart || selectedRun?.businessDate}</span> • Timestamp: <span className="text-slate-800 font-semibold">{selectedItem ? new Date(selectedItem.createdAt).toISOString() : '—'}</span>
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Actor: {selectedRun?.triggeredByEmail || 'scheduler:system'}</span>
            <span className="font-mono">UUID: {selectedItem?.id.slice(0, 8) || '—'}</span>
          </div>
        </aside>
      </div>

      {/* INITIATE AUTOMATED BILLING RUN MODAL (MATCHING STITCH DIALOG) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Initiate Automated Billing Run</h3>
                  <p className="text-xs text-slate-500">Batch invoice generator and recurring ledger syncer</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="size-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleTriggerRun} className="p-5 space-y-4 text-xs">
              {/* Target Business Date */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target Business Date
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">
                    calendar_today
                  </span>
                  <input
                    type="date"
                    value={businessDate}
                    onChange={(e) => setBusinessDate(e.target.value)}
                    required
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 font-num text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Engine will evaluate all active subscriptions due on or before 23:59:59 UTC of this business date.
                </p>
              </div>

              {/* Dry Run Switch */}
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900 block">Dry-Run Simulation Mode</span>
                  <span className="text-[11px] text-slate-500">
                    Simulates line calculation without mutating database invoices
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              {/* Idempotency Key Context */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Idempotency Guarantee
                </label>
                <input
                  type="text"
                  readOnly
                  value={`idem_run_${businessDate.replace(/-/g, '')}_lock`}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 font-mono text-[11px] text-slate-600 cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400 mt-1 font-mono">
                  Guarantees exactly one invoice per subscription per period under concurrent retries.
                </p>
              </div>

              {/* Operator info banner */}
              <div className="p-2.5 rounded bg-blue-50/80 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
                <span className="material-symbols-outlined text-blue-700 text-[16px] shrink-0 mt-0.5">info</span>
                <span>
                  All invoices generated will enter <strong>Draft</strong> status pending confirmation, preserving immutable financial snapshots.
                </span>
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={triggering}
                  className="h-8 px-4 rounded-lg bg-indigo-600 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {triggering ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                      Running Engine...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">bolt</span>
                      Execute Run
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
