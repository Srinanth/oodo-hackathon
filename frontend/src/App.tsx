import { useState } from 'react'
import { BillingRunPage } from './features/billing/BillingRunPage'

function App() {
  const [activeTab, setActiveTab] = useState<'billing' | 'overview'>('billing')

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
                Billing System
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('billing')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'billing'
                  ? 'bg-violet-50 text-violet-700 border border-violet-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Recurring Billing Runs
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-violet-50 text-violet-700 border border-violet-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              System Overview
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {activeTab === 'billing' ? (
          <BillingRunPage />
        ) : (
          <section className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-10 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
              Brightloop Software
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900">
              Subscription Management Platform
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Modular subscription lifecycle and billing engine. The Recurring Billing Run feature (BILL-01)
              evaluates subscriptions due on a business date and executes idempotent invoice generation.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-800 border border-emerald-200">
                <span className="size-2 rounded-full bg-emerald-500" />
                BILL-01: Recurring Billing Run Ready
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-indigo-800 border border-indigo-200">
                Idempotency: (subscription_id, period_start)
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                CLI: python manage.py run_billing
              </span>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
