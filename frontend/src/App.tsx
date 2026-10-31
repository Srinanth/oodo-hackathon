import { useState } from 'react'
import { BillingRunPage } from './features/billing/BillingRunPage'
import { InvoiceListPage } from './features/invoices/InvoiceListPage'
import { FinanceReportPage } from './features/finance/FinanceReportPage'

function App() {
  const [activeTab, setActiveTab] = useState<'billing' | 'invoices' | 'finance' | 'overview'>('invoices')

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans text-slate-900 antialiased">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-violet-600 font-black text-white shadow-xs">
              B
            </div>
            <div>
              <span className="font-bold text-slate-950 tracking-tight">Brightloop</span>
              <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                Billing & Receivables
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'invoices'
                  ? 'bg-violet-50 text-violet-700 border border-violet-200 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Invoices & Payments
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'billing'
                  ? 'bg-violet-50 text-violet-700 border border-violet-200 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Recurring Billing Runs
            </button>
            <button
              onClick={() => setActiveTab('finance')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'finance'
                  ? 'bg-violet-50 text-violet-700 border border-violet-200 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Finance & Overdue Queue
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-violet-50 text-violet-700 border border-violet-200 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Overview
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {activeTab === 'invoices' && <InvoiceListPage />}
        {activeTab === 'billing' && <BillingRunPage />}
        {activeTab === 'finance' && <FinanceReportPage />}
        {activeTab === 'overview' && (
          <section className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-10 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
              Brightloop Platform
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900">
              Subscription & Finance Infrastructure
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              End-to-end subscription lifecycle, automated periodic billing runs, idempotent invoice generation with
              tax and discount rule snapshots, payment recording, and high-performance financial reporting.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-800 border border-emerald-200">
                <span className="size-2 rounded-full bg-emerald-500" />
                BILL-01: Recurring Billing Runs
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-indigo-800 border border-indigo-200">
                INV-01: Invoices, Snapshots & Lifecycle Actions
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-teal-800 border border-teal-200">
                PAY-01: Payments & Balance Reconciliations
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-800 border border-amber-200">
                FIN-01: Finance Aggregations & Overdue Queue
              </span>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
