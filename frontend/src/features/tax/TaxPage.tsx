import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../lib/api'
import { createTaxRule, listTaxRules, previewTax, updateTaxRule, type TaxPreview, type TaxRule, type TaxRuleInput } from './tax-api'

type Props = { isAdmin: boolean; onBack: () => void }

function apiMessage(error: unknown) {
  if (error instanceof ApiError) {
    const fields = error.body?.error?.fieldErrors
    if (fields && Object.keys(fields).length) return Object.values(fields).join(' ')
    return error.message
  }
  return 'We could not complete this request. Please try again.'
}

function money(amount: string, currency: string) { return `${currency} ${amount}` }
function todayLocal() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}
function dateLabel(value: string | null) {
  if (!value) return 'No limit'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export default function TaxPage({ isAdmin, onBack }: Props) {
  const [rules, setRules] = useState<TaxRule[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<TaxRule | null | undefined>(undefined)
  const [previewing, setPreviewing] = useState<TaxRule | null>(null)

  async function load(nextSearch = search, append = false, nextCursor?: string) {
    append ? setLoadingMore(true) : setLoading(true)
    setError('')
    try {
      const result = await listTaxRules(nextSearch, nextCursor)
      setRules((current) => append ? [...current, ...result.items] : result.items)
      setCursor(result.nextCursor)
    } catch (reason) { setError(apiMessage(reason)) }
    finally { setLoading(false); setLoadingMore(false) }
  }

  useEffect(() => { void load('', false) }, [])

  async function save(input: TaxRuleInput, id?: string) {
    setError('')
    try {
      if (id) await updateTaxRule(id, input)
      else await createTaxRule(input)
      setEditing(undefined)
      await load(search, false)
    } catch (reason) { throw new Error(apiMessage(reason)) }
  }

  const activeCount = rules.filter((rule) => rule.isActive).length
  const scheduledCount = rules.filter((rule) => rule.isActive && rule.activeFrom && rule.activeFrom > new Date().toISOString().slice(0, 10)).length

  return <main className="min-h-dvh bg-[#f5f6fa] text-slate-900"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-7 sm:py-8">
    <header className="mb-7 flex items-center justify-between gap-3"><button type="button" onClick={onBack} className="flex items-center gap-3 rounded-lg text-left focus:outline-none focus:ring-4 focus:ring-indigo-100"><span className="grid size-10 place-items-center rounded-xl bg-[#17243b]"><span className="size-4 rounded-[5px] border-[3px] border-[#8ce2d2]" /></span><span><span className="block font-semibold">Brightloop</span><span className="block text-xs text-slate-500">Subscription operations</span></span></button><div className="flex items-center gap-2"><button type="button" onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Overview</button><span className="hidden rounded-lg bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:inline">{isAdmin ? 'Administrator' : 'Staff'}</span></div></header>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">Configuration / Pricing</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Tax rules</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Configure percentage rates and date windows, then preview the rounded amount before applying a rule.</p></div>{isAdmin && <button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">+ Add tax rule</button>}</div>
    <section className="mb-6 grid gap-3 sm:grid-cols-3"><Summary title="Rules loaded" value={String(rules.length)} detail="Current result set" /><Summary title="Active" value={String(activeCount)} detail="Currently enabled" /><Summary title="Scheduled" value={String(scheduledCount)} detail="Starts in the future" /></section>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><form onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); void load(searchDraft.trim(), false) }} className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="font-semibold">Tax configuration</h2><p className="mt-1 text-xs text-slate-500">Staff can view and preview rules; only admins can edit.</p></div><div className="flex gap-2"><input aria-label="Search tax rules" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search rules" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-56" /><button className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Search</button></div></form>
      {error && <p role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-5">{error}</p>}
      {loading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading tax rules…</div> : rules.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-slate-800">No tax rules found</p><p className="mt-1 text-sm text-slate-500">{search ? 'Try a different search.' : 'Add a rule to make tax calculations available.'}</p></div> : <div className="divide-y divide-slate-100">{rules.map((rule) => <RuleCard key={rule.id} rule={rule} isAdmin={isAdmin} onEdit={() => setEditing(rule)} onPreview={() => setPreviewing(rule)} />)}</div>}
      {cursor && <div className="border-t border-slate-100 p-4 text-center"><button disabled={loadingMore} type="button" onClick={() => void load(search, true, cursor)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more rules'}</button></div>}
    </section><p className="mt-4 text-xs leading-5 text-slate-500">Preview uses half-up rounding to the currency’s two decimal places. Quote and invoice flows retain the rule name and rate used at calculation time.</p>
  </div>{editing !== undefined && <RuleEditor rule={editing} onClose={() => setEditing(undefined)} onSave={save} />}{previewing && <PreviewDialog rule={previewing} onClose={() => setPreviewing(null)} />}</main>
}

function Summary({ title, value, detail }: { title: string; value: string; detail: string }) { return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article> }

function RuleCard({ rule, isAdmin, onEdit, onPreview }: { rule: TaxRule; isAdmin: boolean; onEdit: () => void; onPreview: () => void }) {
  return <article className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:px-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-lg font-semibold text-emerald-700">%</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{rule.name}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rule.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{rule.isActive ? 'Active' : 'Inactive'}</span></div><p className="mt-1 text-sm text-slate-600">{rule.ratePercent}% tax rate</p><p className="mt-2 text-xs text-slate-500">Valid {dateLabel(rule.activeFrom)} – {dateLabel(rule.activeUntil)}</p></div><div className="flex gap-2"><button type="button" onClick={onPreview} className="min-h-10 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Preview</button>{isAdmin && <button type="button" onClick={onEdit} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>}</div></article>
}

function RuleEditor({ rule, onClose, onSave }: { rule: TaxRule | null; onClose: () => void; onSave: (input: TaxRuleInput, id?: string) => Promise<void> }) {
  const [name, setName] = useState(rule?.name ?? '')
  const [rate, setRate] = useState(rule?.ratePercent ?? '')
  const [activeFrom, setActiveFrom] = useState(rule?.activeFrom ?? '')
  const [activeUntil, setActiveUntil] = useState(rule?.activeUntil ?? '')
  const [isActive, setIsActive] = useState(rule?.isActive ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!name.trim()) return setError('Enter a tax rule name.')
    if (!/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(rate)) return setError('Enter a rate from 0 to 100 with up to four decimal places.')
    if (activeFrom && activeUntil && activeUntil < activeFrom) return setError('The end date must be on or after the start date.')
    setSaving(true)
    try { await onSave({ name: name.trim(), ratePercent: rate, activeFrom: activeFrom || null, activeUntil: activeUntil || null, isActive }, rule?.id) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the rule.') }
    finally { setSaving(false) }
  }
  return <Overlay title={rule ? 'Edit tax rule' : 'Add tax rule'} onClose={onClose}><form onSubmit={(event) => void submit(event)}><div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-7"><label className="block text-sm font-medium text-slate-700 sm:col-span-2">Rule name<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Standard VAT" className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><label className="block text-sm font-medium text-slate-700 sm:col-span-2">Rate (%)<input required inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="18.0000" className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /><span className="mt-1 block text-xs font-normal text-slate-500">Enter a percentage from 0 to 100. Values are stored to four decimal places.</span></label><label className="block text-sm font-medium text-slate-700">Active from<input type="date" value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><label className="block text-sm font-medium text-slate-700">Active until<input type="date" min={activeFrom || undefined} value={activeUntil} onChange={(event) => setActiveUntil(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>{rule && <Toggle checked={isActive} onChange={setIsActive} />}{error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 sm:col-span-2">{error}</p>}</div><div className="flex gap-3 border-t border-slate-200 px-5 py-4 sm:justify-end sm:px-7"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 sm:flex-none">Cancel</button><button disabled={saving} className="min-h-11 flex-1 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none">{saving ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}</button></div></form></Overlay>
}

function PreviewDialog({ rule, onClose }: { rule: TaxRule; onClose: () => void }) {
  const [amount, setAmount] = useState('100.00')
  const [currency, setCurrency] = useState('USD')
  const [onDate, setOnDate] = useState(todayLocal())
  const [result, setResult] = useState<TaxPreview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function calculate(event: FormEvent) {
    event.preventDefault(); setError(''); setResult(null)
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return setError('Enter a non-negative amount with up to two decimal places.')
    if (!/^[A-Za-z]{3}$/.test(currency)) return setError('Use a three-letter currency code.')
    setLoading(true)
    try { setResult(await previewTax(rule.id, `${amount.split('.')[0]}.${(amount.split('.')[1] ?? '').padEnd(2, '0')}`, currency.toUpperCase(), onDate)) }
    catch (reason) { setError(apiMessage(reason)) }
    finally { setLoading(false) }
  }
  return <Overlay title={`Preview · ${rule.name}`} onClose={onClose}><form onSubmit={(event) => void calculate(event)}><div className="space-y-4 px-5 py-5 sm:px-7"><label className="block text-sm font-medium text-slate-700">Taxable amount<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3" /></label><label className="block text-sm font-medium text-slate-700">Currency<input required maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 uppercase" /></label><label className="block text-sm font-medium text-slate-700">Calculation date<input type="date" value={onDate} onChange={(event) => setOnDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3" /></label>{result && <div className={`rounded-xl border p-4 ${result.applies ? 'border-indigo-100 bg-indigo-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-sm font-semibold">{result.applies ? 'Rule applies' : 'Rule is not active on this date'}</p><div className="mt-3 space-y-2 text-sm"><Line label="Taxable amount" value={money(result.baseAmount, result.currency)} /><Line label={`Tax · ${result.ratePercent}%`} value={money(result.taxAmount, result.currency)} strong /><Line label="Total with tax" value={money(result.totalAmount, result.currency)} strong /></div></div>}{error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}</div><div className="flex gap-3 border-t border-slate-200 px-5 py-4 sm:justify-end sm:px-7"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 sm:flex-none">Close</button><button disabled={loading} className="min-h-11 flex-1 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none">{loading ? 'Calculating…' : 'Calculate tax'}</button></div></form></Overlay>
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between gap-4 ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}><span>{label}</span><span className="tabular-nums">{value}</span></div> }
function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-indigo-600" />Rule is active</label> }
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"><div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-7"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">Tax values are calculated on the server.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div>{children}</section></div> }
