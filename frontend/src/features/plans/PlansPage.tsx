import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../../lib/api'
import { createPlan, listPlans, updatePlan, type Plan, type PlanInput, type PlanInterval } from './plans-api'

type Props = { isAdmin: boolean; onBack: () => void }
const intervals: PlanInterval[] = ['daily', 'weekly', 'monthly', 'yearly']

function apiMessage(error: unknown) {
  if (error instanceof ApiError) {
    const fields = error.body?.error?.fieldErrors
    if (fields && Object.keys(fields).length) return Object.values(fields).join(' ')
    return error.message
  }
  return 'We could not complete this request. Please try again.'
}

function intervalLabel(plan: Pick<Plan, 'interval' | 'intervalCount'>) {
  const normalized = intervalUnit(plan.interval)
  return plan.intervalCount === 1 ? `Every ${normalized}` : `Every ${plan.intervalCount} ${normalized}s`
}

function intervalUnit(interval: PlanInterval) {
  return interval === 'daily' ? 'day' : interval === 'weekly' ? 'week' : interval === 'monthly' ? 'month' : 'year'
}

function money(amount: string, currency: string) {
  return `${currency} ${amount}`
}

function dateLabel(value: string | null) {
  if (!value) return 'No limit'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export default function PlansPage({ isAdmin, onBack }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Plan | null | undefined>(undefined)

  async function load(nextSearch = search, append = false, nextCursor?: string) {
    append ? setLoadingMore(true) : setLoading(true)
    setError('')
    try {
      const result = await listPlans(nextSearch, nextCursor)
      setPlans((current) => append ? [...current, ...result.items] : result.items)
      setCursor(result.nextCursor)
    } catch (reason) {
      setError(apiMessage(reason))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => { void load('', false) }, [])

  async function save(input: PlanInput, id?: string) {
    setError('')
    try {
      if (id) await updatePlan(id, input)
      else await createPlan(input)
      setEditing(undefined)
      await load(search, false)
    } catch (reason) {
      throw new Error(apiMessage(reason))
    }
  }

  const activeCount = plans.filter((plan) => plan.isActive).length
  const upcomingCount = plans.filter((plan) => plan.isActive && plan.availableFrom && plan.availableFrom > new Date().toISOString().slice(0, 10)).length

  return (
    <main className="min-h-dvh bg-[#f5f6fa] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-7 sm:py-8">
        <header className="mb-7 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="flex items-center gap-3 rounded-lg text-left focus:outline-none focus:ring-4 focus:ring-indigo-100">
            <span className="grid size-10 place-items-center rounded-xl bg-[#17243b]"><span className="size-4 rounded-[5px] border-[3px] border-[#8ce2d2]" /></span>
            <span><span className="block font-semibold">Brightloop</span><span className="block text-xs text-slate-500">Subscription operations</span></span>
          </button>
          <div className="flex items-center gap-2"><button type="button" onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Overview</button><span className="hidden rounded-lg bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:inline">{isAdmin ? 'Administrator' : 'Staff'}</span></div>
        </header>

        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">Configuration / Billing</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Plans</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Set recurring price, billing cadence, availability, and what happens at the end of a plan.</p></div>
          {isAdmin && <button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">+ Create plan</button>}
        </div>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <Summary title="Plans loaded" value={String(plans.length)} detail="Current result set" />
          <Summary title="Active" value={String(activeCount)} detail="Available for new quotes" />
          <Summary title="Scheduled" value={String(upcomingCount)} detail="Starts in the future" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <form onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); void load(searchDraft.trim(), false) }} className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div><h2 className="font-semibold">Plan catalog</h2><p className="mt-1 text-xs text-slate-500">Staff can view plans; only admins can change them.</p></div>
            <div className="flex gap-2"><input aria-label="Search plans" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search plans" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-56" /><button className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Search</button></div>
          </form>

          {error && <p role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-5">{error}</p>}
          {loading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading plans…</div> : plans.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-slate-800">No plans found</p><p className="mt-1 text-sm text-slate-500">{search ? 'Try a different search.' : 'Create a plan to define pricing and billing terms.'}</p></div> : (
            <div className="divide-y divide-slate-100">
              {plans.map((plan) => <PlanCard key={plan.id} plan={plan} isAdmin={isAdmin} onEdit={() => setEditing(plan)} />)}
            </div>
          )}
          {cursor && <div className="border-t border-slate-100 p-4 text-center"><button disabled={loadingMore} type="button" onClick={() => void load(search, true, cursor)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more plans'}</button></div>}
        </section>
        <p className="mt-4 text-xs leading-5 text-slate-500">Plan changes apply to future quotes. Existing subscriptions keep their saved terms and pricing.</p>
      </div>
      {editing !== undefined && <PlanEditor plan={editing} onClose={() => setEditing(undefined)} onSave={save} />}
    </main>
  )
}

function Summary({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>
}

function PlanCard({ plan, isAdmin, onEdit }: { plan: Plan; isAdmin: boolean; onEdit: () => void }) {
  return <article className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:px-5">
    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-lg text-indigo-700">↻</div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{plan.name}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${plan.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{plan.isActive ? 'Active' : 'Inactive'}</span></div><p className="mt-1 text-sm text-slate-600">{intervalLabel(plan)} · Minimum quantity {plan.minimumQuantity}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Available {dateLabel(plan.availableFrom)} – {dateLabel(plan.availableUntil)}</span><span>{plan.endPolicy === 'close_at_end' ? 'Closes at end date' : 'Renews until closed'}</span><span>{plan.allowPause ? 'Pause allowed' : 'No pause'}</span><span>{plan.allowRenewal ? 'Renewal allowed' : 'No renewal'}</span></div></div>
    <div className="flex items-center justify-between gap-4 sm:justify-end"><p className="text-lg font-semibold tabular-nums">{money(plan.price.amount, plan.price.currency)}<span className="ml-1 text-xs font-normal text-slate-500">/ {plan.intervalCount === 1 ? intervalUnit(plan.interval) : `${plan.intervalCount} ${intervalUnit(plan.interval)}s`}</span></p>{isAdmin && <button type="button" onClick={onEdit} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>}</div>
  </article>
}

function PlanEditor({ plan, onClose, onSave }: { plan: Plan | null; onClose: () => void; onSave: (input: PlanInput, id?: string) => Promise<void> }) {
  const [name, setName] = useState(plan?.name ?? '')
  const [amount, setAmount] = useState(plan?.price.amount ?? '')
  const [currency, setCurrency] = useState(plan?.price.currency ?? 'USD')
  const [interval, setInterval] = useState<PlanInterval>(plan?.interval ?? 'monthly')
  const [intervalCount, setIntervalCount] = useState(plan?.intervalCount ?? 1)
  const [minimumQuantity, setMinimumQuantity] = useState(plan?.minimumQuantity ?? 1)
  const [availableFrom, setAvailableFrom] = useState(plan?.availableFrom ?? '')
  const [availableUntil, setAvailableUntil] = useState(plan?.availableUntil ?? '')
  const [endPolicy, setEndPolicy] = useState<Plan['endPolicy']>(plan?.endPolicy ?? 'close_at_end')
  const [allowPause, setAllowPause] = useState(plan?.allowPause ?? false)
  const [allowRenewal, setAllowRenewal] = useState(plan?.allowRenewal ?? true)
  const [isActive, setIsActive] = useState(plan?.isActive ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const cleanName = name.trim()
    if (!cleanName) return setError('Enter a plan name.')
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount))) return setError('Enter a price with up to two decimal places.')
    if (!/^[A-Za-z]{3}$/.test(currency)) return setError('Use a three-letter currency code.')
    if (availableFrom && availableUntil && availableUntil < availableFrom) return setError('The end date must be on or after the start date.')
    const payload: PlanInput = {
      name: cleanName,
      interval,
      intervalCount,
      price: { amount: `${amount.split('.')[0]}.${(amount.split('.')[1] ?? '').padEnd(2, '0')}`, currency: currency.toUpperCase() },
      minimumQuantity,
      availableFrom: availableFrom || null,
      availableUntil: availableUntil || null,
      endPolicy,
      allowPause,
      allowRenewal,
      isActive,
    }
    setSaving(true)
    try { await onSave(payload, plan?.id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the plan.') } finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="plan-editor-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
    <form onSubmit={(event) => void submit(event)}><div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-7"><div><h2 id="plan-editor-title" className="text-lg font-semibold">{plan ? 'Edit plan' : 'Create plan'}</h2><p className="mt-1 text-sm text-slate-500">Define a reusable billing option for quotes.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div>
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-7"><label className="block text-sm font-medium text-slate-700 sm:col-span-2">Plan name<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Business monthly" className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
        <label className="block text-sm font-medium text-slate-700">Price<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100.00" className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
        <label className="block text-sm font-medium text-slate-700">Currency<input required maxLength={3} value={currency} disabled={Boolean(plan)} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 uppercase outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50" /></label>
        <label className="block text-sm font-medium text-slate-700">Billing interval<select value={interval} onChange={(event) => setInterval(event.target.value as PlanInterval)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">{intervals.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        <label className="block text-sm font-medium text-slate-700">Interval count<input type="number" min={1} max={32767} required value={intervalCount} onChange={(event) => setIntervalCount(Number(event.target.value))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
        <label className="block text-sm font-medium text-slate-700">Minimum quantity<input type="number" min={1} required value={minimumQuantity} onChange={(event) => setMinimumQuantity(Number(event.target.value))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2"><label className="block text-sm font-medium text-slate-700">Available from<input type="date" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><label className="block text-sm font-medium text-slate-700">Available until<input type="date" min={availableFrom || undefined} value={availableUntil} onChange={(event) => setAvailableUntil(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label></div>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">End policy<select value={endPolicy} onChange={(event) => setEndPolicy(event.target.value as Plan['endPolicy'])} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"><option value="close_at_end">Close when the plan end date is reached</option><option value="renew_until_closed">Continue renewing until closed</option></select></label>
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3"><Toggle label="Allow pause" checked={allowPause} onChange={setAllowPause} /><Toggle label="Allow renewal" checked={allowRenewal} onChange={setAllowRenewal} />{plan && <Toggle label="Plan is active" checked={isActive} onChange={setIsActive} />}</div>
        <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900 sm:col-span-2"><strong>Price preview</strong><span className="ml-2">{amount && /^\d/.test(amount) ? money(`${amount.split('.')[0]}.${(amount.split('.')[1] ?? '').padEnd(2, '0')}`, currency.toUpperCase()) : '—'} · {intervalCount} {interval}{intervalCount === 1 ? '' : 's'}</span></div>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 sm:col-span-2">{error}</p>}
      </div><div className="sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:justify-end sm:px-7"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:flex-none">Cancel</button><button disabled={saving} className="min-h-11 flex-1 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 sm:flex-none">{saving ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}</button></div>
    </form>
  </section></div>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-indigo-600" />{label}</label>
}
