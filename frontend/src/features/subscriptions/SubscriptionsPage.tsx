import { useEffect, useState } from 'react'

import { ApiError } from '../../lib/api'
import { applySubscriptionAction, getSubscriptions, type Subscription } from './subscriptionsApi'

function message(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return 'Could not load subscriptions.'
}

export function SubscriptionsPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Subscription[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load(cursor: string | null = null) {
    setLoading(true)
    setError('')
    try {
      const page = await getSubscriptions(search, status, cursor)
      setRows(page.items)
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [search, status])

  async function runAction(subscription: Subscription, action: string) {
    setBusy(subscription.id)
    setError('')
    setNotice('')
    try {
      await applySubscriptionAction(subscription.id, action)
      setNotice(`${subscription.number}: ${action.replaceAll('_', ' ')} completed.`)
      await load()
    } catch (actionError) {
      setError(message(actionError))
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="min-h-dvh bg-[#f5f7fb] px-4 py-7 text-slate-900 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div><button type="button" onClick={onBack} className="mb-3 text-sm font-semibold text-indigo-700">← Workspace</button><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Brightloop · Operations</p><h1 className="mt-2 text-3xl font-semibold">Subscriptions</h1><p className="mt-2 text-sm text-slate-500">Manage billing dates and customer lifecycle actions.</p></div>
          <div className="flex w-full gap-2 sm:w-auto"><input aria-label="Search subscriptions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number or customer" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:w-64" /><select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="active">Active</option><option value="paused">Paused</option><option value="closed">Closed</option></select></div>
        </header>
        {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? <p role="status" className="p-10 text-center text-sm text-slate-500">Loading subscriptions…</p> : rows.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No subscriptions found.</p> : <div className="divide-y divide-slate-100">{rows.map((subscription) => <article key={subscription.id} className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{subscription.number}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{subscription.status}</span>{subscription.closeAtPeriodEnd && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Closing at period end</span>}</div><p className="mt-1 text-sm text-slate-600">{subscription.customerName} · {subscription.customerEmail}{subscription.planName ? ` · ${subscription.planName}` : ''}</p><p className="mt-1 text-xs text-slate-500">Next billing {subscription.nextBillingAt} · {subscription.currency} · {subscription.paymentTerms || 'No payment terms'}</p></div><div className="flex flex-wrap gap-2">{subscription.status === 'confirmed' && <button disabled={busy === subscription.id} onClick={() => void runAction(subscription, 'activate')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Activate</button>}{subscription.status === 'active' && <><button disabled={busy === subscription.id || !subscription.planAllowPause} onClick={() => void runAction(subscription, 'pause')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Pause</button><button disabled={busy === subscription.id} onClick={() => void runAction(subscription, 'close_at_period_end')} className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">Close at period end</button><button disabled={busy === subscription.id} onClick={() => void runAction(subscription, 'close_early')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Close now</button></>}{subscription.status === 'paused' && <button disabled={busy === subscription.id} onClick={() => void runAction(subscription, 'resume')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Resume</button>}{subscription.status === 'closed' && <button disabled={busy === subscription.id || !subscription.planAllowRenewal} onClick={() => void runAction(subscription, 'renew')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Renew</button>}</div></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{subscription.lines.map((line) => <div key={line.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{line.description}</span><span className="ml-2 text-slate-500">{line.quantity} × {line.currency} {line.unitPrice}</span></div>)}</div><details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-indigo-700">View lifecycle history</summary><div className="mt-2 space-y-2">{subscription.events?.length ? subscription.events.map((event) => <p key={event.id} className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()} · {event.action.replaceAll('_', ' ')} · {event.fromStatus || 'new'} → {event.toStatus}{event.actorEmail ? ` by ${event.actorEmail}` : ''}</p>) : <p className="text-xs text-slate-500">No state changes recorded.</p>}</div></details></article>)}</div>}
          <footer className="flex justify-end border-t border-slate-100 p-4"><button type="button" disabled={!nextCursor || loading} onClick={() => void load(nextCursor)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Next page →</button></footer>
        </section>
      </div>
    </main>
  )
}
