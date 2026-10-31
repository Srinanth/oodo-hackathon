import { useCallback, useEffect, useState } from 'react'

import { ApiError, apiFetch } from '../../lib/api'
import type { Customer } from '../customers/customersApi'
import type { Invoice } from '../billing/billingApi'
import { applySubscriptionAction, getPortalSubscriptions, type Subscription } from '../subscriptions/subscriptionsApi'

type Page<T> = { results?: T[]; items?: T[] }

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return 'Could not load your account. Please try again.'
}

export function CustomerPortalPage({ onLogout }: { onLogout: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [customerData, subscriptionData, invoiceData] = await Promise.all([
        apiFetch<Customer>('portal/customer'),
        getPortalSubscriptions(),
        apiFetch<Page<Invoice>>('portal/invoices?limit=25'),
      ])
      setCustomer(customerData)
      setSubscriptions(subscriptionData.items)
      setInvoices(invoiceData.results ?? invoiceData.items ?? [])
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function runAction(subscription: Subscription, action: string) {
    setBusy(subscription.id)
    setError('')
    setNotice('')
    try {
      await applySubscriptionAction(subscription.id, action)
      setNotice(`Subscription ${subscription.number} updated.`)
      await load()
    } catch (actionError) {
      setError(errorMessage(actionError))
    } finally {
      setBusy(null)
    }
  }

  return (
    <main id="portal-home" className="min-h-dvh bg-[#f5f7fb] px-4 pb-24 py-6 text-slate-900 sm:px-8 sm:py-10 lg:pb-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#17243b] p-5 text-white sm:p-7">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8ce2d2]">Brightloop · Customer portal</p><h1 className="mt-2 text-2xl font-semibold">{customer ? `Welcome, ${customer.contactName}` : 'Your account'}</h1><p className="mt-1 text-sm text-slate-300">Your subscriptions, invoices, and billing dates.</p></div>
          <button type="button" onClick={onLogout} className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">Sign out</button>
        </header>
        {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p>{error}</p>{customer === null && <p className="mt-1 text-xs">Ask your account manager to link your portal login to your customer record.</p>}</div>}
        {loading ? <p role="status" className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading your account…</p> : customer && <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section id="portal-subscriptions" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Your subscriptions</h2><p className="mt-1 text-xs text-slate-500">Only subscriptions linked to your account appear here.</p></div>
            {subscriptions.length === 0 ? <p className="p-8 text-sm text-slate-500">No subscriptions yet.</p> : <div className="divide-y divide-slate-100">{subscriptions.map((subscription) => <article key={subscription.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{subscription.planName || subscription.number}</h3><p className="mt-1 text-xs text-slate-500">{subscription.number} · {subscription.status} · Next billing {subscription.nextBillingAt}</p></div><div className="flex gap-2">{subscription.status === 'active' && subscription.planAllowPause && <button disabled={busy === subscription.id} onClick={() => void runAction(subscription, 'pause')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Pause</button>}{subscription.status === 'paused' && <button disabled={busy === subscription.id} onClick={() => void runAction(subscription, 'resume')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Resume</button>}{subscription.status === 'closed' && subscription.planAllowRenewal && <button disabled={busy === subscription.id} onClick={() => void runAction(subscription, 'renew')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Renew</button>}</div></div><div className="mt-3 space-y-1">{subscription.lines.map((line) => <p key={line.id} className="text-sm text-slate-700">{line.description} · {line.quantity} × {line.currency} {line.unitPrice}</p>)}</div></article>)}</div>}
          </section>
          <section id="portal-invoices" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Invoices</h2><p className="mt-1 text-xs text-slate-500">Invoice history and current balances.</p></div>
            {invoices.length === 0 ? <p className="p-8 text-sm text-slate-500">No invoices yet.</p> : <div className="divide-y divide-slate-100">{invoices.map((invoice) => <article key={invoice.id} className="p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{invoice.number}</h3><p className="mt-1 text-xs capitalize text-slate-500">{invoice.status} · Due {invoice.dueDate}</p></div><div className="text-right"><p className="font-semibold">{invoice.currency} {invoice.total}</p><p className="text-xs text-slate-500">Balance {invoice.balanceDue}</p></div></div></article>)}</div>}
          </section>
        </div>}
      </div>
      <nav aria-label="Customer portal sections" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-slate-200 bg-white/95 px-3 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur lg:hidden">
        {[
          ['portal-home', 'Home', '▦'],
          ['portal-subscriptions', 'Subscriptions', '↻'],
          ['portal-invoices', 'Invoices', '▧'],
        ].map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] font-semibold text-slate-600 hover:text-indigo-700">
            <span aria-hidden="true" className="text-lg leading-none">{icon}</span>{label}
          </button>
        ))}
      </nav>
    </main>
  )
}
