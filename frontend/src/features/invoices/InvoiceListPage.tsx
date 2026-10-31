import { useEffect, useState, useMemo } from 'react'
import type { Invoice } from '../billing/billingApi'
import { fetchInvoices } from '../billing/billingApi'
import { ApiError } from '../../lib/api'
import { InvoiceDetailModal } from './InvoiceDetailModal'
import { RecordPaymentModal } from './RecordPaymentModal'

export function InvoiceListPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Selected invoice for detail modal & payment modal
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)

  const loadInvoices = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchInvoices(
        statusFilter !== 'all' ? { status: statusFilter } : undefined,
      )
      setInvoices(data)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body?.error?.message || err.message)
      } else {
        setError('Failed to fetch invoices from server.')
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
        const data = await fetchInvoices(
          statusFilter !== 'all' ? { status: statusFilter } : undefined,
        )
        if (!ignore) {
          setInvoices(data)
        }
      } catch (err) {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.body?.error?.message || err.message)
          } else {
            setError('Failed to fetch invoices from server.')
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
  }, [statusFilter])

  // Filtered in-memory by search query (invoice number, customer name, email, subscription id)
  const filteredInvoices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return invoices
    return invoices.filter(
      (inv) =>
        inv.number.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.customerEmail.toLowerCase().includes(q) ||
        inv.subscriptionId.toLowerCase().includes(q),
    )
  }, [invoices, searchQuery])

  // Computed summary metrics
  const summary = useMemo(() => {
    let invoiced = 0
    let paid = 0
    let balance = 0
    let overdueCount = 0

    invoices.forEach((inv) => {
      if (inv.status !== 'cancelled') {
        invoiced += parseFloat(inv.total) || 0
        paid += parseFloat(inv.paidAmount) || 0
        balance += parseFloat(inv.balanceDue) || 0
        if (inv.isOverdue && inv.status !== 'paid') {
          overdueCount++
        }
      }
    })

    return { invoiced, paid, balance, overdueCount }
  }, [invoices])

  const renderStatusBadge = (status: string, isOverdue: boolean) => {
    if (isOverdue && status !== 'paid' && status !== 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
          <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
          Overdue
        </span>
      )
    }
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Paid
          </span>
        )
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            Confirmed
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
            Cancelled
          </span>
        )
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            Draft
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-violet-700">
            Receivables & Lifecycle
          </span>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Invoices & Payments
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Inspect generated billing records, tax snapshots, track overdue balances, and record customer settlements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadInvoices()}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total Invoiced
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            ${summary.invoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500">Excludes cancelled</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            Collected Revenue
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-emerald-600">
            ${summary.paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500">Settled payments</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Outstanding Balance
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            ${summary.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500">Open receivables</span>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
            Overdue Invoices
          </span>
          <div className="mt-2 text-2xl font-black tracking-tight text-rose-700">
            {summary.overdueCount}
          </div>
          <span className="text-[11px] text-rose-600">Action required</span>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        {/* Status filter pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', 'draft', 'confirmed', 'paid', 'overdue', 'cancelled'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search #, customer, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-violet-500 focus:bg-white focus:ring-1 focus:ring-violet-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Invoices Table */}
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
                <th className="py-3 px-4 text-right">Paid</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Loading invoices...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No invoices matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className="hover:bg-violet-50/40 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-violet-700">
                      {inv.number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{inv.customerName}</div>
                      <div className="text-[11px] text-slate-500">{inv.customerEmail}</div>
                    </td>
                    <td className="py-3 px-4">
                      {renderStatusBadge(inv.status, inv.isOverdue)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{inv.issueDate}</td>
                    <td className="py-3 px-4">
                      <span className={inv.isOverdue && inv.status !== 'paid' ? 'font-bold text-rose-600' : 'text-slate-600'}>
                        {inv.dueDate}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      ${parseFloat(inv.total).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                      ${parseFloat(inv.paidAmount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-rose-600">
                      ${parseFloat(inv.balanceDue).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                        >
                          View
                        </button>
                        {inv.status !== 'cancelled' && parseFloat(inv.balanceDue) > 0 && (
                          <button
                            onClick={() => setPaymentInvoice(inv)}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white shadow-2xs hover:bg-emerald-700 transition"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          isOpen={true}
          onClose={() => setSelectedInvoiceId(null)}
          onInvoiceUpdated={loadInvoices}
        />
      )}

      {paymentInvoice && (
        <RecordPaymentModal
          invoice={paymentInvoice}
          isOpen={true}
          onClose={() => setPaymentInvoice(null)}
          onPaymentSuccess={() => {
            loadInvoices()
            setPaymentInvoice(null)
          }}
        />
      )}
    </div>
  )
}
