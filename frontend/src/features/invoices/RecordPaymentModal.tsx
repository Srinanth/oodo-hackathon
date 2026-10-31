import { useState } from 'react'
import type { Invoice, InvoiceDetail } from '../billing/billingApi'
import { recordInvoicePayment } from '../billing/billingApi'
import { ApiError } from '../../lib/api'

interface RecordPaymentModalProps {
  invoice: Invoice | InvoiceDetail
  isOpen: boolean
  onClose: () => void
  onPaymentSuccess: () => void
}

export function RecordPaymentModal({
  invoice,
  isOpen,
  onClose,
  onPaymentSuccess,
}: RecordPaymentModalProps) {
  const [method, setMethod] = useState<string>('bank_transfer')
  const [amount, setAmount] = useState<string>(() => invoice.balanceDue || invoice.total)
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 16))
  const [note, setNote] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid payment amount greater than 0.')
      return
    }

    try {
      setSubmitting(true)
      await recordInvoicePayment(invoice.id, {
        method,
        amount: parsedAmount.toFixed(2),
        currency: invoice.currency || 'USD',
        paidAt: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
        note: note.trim(),
      })
      onPaymentSuccess()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body?.error?.message || err.message)
      } else {
        setError('Failed to record payment. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 transition-all">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              Payment Settlement
            </span>
            <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Invoice <span className="font-semibold text-slate-700">{invoice.number}</span> •{' '}
              {invoice.customerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Invoice Summary Pill */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              Total
            </div>
            <div className="text-sm font-semibold text-slate-900">
              ${parseFloat(invoice.total).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              Already Paid
            </div>
            <div className="text-sm font-semibold text-emerald-600">
              ${parseFloat(invoice.paidAmount).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              Balance Due
            </div>
            <div className="text-sm font-bold text-rose-600">
              ${parseFloat(invoice.balanceDue).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Payment Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
            >
              <option value="bank_transfer">Bank Transfer / Wire</option>
              <option value="credit_card">Credit Card</option>
              <option value="ach">ACH Direct Debit</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="other">Other Manual Settlement</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount ({invoice.currency || 'USD'})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-slate-400 font-semibold">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-7 pr-3 py-2 text-sm font-medium text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setAmount(invoice.balanceDue)}
                className="mt-1 text-[11px] font-medium text-violet-600 hover:text-violet-800"
              >
                Set to remaining balance (${invoice.balanceDue})
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Payment Date & Time
              </label>
              <input
                type="datetime-local"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Note / Reference (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Check #4092, Stripe ch_3Nx, Nov settlement"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
