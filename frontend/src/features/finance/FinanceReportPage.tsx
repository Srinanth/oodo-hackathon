import { useEffect, useState } from 'react'
import type { FinanceReportData, Invoice } from '../billing/billingApi'
import { fetchFinanceReport } from '../billing/billingApi'
import { ApiError } from '../../lib/api'
import { InvoiceDetailModal } from '../invoices/InvoiceDetailModal'
import { RecordPaymentModal } from '../invoices/RecordPaymentModal'

export function FinanceReportPage() {
  const [data, setData] = useState<FinanceReportData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [activePreset, setActivePreset] = useState<'thisMonth' | 'last30' | 'all'>('all')

  // Modals
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)

  const loadReport = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetchFinanceReport({
        from: fromDate || undefined,
        to: toDate || undefined,
      })
      setData(res)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body?.error?.message || err.message)
      } else {
        setError('Failed to fetch finance aggregations.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetchFinanceReport({
          from: fromDate || undefined,
          to: toDate || undefined,
        })
        if (!ignore) {
          setData(res)
        }
      } catch (err) {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.body?.error?.message || err.message)
          } else {
            setError('Failed to fetch finance aggregations.')
          }
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [fromDate, toDate])

  const setPreset = (preset: 'thisMonth' | 'last30' | 'all') => {
    setActivePreset(preset)
    const now = new Date()
    if (preset === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      setFromDate(start)
      setToDate(end)
    } else if (preset === 'last30') {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const end = now.toISOString().split('T')[0]
      setFromDate(start)
      setToDate(end)
    } else {
      setFromDate('')
      setToDate('')
    }
  }

  const metrics = data?.metrics
  const invoices = data?.invoices || []

  // Filter out overdue queue specifically from returned invoices
  const overdueQueue = invoices.filter(
    (inv) => inv.isOverdue && inv.status !== 'paid' && inv.status !== 'cancelled',
  )

  const invoicedNum = parseFloat(metrics?.invoicedAmount || '0')
  const collectedNum = parseFloat(metrics?.collectedRevenue || '0')
  const outstandingNum = parseFloat(metrics?.outstandingBalance || '0')
  const overdueNum = parseFloat(metrics?.overdueAmount || '0')

  const collectionRate =
    invoicedNum > 0 ? Math.min(100, Math.round((collectedNum / invoicedNum) * 100)) : 100

  return (
    <div className="space-y-6">
      {/* Page Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-violet-700">
            Financial Health & Performance
          </span>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Finance & Aggregations
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Real-time bounded aggregations for invoiced revenue, cash collection, and accounts receivable queue.
          </p>
        </div>

        {/* Date presets & reload */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
            <button
              onClick={() => setPreset('all')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activePreset === 'all'
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setPreset('thisMonth')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activePreset === 'thisMonth'
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setPreset('last30')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activePreset === 'last30'
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last 30 Days
            </button>
          </div>

          <button
            onClick={() => loadReport()}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Date Pickers */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs text-xs">
        <span className="font-semibold text-slate-700">Custom Date Range:</span>
        <div className="flex items-center gap-2">
          <label className="text-slate-500">From:</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setActivePreset('all')
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-900 focus:border-violet-500 focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-500">To:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setActivePreset('all')
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-900 focus:border-violet-500 focus:bg-white focus:outline-none"
          />
        </div>
        {(fromDate || toDate) && (
          <button
            onClick={() => {
              setFromDate('')
              setToDate('')
              setActivePreset('all')
            }}
            className="text-violet-600 hover:underline font-semibold"
          >
            Clear dates
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Active Subs
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            {metrics?.activeSubscriptions ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Recurring plans</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Invoiced
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            ${invoicedNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-500">Gross billings</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
            Collected Cash
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-emerald-600">
            ${collectedNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-emerald-700">Posted payments</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Outstanding
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            ${outstandingNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-500">Open receivables</span>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
            Overdue Amount
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-rose-700">
            ${overdueNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-rose-600">{metrics?.overdueCount ?? 0} invoices delinquent</span>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
            Collection Rate
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-violet-900">
            {collectionRate}%
          </div>
          <span className="text-[10px] text-violet-600">Efficiency</span>
        </div>
      </div>

      {/* Progress / Cash Flow Visualization Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-bold text-slate-800">Receivables Collection Flow</span>
          <span className="text-slate-500 font-medium">
            {collectionRate}% collected (${collectedNum.toFixed(2)} / ${invoicedNum.toFixed(2)})
          </span>
        </div>
        <div className="h-4 w-full rounded-full bg-slate-100 overflow-hidden flex">
          <div
            style={{ width: `${collectionRate}%` }}
            className="h-full bg-emerald-500 transition-all duration-500"
            title={`Collected: $${collectedNum.toFixed(2)}`}
          />
          <div
            style={{ width: `${Math.max(0, 100 - collectionRate)}%` }}
            className="h-full bg-rose-400 transition-all duration-500"
            title={`Outstanding: $${outstandingNum.toFixed(2)}`}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-emerald-500" />
            <span>Collected Cash</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-rose-400" />
            <span>Outstanding Balance</span>
          </div>
        </div>
      </div>

      {/* Overdue Queue Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Delinquent & Overdue Queue ({overdueQueue.length})
            </h3>
            <p className="text-xs text-slate-500">
              Immediate collection attention required for invoices past due date.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-rose-50/70 text-[11px] font-semibold uppercase tracking-wider text-rose-800 border-b border-rose-100">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Invoice Total</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdueQueue.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      🎉 No delinquent invoices! All accounts are in good standing.
                    </td>
                  </tr>
                ) : (
                  overdueQueue.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoiceId(inv.id)}
                      className="hover:bg-rose-50/40 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-violet-700">
                        {inv.number}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{inv.customerName}</div>
                        <div className="text-[11px] text-slate-500">{inv.customerEmail}</div>
                      </td>
                      <td className="py-3 px-4 font-bold text-rose-600">
                        {inv.dueDate}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-800">
                        ${parseFloat(inv.total).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-rose-600">
                        ${parseFloat(inv.balanceDue).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div
                          className="flex items-center justify-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setSelectedInvoiceId(inv.id)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                          >
                            Inspect
                          </button>
                          <button
                            onClick={() => setPaymentInvoice(inv)}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white shadow-2xs hover:bg-emerald-700 transition"
                          >
                            Collect
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-slate-900">
          Invoiced Activity Ledger ({invoices.length})
        </h3>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No invoices found for the specified period.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoiceId(inv.id)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-violet-700">
                        {inv.number}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{inv.customerName}</div>
                        <div className="text-[11px] text-slate-500">{inv.customerEmail}</div>
                      </td>
                      <td className="py-3 px-4 capitalize font-semibold text-slate-700">
                        {inv.status}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{inv.issueDate}</td>
                      <td className="py-3 px-4 text-slate-600">{inv.dueDate}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        ${parseFloat(inv.total).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-rose-600">
                        ${parseFloat(inv.balanceDue).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedInvoiceId(inv.id)
                          }}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          isOpen={true}
          onClose={() => setSelectedInvoiceId(null)}
          onInvoiceUpdated={loadReport}
        />
      )}

      {paymentInvoice && (
        <RecordPaymentModal
          invoice={paymentInvoice}
          isOpen={true}
          onClose={() => setPaymentInvoice(null)}
          onPaymentSuccess={() => {
            loadReport()
            setPaymentInvoice(null)
          }}
        />
      )}
    </div>
  )
}
