import type { InvoiceDetail } from '../billing/billingApi'

interface InvoicePrintViewProps {
  invoice: InvoiceDetail
  onClose: () => void
}

export function InvoicePrintView({ invoice, onClose }: InvoicePrintViewProps) {
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 p-4 sm:p-6 backdrop-blur-xs flex justify-center">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white p-8 sm:p-12 shadow-2xl my-auto print:m-0 print:p-0 print:shadow-none print:w-full">
        {/* Screen Action Bar (hidden during print) */}
        <div className="no-print mb-8 flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
              Print Preview
            </span>
            <span className="text-xs text-slate-500">
              Press print or Ctrl/Cmd+P to print or save as PDF
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-violet-700 transition"
            >
              Print Invoice
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Close
            </button>
          </div>
        </div>

        {/* Printable Invoice Document */}
        <div className="space-y-8 text-slate-800 print:text-black">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-violet-600 font-black text-white text-base">
                  B
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-950">
                  Brightloop Software Inc.
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                100 Innovation Way, Suite 400<br />
                San Francisco, CA 94105<br />
                billing@brightloop.io • (800) 555-0199
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                Invoice
              </span>
              <p className="mt-1 font-mono text-sm font-bold text-violet-700">
                {invoice.number}
              </p>
              <div className="mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                {invoice.status}
              </div>
            </div>
          </div>

          {/* Meta & Addresses */}
          <div className="grid grid-cols-2 gap-8 text-xs">
            <div>
              <h4 className="font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
                Billed To
              </h4>
              <p className="mt-1.5 text-sm font-bold text-slate-900">
                {invoice.customerName}
              </p>
              <p className="text-slate-600">{invoice.customerEmail}</p>
              {invoice.billingAddressSnapshot ? (
                <p className="mt-1 text-slate-600 whitespace-pre-line leading-relaxed">
                  {invoice.billingAddressSnapshot}
                </p>
              ) : (
                <p className="mt-1 italic text-slate-400">No physical address on file</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-right">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Issue Date
                </span>
                <p className="mt-0.5 font-semibold text-slate-900">{invoice.issueDate}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Due Date
                </span>
                <p className="mt-0.5 font-semibold text-rose-700">{invoice.dueDate}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Billing Period
                </span>
                <p className="mt-0.5 font-semibold text-slate-700">
                  {invoice.billingPeriod?.start} – {invoice.billingPeriod?.end}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Currency
                </span>
                <p className="mt-0.5 font-semibold text-slate-900">{invoice.currency}</p>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-right">Taxes</th>
                  <th className="py-2.5 px-3 text-right">Discounts</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.lines && invoice.lines.length > 0 ? (
                  invoice.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-400">{line.lineNumber}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900">{line.description}</span>
                        {line.taxes && line.taxes.length > 0 && (
                          <div className="text-[10px] text-slate-500">
                            Taxes: {line.taxes.map((t) => `${t.nameSnapshot} (${t.ratePercentSnapshot}%)`).join(', ')}
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
                      No line items recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2 text-xs">
              <div className="flex justify-between py-1 text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold">${parseFloat(invoice.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600">
                <span>Tax Total</span>
                <span className="font-semibold">${parseFloat(invoice.taxTotal).toFixed(2)}</span>
              </div>
              {parseFloat(invoice.discountTotal) > 0 && (
                <div className="flex justify-between py-1 text-emerald-700">
                  <span>Discounts</span>
                  <span className="font-semibold">-${parseFloat(invoice.discountTotal).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-950">
                <span>Invoice Total</span>
                <span>${parseFloat(invoice.total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-700">
                <span>Payments Applied</span>
                <span className="font-semibold">-${parseFloat(invoice.paidAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-slate-300 pt-2 text-sm font-extrabold text-rose-600">
                <span>Balance Due</span>
                <span>${parseFloat(invoice.balanceDue).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Remittance & Terms */}
          <div className="rounded-xl bg-slate-50 p-4 text-[11px] text-slate-500 border border-slate-200">
            <span className="font-bold text-slate-700">Payment Terms & Remittance:</span>
            <p className="mt-1 leading-relaxed">
              Payment is due by {invoice.dueDate}. For ACH or wire payments, please remit to
              Brightloop Software Inc., Routing: 121000358, Account: 9876543210. Reference invoice
              number <span className="font-semibold text-slate-700">{invoice.number}</span> on all remittances.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
