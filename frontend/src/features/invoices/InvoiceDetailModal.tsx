import { useEffect, useState } from 'react'
import type { InvoiceDetail } from '../billing/billingApi'
import {
  fetchInvoice,
  performInvoiceAction,
} from '../billing/billingApi'
import { ApiError } from '../../lib/api'
import { RecordPaymentModal } from './RecordPaymentModal'
import { InvoicePrintView } from './InvoicePrintView'

interface InvoiceDetailModalProps {
  invoiceId: string
  isOpen: boolean
  onClose: () => void
  onInvoiceUpdated?: () => void
}

export function InvoiceDetailModal({
  invoiceId,
  isOpen,
  onClose,
  onInvoiceUpdated,
}: InvoiceDetailModalProps) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Payment & Print modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false)
  const [isPrintViewOpen, setIsPrintViewOpen] = useState<boolean>(false)

  const loadDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchInvoice(invoiceId)
      setInvoice(data)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body?.error?.message || err.message)
      } else {
        setError('Failed to load invoice details.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    async function load() {
      if (!isOpen || !invoiceId) return
      try {
        setLoading(true)
        setError(null)
        const data = await fetchInvoice(invoiceId)
        if (!ignore) {
          setInvoice(data)
        }
      } catch (err) {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.body?.error?.message || err.message)
          } else {
            setError('Failed to load invoice details.')
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
  }, [isOpen, invoiceId])

  if (!isOpen) return null

  const handleAction = async (action: 'confirm' | 'cancel' | 'send' | 'print') => {
    if (action === 'print') {
      setIsPrintViewOpen(true)
      return
    }

    try {
      setActionLoading(action)
      setError(null)
      setActionSuccess(null)
      const updated = await performInvoiceAction(invoiceId, action)
      setInvoice(updated)
      setActionSuccess(action === 'send'
        ? 'Invoice send simulated. Configure an email provider to deliver invoices.'
        : `Invoice successfully ${action === 'confirm' ? 'confirmed' : 'cancelled'}!`)
      onInvoiceUpdated?.()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body?.error?.message || err.message)
      } else {
        setError(`Failed to perform ${action} action.`)
      }
    } finally {
      setActionLoading(null)
    }
  }

  const handlePaymentSuccess = () => {
    loadDetail()
    setActionSuccess('Payment recorded successfully! Balance updated.')
    onInvoiceUpdated?.()
  }

  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (isOverdue && status !== 'paid' && status !== 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 border border-rose-300">
          <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
          Overdue
        </span>
      )
    }

    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Paid
          </span>
        )
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 border border-blue-300">
            Confirmed
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-300">
            Cancelled
          </span>
        )
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-300">
            Draft
          </span>
        )
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col my-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-violet-600 font-bold text-white shadow-xs">
                INV
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    {invoice ? invoice.number : 'Invoice Detail'}
                  </h3>
                  {invoice && getStatusBadge(invoice.status, invoice.isOverdue)}
                </div>
                {invoice && (
                  <p className="text-xs text-slate-500">
                    Customer: <span className="font-semibold text-slate-700">{invoice.customerName}</span> ({invoice.customerEmail})
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              ✕
            </button>
          </div>

          {/* Action Alerts */}
          {error && (
            <div className="mx-6 mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}
          {actionSuccess && (
            <div className="mx-6 mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
              {actionSuccess}
            </div>
          )}

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Loading invoice details...
              </div>
            ) : !invoice ? (
              <div className="py-12 text-center text-sm text-rose-500">
                Invoice could not be found.
              </div>
            ) : (
              <>
                {/* Overdue Warning Banner */}
                {invoice.isOverdue && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-rose-600 text-lg">⚠️</span>
                      <div>
                        <div className="text-xs font-bold text-rose-900">
                          Invoice Payment is Overdue
                        </div>
                        <div className="text-xs text-rose-700">
                          Due date was {invoice.dueDate}. An outstanding balance of ${invoice.balanceDue} remains.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition"
                    >
                      Collect Now
                    </button>
                  </div>
                )}

                {/* KPI Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                    <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                      Total Invoiced
                    </span>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      ${parseFloat(invoice.total).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-slate-500">{invoice.currency}</span>
                  </div>
                  <div className="rounded-xl bg-emerald-50/60 p-3.5 border border-emerald-100">
                    <span className="text-[11px] font-semibold uppercase text-emerald-700 tracking-wider">
                      Collected / Paid
                    </span>
                    <div className="mt-1 text-lg font-bold text-emerald-700">
                      ${parseFloat(invoice.paidAmount).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-emerald-600">
                      {((parseFloat(invoice.paidAmount) / (parseFloat(invoice.total) || 1)) * 100).toFixed(0)}% Settled
                    </span>
                  </div>
                  <div className="rounded-xl bg-rose-50/60 p-3.5 border border-rose-100">
                    <span className="text-[11px] font-semibold uppercase text-rose-700 tracking-wider">
                      Balance Due
                    </span>
                    <div className="mt-1 text-lg font-bold text-rose-700">
                      ${parseFloat(invoice.balanceDue).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-rose-600">Due {invoice.dueDate}</span>
                  </div>
                  <div className="rounded-xl bg-violet-50/60 p-3.5 border border-violet-100">
                    <span className="text-[11px] font-semibold uppercase text-violet-700 tracking-wider">
                      Billing Period
                    </span>
                    <div className="mt-1 text-xs font-bold text-violet-900">
                      {invoice.billingPeriod?.start}
                    </div>
                    <span className="text-[10px] text-violet-600">to {invoice.billingPeriod?.end}</span>
                  </div>
                </div>

                {/* Customer Snapshot & Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                    <h4 className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                      Customer Snapshot
                    </h4>
                    <div>
                      <span className="text-slate-400">Name:</span>{' '}
                      <span className="font-semibold text-slate-900">{invoice.customerName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Email:</span>{' '}
                      <span className="font-medium text-slate-800">{invoice.customerEmail}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Billing Address:</span>{' '}
                      <span className="text-slate-700">
                        {invoice.billingAddressSnapshot || 'None specified'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 pt-1">
                      Customer ID: <code className="font-mono text-[10px]">{invoice.customerId}</code>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                    <h4 className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                      Subscription & Timeline
                    </h4>
                    <div>
                      <span className="text-slate-400">Subscription ID:</span>{' '}
                      <code className="font-mono text-[10px] text-violet-700 font-semibold">
                        {invoice.subscriptionId}
                      </code>
                    </div>
                    <div>
                      <span className="text-slate-400">Issue Date:</span>{' '}
                      <span className="font-medium text-slate-800">{invoice.issueDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Confirmed At:</span>{' '}
                      <span className="text-slate-700">
                        {invoice.confirmedAt ? new Date(invoice.confirmedAt).toLocaleString() : 'Unconfirmed'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Created:</span>{' '}
                      <span className="text-slate-700">
                        {new Date(invoice.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Invoice Lines ({invoice.lines?.length || 0})
                  </h4>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Description</th>
                          <th className="py-2.5 px-3 text-right">Qty</th>
                          <th className="py-2.5 px-3 text-right">Unit Price</th>
                          <th className="py-2.5 px-3 text-right">Taxes</th>
                          <th className="py-2.5 px-3 text-right">Discounts</th>
                          <th className="py-2.5 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoice.lines && invoice.lines.length > 0 ? (
                          invoice.lines.map((line) => (
                            <tr key={line.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 text-slate-400">{line.lineNumber}</td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-900">{line.description}</div>
                                {line.taxes && line.taxes.length > 0 && (
                                  <div className="text-[10px] text-slate-500">
                                    {line.taxes.map((t) => `${t.nameSnapshot} (${t.ratePercentSnapshot}%)`).join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-700">
                                {parseFloat(line.quantity).toFixed(0)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-700">
                                ${parseFloat(line.unitPrice).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-600">
                                ${parseFloat(line.taxAmount).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-600">
                                ${parseFloat(line.discountAmount).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                ${parseFloat(line.total).toFixed(2)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-4 text-center text-slate-400">
                              No lines recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payments Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Payment History ({invoice.payments?.length || 0})
                    </h4>
                    {invoice.status !== 'cancelled' && parseFloat(invoice.balanceDue) > 0 && (
                      <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                      >
                        + Record Payment
                      </button>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Paid Date</th>
                          <th className="py-2.5 px-3">Method</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Recorded By</th>
                          <th className="py-2.5 px-3">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoice.payments && invoice.payments.length > 0 ? (
                          invoice.payments.map((pay) => (
                            <tr key={pay.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-medium text-slate-800">
                                {new Date(pay.paidAt).toLocaleDateString()}
                              </td>
                              <td className="py-2.5 px-3 capitalize text-slate-700">
                                {pay.method.replace('_', ' ')}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                                ${parseFloat(pay.amount).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 uppercase">
                                  {pay.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                                {pay.recordedByEmail || 'System'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 italic text-[11px]">
                                {pay.note || '—'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-400">
                              No payments recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer Actions */}
          {invoice && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3.5 rounded-b-2xl">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPrintViewOpen(true)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                >
                  Print / PDF View
                </button>
                <button
                  onClick={() => handleAction('send')}
                  disabled={actionLoading !== null}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                >
                  {actionLoading === 'send' ? 'Sending...' : 'Send Invoice'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {invoice.status === 'draft' && (
                  <button
                    onClick={() => handleAction('confirm')}
                    disabled={actionLoading !== null}
                    className="rounded-xl bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-violet-700 disabled:opacity-50 transition"
                  >
                    {actionLoading === 'confirm' ? 'Confirming...' : 'Confirm Invoice'}
                  </button>
                )}

                {invoice.status !== 'cancelled' && (
                  <button
                    onClick={() => handleAction('cancel')}
                    disabled={actionLoading !== null}
                    className="rounded-xl border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-700 shadow-2xs hover:bg-rose-50 disabled:opacity-50 transition"
                  >
                    {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Invoice'}
                  </button>
                )}

                {invoice.status !== 'cancelled' && parseFloat(invoice.balanceDue) > 0 && (
                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                  >
                    Record Payment
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested Modals */}
      {invoice && (
        <>
          <RecordPaymentModal
            invoice={invoice}
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            onPaymentSuccess={handlePaymentSuccess}
          />
          {isPrintViewOpen && (
            <InvoicePrintView
              invoice={invoice}
              onClose={() => setIsPrintViewOpen(false)}
            />
          )}
        </>
      )}
    </>
  )
}
