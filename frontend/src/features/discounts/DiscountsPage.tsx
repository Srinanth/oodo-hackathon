import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../lib/api'
import { listProducts, type Product } from '../catalog/catalog-api'
import { createDiscountRule, listDiscountRules, previewDiscount, updateDiscountRule, type DiscountLineInput, type DiscountPreview, type DiscountRule, type DiscountRuleInput } from './discounts-api'

type Props = { isAdmin: boolean; onBack: () => void }

function apiMessage(error: unknown) {
  if (error instanceof ApiError) {
    const fields = error.body?.error?.fieldErrors
    if (fields && Object.keys(fields).length) return Object.values(fields).join(' ')
    return error.message
  }
  return 'We could not complete this request. Please try again.'
}

function localDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function isoDateTime(value: string) { return value ? new Date(value).toISOString() : null }
function money(amount: string, currency: string) { return `${currency} ${amount}` }
function reasonLabel(reason: string | null) {
  const labels: Record<string, string> = {
    inactive: 'This rule is inactive', not_started: 'The active window has not started', expired: 'The active window has ended',
    no_targeted_products: 'No targeted products are in the preview', mixed_currency: 'Line currencies do not match',
    minimum_quantity_not_met: 'Minimum quantity is not met', minimum_purchase_not_met: 'Minimum purchase is not met',
    currency_mismatch: 'Discount currency does not match', maximum_uses_reached: 'The maximum number of uses has been reached',
    no_discountable_amount: 'No positive amount is eligible for a discount', discount_rounds_to_zero: 'The discount rounds to zero in this currency',
  }
  return reason ? labels[reason] ?? 'This discount is not eligible' : 'Eligible'
}

export default function DiscountsPage({ isAdmin, onBack }: Props) {
  const [rules, setRules] = useState<DiscountRule[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<DiscountRule | null | undefined>(undefined)
  const [previewing, setPreviewing] = useState<DiscountRule | null>(null)

  async function load(nextSearch = search, append = false, nextCursor?: string) {
    append ? setLoadingMore(true) : setLoading(true)
    setError('')
    try {
      const result = await listDiscountRules(nextSearch, nextCursor)
      setRules((current) => append ? [...current, ...result.items] : result.items)
      setCursor(result.nextCursor)
    } catch (reason) { setError(apiMessage(reason)) }
    finally { setLoading(false); setLoadingMore(false) }
  }

  useEffect(() => {
    void load('', false)
    let active = true
    async function loadProducts() {
      const all: Product[] = []
      let next: string | null = null
      do {
        const page: { items: Product[]; nextCursor: string | null } = await listProducts('', next ?? undefined)
        all.push(...page.items.filter((product) => product.isActive))
        next = page.nextCursor
      } while (next && active)
      if (active) setProducts(all)
    }
    void loadProducts().catch((reason) => { if (active) setError(apiMessage(reason)) })
    return () => { active = false }
  }, [])

  async function save(input: DiscountRuleInput, id?: string) {
    setError('')
    try {
      if (id) await updateDiscountRule(id, input)
      else await createDiscountRule(input)
      setEditing(undefined)
      await load(search, false)
    } catch (reason) { throw new Error(apiMessage(reason)) }
  }

  const activeCount = rules.filter((rule) => rule.isActive).length
  const cappedCount = rules.filter((rule) => rule.maximumUses !== null).length

  return <main className="min-h-dvh bg-[#f5f6fa] text-slate-900"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-7 sm:py-8">
    <header className="mb-7 flex items-center justify-between gap-3"><button type="button" onClick={onBack} className="flex items-center gap-3 rounded-lg text-left focus:outline-none focus:ring-4 focus:ring-indigo-100"><span className="grid size-10 place-items-center rounded-xl bg-[#17243b]"><span className="size-4 rounded-[5px] border-[3px] border-[#8ce2d2]" /></span><span><span className="block font-semibold">Brightloop</span><span className="block text-xs text-slate-500">Subscription operations</span></span></button><div className="flex items-center gap-2"><button type="button" onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Overview</button><span className="hidden rounded-lg bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:inline">{isAdmin ? 'Administrator' : 'Staff'}</span></div></header>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">Configuration / Pricing</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Discount rules</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Set eligibility conditions for fixed or percentage discounts, with product scope, time windows, and use limits.</p></div>{isAdmin && <button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">+ Add discount rule</button>}</div>
    <section className="mb-6 grid gap-3 sm:grid-cols-3"><Summary title="Rules loaded" value={String(rules.length)} detail="Current result set" /><Summary title="Active" value={String(activeCount)} detail="Currently enabled" /><Summary title="Use-capped" value={String(cappedCount)} detail="Limited redemption rules" /></section>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><form onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); void load(searchDraft.trim(), false) }} className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="font-semibold">Discount configuration</h2><p className="mt-1 text-xs text-slate-500">Staff can view and preview; only admins can change rules.</p></div><div className="flex gap-2"><input aria-label="Search discount rules" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search rules" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-56" /><button className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Search</button></div></form>
      {error && <p role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-5">{error}</p>}
      {loading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading discount rules…</div> : rules.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-slate-800">No discount rules found</p><p className="mt-1 text-sm text-slate-500">{search ? 'Try a different search.' : 'Create a rule to define discount eligibility.'}</p></div> : <div className="divide-y divide-slate-100">{rules.map((rule) => <DiscountCard key={rule.id} rule={rule} products={products} isAdmin={isAdmin} onEdit={() => setEditing(rule)} onPreview={() => setPreviewing(rule)} />)}</div>}
      {cursor && <div className="border-t border-slate-100 p-4 text-center"><button disabled={loadingMore} type="button" onClick={() => void load(search, true, cursor)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more rules'}</button></div>}
    </section><p className="mt-4 text-xs leading-5 text-slate-500">Invoice generation reserves capped uses; confirmation consumes them, and cancellation of an unconfirmed invoice releases its reservation.</p>
  </div>{editing !== undefined && <RuleEditor rule={editing} products={products} onClose={() => setEditing(undefined)} onSave={save} />}{previewing && <PreviewDialog rule={previewing} products={products} onClose={() => setPreviewing(null)} />}</main>
}

function Summary({ title, value, detail }: { title: string; value: string; detail: string }) { return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article> }

function DiscountCard({ rule, products, isAdmin, onEdit, onPreview }: { rule: DiscountRule; products: Product[]; isAdmin: boolean; onEdit: () => void; onPreview: () => void }) {
  const productNames = new Map(products.map((product) => [product.id, product.name]))
  const value = rule.discountType === 'percentage' ? `${rule.value}%` : money(rule.value, rule.currency ?? '')
  const scope = rule.scope === 'whole_subscription' ? 'Whole subscription' : rule.productIds.map((id) => productNames.get(id) ?? 'Archived product').join(', ')
  return <article className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:px-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-lg font-semibold text-violet-700">−</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{rule.name}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rule.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{rule.isActive ? 'Active' : 'Inactive'}</span><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">{rule.discountType === 'fixed' ? 'Fixed' : 'Percent'}</span></div><p className="mt-1 text-sm text-slate-600">{value} off · {scope}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Minimum {rule.minimumPurchase} · quantity {rule.minimumQuantity}</span><span>{rule.maximumUses === null ? 'Unlimited uses' : `${rule.usesRemaining} of ${rule.maximumUses} uses remaining`}</span><span>{rule.startsAt ? new Date(rule.startsAt).toLocaleString() : 'No start'} – {rule.endsAt ? new Date(rule.endsAt).toLocaleString() : 'No end'}</span></div></div><div className="flex gap-2"><button type="button" onClick={onPreview} className="min-h-10 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Preview</button>{isAdmin && <button type="button" onClick={onEdit} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>}</div></article>
}

function RuleEditor({ rule, products, onClose, onSave }: { rule: DiscountRule | null; products: Product[]; onClose: () => void; onSave: (input: DiscountRuleInput, id?: string) => Promise<void> }) {
  const [name, setName] = useState(rule?.name ?? '')
  const [discountType, setDiscountType] = useState<DiscountRule['discountType']>(rule?.discountType ?? 'percentage')
  const [value, setValue] = useState(rule?.value ?? '')
  const [currency, setCurrency] = useState(rule?.currency ?? 'USD')
  const [minimumPurchase, setMinimumPurchase] = useState(rule?.minimumPurchase ?? '0.00')
  const [minimumQuantity, setMinimumQuantity] = useState(rule?.minimumQuantity ?? 1)
  const [scope, setScope] = useState<DiscountRule['scope']>(rule?.scope ?? 'whole_subscription')
  const [productIds, setProductIds] = useState<string[]>(rule?.productIds ?? [])
  const [startsAt, setStartsAt] = useState(localDateTime(rule?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState(localDateTime(rule?.endsAt ?? null))
  const [maximumUses, setMaximumUses] = useState(rule?.maximumUses?.toString() ?? '')
  const [isActive, setIsActive] = useState(rule?.isActive ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleProduct(id: string) { setProductIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!name.trim()) return setError('Enter a rule name.')
    if (!/^(?:\d+)(?:\.\d{1,4})?$/.test(value) || Number(value) <= 0) return setError('Enter a value greater than zero with up to four decimal places.')
    if (discountType === 'percentage' && Number(value) > 100) return setError('Percentage discounts cannot exceed 100.')
    if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(minimumPurchase)) return setError('Minimum purchase must have up to two decimal places.')
    if (discountType === 'fixed' && !/^[A-Za-z]{3}$/.test(currency)) return setError('Use a three-letter currency code.')
    if (scope === 'products' && productIds.length === 0) return setError('Select at least one product.')
    if (startsAt && endsAt && endsAt < startsAt) return setError('The end time must be on or after the start time.')
    if (maximumUses && (!/^\d+$/.test(maximumUses) || Number(maximumUses) < 1)) return setError('Maximum uses must be a positive whole number.')
    const normalizedValue = `${value.split('.')[0]}.${(value.split('.')[1] ?? '').padEnd(4, '0')}`
    const payload: DiscountRuleInput = {
      name: name.trim(), discountType, value: normalizedValue, currency: discountType === 'fixed' ? currency.toUpperCase() : null,
      minimumPurchase: `${minimumPurchase.split('.')[0]}.${(minimumPurchase.split('.')[1] ?? '').padEnd(2, '0')}`,
      minimumQuantity, scope, productIds: scope === 'products' ? productIds : [],
      startsAt: isoDateTime(startsAt), endsAt: isoDateTime(endsAt), maximumUses: maximumUses ? Number(maximumUses) : null, isActive,
    }
    setSaving(true)
    try { await onSave(payload, rule?.id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the discount rule.') }
    finally { setSaving(false) }
  }

  return <Overlay title={rule ? 'Edit discount rule' : 'Create discount rule'} onClose={onClose}><form onSubmit={(event) => void submit(event)}><div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-7"><label className="block text-sm font-medium text-slate-700 sm:col-span-2">Rule name<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Launch offer" className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
    <label className="block text-sm font-medium text-slate-700">Discount type<select value={discountType} onChange={(event) => setDiscountType(event.target.value as DiscountRule['discountType'])} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label><label className="block text-sm font-medium text-slate-700">{discountType === 'percentage' ? 'Percentage (%)' : 'Discount amount'}<input required inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={discountType === 'percentage' ? '10.0000' : '25.0000'} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
    {discountType === 'fixed' && <label className="block text-sm font-medium text-slate-700">Currency<input required maxLength={3} value={currency} disabled={Boolean(rule?.discountType === 'fixed')} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 uppercase disabled:bg-slate-50" /></label>}
    <label className="block text-sm font-medium text-slate-700">Minimum purchase<input required inputMode="decimal" value={minimumPurchase} onChange={(event) => setMinimumPurchase(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3" /></label><label className="block text-sm font-medium text-slate-700">Minimum quantity<input required type="number" min={1} value={minimumQuantity} onChange={(event) => setMinimumQuantity(Number(event.target.value))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3" /></label><label className="block text-sm font-medium text-slate-700">Maximum uses <span className="font-normal text-slate-400">(optional)</span><input type="number" min={1} value={maximumUses} onChange={(event) => setMaximumUses(event.target.value)} placeholder="Unlimited" className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3" /></label>
    <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Applies to<select value={scope} onChange={(event) => { const next = event.target.value as DiscountRule['scope']; setScope(next); if (next !== 'products') setProductIds([]) }} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="whole_subscription">Whole subscription</option><option value="products">Selected products</option></select></label>
    {scope === 'products' && <fieldset className="rounded-xl border border-slate-200 p-3 sm:col-span-2"><legend className="px-1 text-sm font-medium text-slate-700">Eligible products</legend>{products.length ? <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">{products.map((product) => <label key={product.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={productIds.includes(product.id)} onChange={() => toggleProduct(product.id)} className="size-4 accent-indigo-600" />{product.name}</label>)}</div> : <p className="text-sm text-slate-500">Create an active product before targeting products.</p>}</fieldset>}
    <div className="grid grid-cols-2 gap-3 sm:col-span-2"><label className="block text-sm font-medium text-slate-700">Starts at<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-2" /></label><label className="block text-sm font-medium text-slate-700">Ends at<input type="datetime-local" min={startsAt || undefined} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-2" /></label></div>
    {rule && <Toggle checked={isActive} onChange={setIsActive} />}{error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 sm:col-span-2">{error}</p>}
    </div><div className="flex gap-3 border-t border-slate-200 px-5 py-4 sm:justify-end sm:px-7"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 sm:flex-none">Cancel</button><button disabled={saving} className="min-h-11 flex-1 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none">{saving ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}</button></div></form></Overlay>
}

type DraftLine = { productId: string; amount: string; quantity: number }
function PreviewDialog({ rule, products, onClose }: { rule: DiscountRule; products: Product[]; onClose: () => void }) {
  const [lines, setLines] = useState<DraftLine[]>([{ productId: rule.productIds[0] ?? products[0]?.id ?? '', amount: '100.00', quantity: 1 }])
  const [currency, setCurrency] = useState(rule.currency ?? products.find((product) => product.id === (rule.productIds[0] ?? products[0]?.id))?.salesPrice.currency ?? 'USD')
  const [result, setResult] = useState<DiscountPreview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  function updateLine(index: number, changes: Partial<DraftLine>) { setLines((current) => current.map((line, i) => i === index ? { ...line, ...changes } : line)) }
  async function calculate(event: FormEvent) {
    event.preventDefault(); setError(''); setResult(null)
    if (!/^[A-Za-z]{3}$/.test(currency)) return setError('Use a three-letter currency code.')
    if (!lines.length || lines.some((line) => !line.productId || !/^\d+(?:\.\d{1,2})?$/.test(line.amount) || Number(line.quantity) < 1)) return setError('Enter a product, non-negative line amount, and positive quantity for every line.')
    const requestLines: DiscountLineInput[] = lines.map((line) => ({ productId: line.productId, amount: `${line.amount.split('.')[0]}.${(line.amount.split('.')[1] ?? '').padEnd(2, '0')}`, currency: currency.toUpperCase(), quantity: line.quantity }))
    setLoading(true)
    try { setResult(await previewDiscount(rule.id, requestLines)) } catch (reason) { setError(apiMessage(reason)) }
    finally { setLoading(false) }
  }
  return <Overlay title={`Preview · ${rule.name}`} onClose={onClose}><form onSubmit={(event) => void calculate(event)}><div className="space-y-4 px-5 py-5 sm:px-7"><div className="flex items-end gap-3"><label className="block flex-1 text-sm font-medium text-slate-700">Currency<input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 uppercase" /></label><button type="button" onClick={() => setLines((current) => [...current, { productId: products[0]?.id ?? '', amount: '0.00', quantity: 1 }])} className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700">+ Add line</button></div>
    {lines.map((line, index) => <div key={index} className="grid grid-cols-[1fr_100px_76px_36px] gap-2"><label className="min-w-0 text-xs font-medium text-slate-600">Product<select value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })} className="mt-1 h-10 w-full truncate rounded-lg border border-slate-300 bg-white px-2 text-sm">{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Line amount<input inputMode="decimal" value={line.amount} onChange={(event) => updateLine(index, { amount: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><label className="text-xs font-medium text-slate-600">Qty<input type="number" min={1} value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label><button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="mt-5 grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30">×</button></div>)}
    {result && <div className={`rounded-xl border p-4 ${result.eligible ? 'border-indigo-100 bg-indigo-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-sm font-semibold">{reasonLabel(result.reason)}</p><div className="mt-3 space-y-2 text-sm"><Line label="Eligible subtotal" value={money(result.eligibleAmount, result.currency)} /><Line label="Eligible quantity" value={String(result.eligibleQuantity)} /><Line label="Discount" value={money(result.discountAmount, result.currency)} strong />{result.usesRemaining !== null && <Line label="Uses remaining" value={String(result.usesRemaining)} />}</div></div>}{error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}</div><div className="flex gap-3 border-t border-slate-200 px-5 py-4 sm:justify-end sm:px-7"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 sm:flex-none">Close</button><button disabled={loading || products.length === 0} className="min-h-11 flex-1 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none">{loading ? 'Calculating…' : 'Check eligibility'}</button></div></form></Overlay>
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between gap-4 ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}><span>{label}</span><span className="tabular-nums">{value}</span></div> }
function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-indigo-600" />Rule is active</label> }
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"><div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-7"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">Eligibility and amounts are calculated on the server.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div>{children}</section></div> }
