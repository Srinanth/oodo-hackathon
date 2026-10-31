import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../lib/api'
import {
  createProduct,
  createVariant,
  listProducts,
  updateProduct,
  updateVariant,
  type Product,
  type ProductInput,
  type ProductVariant,
} from './catalog-api'

type CatalogPageProps = { isAdmin: boolean; onBack: () => void }

function apiMessage(error: unknown) {
  if (error instanceof ApiError) {
    const fields = error.body?.error?.fieldErrors
    if (fields && Object.keys(fields).length) return Object.values(fields).join(' ')
    return error.message
  }
  return 'We could not complete this request. Please try again.'
}

function toMinorUnits(amount: string): bigint {
  const negative = amount.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? amount.slice(1) : amount).split('.')
  const minor = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2) || '0')
  return negative ? -minor : minor
}

function fromMinorUnits(amount: bigint) {
  const sign = amount < 0n ? '-' : ''
  const absolute = amount < 0n ? -amount : amount
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

function moneyLabel(money: { amount: string; currency: string }) {
  try {
    const negative = money.amount.startsWith('-')
    const [whole = '0', fraction = ''] = (negative ? money.amount.slice(1) : money.amount).split('.')
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: money.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(negative ? -0 : 0)
    let insertedWhole = false
    return parts.map((part) => {
      if (part.type === 'integer') {
        if (insertedWhole) return ''
        insertedWhole = true
        return BigInt(whole || '0').toLocaleString()
      }
      if (part.type === 'fraction') return fraction.padEnd(2, '0').slice(0, 2)
      return part.value
    }).join('')
  } catch {
    return `${money.currency} ${money.amount}`
  }
}

function variantPrice(product: Product, variant: ProductVariant) {
  return moneyLabel({
    amount: fromMinorUnits(toMinorUnits(product.salesPrice.amount) + toMinorUnits(variant.priceAdjustment.amount)),
    currency: product.salesPrice.currency,
  })
}

function ProductAvatar({ name }: { name: string }) {
  return <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-sm font-semibold text-indigo-700">{name.trim().slice(0, 1).toUpperCase() || 'P'}</span>
}

export default function CatalogPage({ isAdmin, onBack }: CatalogPageProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [editorProduct, setEditorProduct] = useState<Product | null | undefined>(undefined)
  const [variantProduct, setVariantProduct] = useState<Product | null>(null)
  const [editingVariant, setEditingVariant] = useState<{ product: Product; variant: ProductVariant } | null>(null)

  async function load(searchTerm = search, cursor?: string, append = false) {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const page = await listProducts(searchTerm, cursor)
      setProducts((current) => append ? [...current, ...page.items] : page.items)
      setNextCursor(page.nextCursor)
    } catch (requestError) {
      setError(apiMessage(requestError))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => { void load('') }, [])

  const visibleProducts = products.filter((product) => {
    if (activeFilter === 'active') return product.isActive
    if (activeFilter === 'inactive') return !product.isActive
    return true
  })

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
    await load(searchInput.trim())
  }

  async function saveProduct(input: ProductInput, product: Product | null) {
    setSaving(true)
    setError('')
    try {
      const saved = product ? await updateProduct(product.id, input) : await createProduct(input)
      setProducts((current) => {
        const updated = product ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]
        return updated.sort((left, right) => left.name.localeCompare(right.name))
      })
      setEditorProduct(undefined)
      setNotice(product ? `${saved.name} was updated.` : `${saved.name} was added to the catalog.`)
    } catch (requestError) {
      setError(apiMessage(requestError))
      throw requestError
    } finally {
      setSaving(false)
    }
  }

  async function saveVariant(product: Product, input: { name: string; priceAdjustment: { amount: string; currency: string }; isActive?: boolean }, variant?: ProductVariant) {
    setSaving(true)
    setError('')
    try {
      const savedVariant = variant
        ? await updateVariant(product.id, variant.id, input)
        : await createVariant(product.id, input)
      setProducts((current) => current.map((item) => item.id === product.id ? {
        ...item,
        variants: (variant
          ? item.variants.map((entry) => entry.id === savedVariant.id ? savedVariant : entry)
          : [...item.variants, savedVariant]
        ).sort((a, b) => a.name.localeCompare(b.name)),
      } : item))
      setVariantProduct(null)
      setEditingVariant(null)
      setNotice(variant ? `${savedVariant.name} was updated.` : `${savedVariant.name} was added to ${product.name}.`)
    } catch (requestError) {
      setError(apiMessage(requestError))
      throw requestError
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#f8f9fc] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <button type="button" onClick={onBack} className="mb-8 flex items-center gap-3 px-2 text-left">
          <span className="grid size-9 place-items-center rounded-lg bg-[#17243b]"><span className="size-3.5 rounded-[4px] border-[3px] border-[#8ce2d2]" /></span>
          <span><span className="block text-sm font-semibold">Brightloop</span><span className="block text-[11px] text-slate-500">Subscription operations</span></span>
        </button>
        <nav aria-label="Workspace" className="space-y-6">
          <div><p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Operations</p><button type="button" onClick={onBack} className="w-full rounded-md px-2.5 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">Overview</button><span className="block px-2.5 py-2 text-sm text-slate-400">Customers</span><span className="block px-2.5 py-2 text-sm text-slate-400">Subscriptions</span><span className="block px-2.5 py-2 text-sm text-slate-400">Invoices</span></div>
          <div><p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Settings</p><span aria-current="page" className="flex items-center gap-2 rounded-md border-l-2 border-indigo-600 bg-indigo-50 px-2.5 py-2 text-sm font-semibold text-indigo-700"><span aria-hidden="true">◈</span> Products</span><span className="block px-2.5 py-2 text-sm text-slate-400">Plans</span><span className="block px-2.5 py-2 text-sm text-slate-400">Taxes &amp; discounts</span></div>
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-4"><div className="flex items-center gap-3 px-2"><span className="grid size-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{isAdmin ? 'AD' : 'ST'}</span><div><p className="text-xs font-semibold">{isAdmin ? 'Administrator' : 'Staff member'}</p><p className="text-[11px] text-slate-500">{isAdmin ? 'Workspace owner' : 'Operational access'}</p></div></div></div>
      </aside>

      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-[#17243b]"><span className="size-3 rounded-[3px] border-2 border-[#8ce2d2]" /></span><span className="text-sm font-semibold">Products</span></div>
        <button type="button" onClick={onBack} aria-label="Back to workspace" className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">⌂</button>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8">
        <div className="mb-5 hidden text-xs text-slate-500 lg:block">Settings <span className="mx-1.5 text-slate-300">/</span> <span className="font-medium text-slate-700">Products</span></div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-1 text-xs text-slate-500 lg:hidden">Settings / Products</p><h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">Product catalog</h1><p className="mt-1.5 text-sm text-slate-600">Manage products, pricing, and configurable variants.</p></div>
          {isAdmin && <button type="button" onClick={() => { setError(''); setEditorProduct(null) }} className="min-h-11 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 sm:w-auto"><span className="mr-1 text-lg leading-none">+</span> Add product</button>}
        </div>
        {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
        {error && !editorProduct && !variantProduct && !editingVariant && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div><h2 className="text-sm font-semibold text-slate-900">Products</h2><p className="mt-0.5 text-xs text-slate-500">{visibleProducts.length} shown on this page</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <form onSubmit={(event) => void submitSearch(event)} className="flex gap-2">
                <label className="relative block min-w-0 sm:w-64"><span className="sr-only">Search products</span><span aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 text-slate-400">⌕</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search products" className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
                <button type="submit" className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Search</button>
              </form>
              <label><span className="sr-only">Filter product status</span><select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as typeof activeFilter)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-36"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            </div>
          </div>
          {loading ? <div role="status" className="p-8 text-sm text-slate-500">Loading catalog…</div> : error && products.length === 0 ? <div className="p-8 text-sm text-slate-600">Products could not be loaded. <button type="button" onClick={() => void load(search)} className="font-semibold text-indigo-700 underline">Try again</button></div> : visibleProducts.length === 0 ? <div className="px-5 py-12 text-center"><span aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-full bg-indigo-50 text-lg text-indigo-700">◈</span><p className="mt-3 text-sm font-semibold text-slate-900">{products.length ? 'No matching products' : 'Your catalog is empty'}</p><p className="mt-1 text-sm text-slate-500">{products.length ? 'Try another search or status filter.' : 'Add the first product to start configuring subscriptions.'}</p>{isAdmin && !products.length && <button type="button" onClick={() => setEditorProduct(null)} className="mt-4 text-sm font-semibold text-indigo-700">Add your first product</button>}</div> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[800px] text-left"><thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-3">Product</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Sales price</th><th className="px-4 py-3">Cost price</th><th className="px-4 py-3">Variants</th><th className="px-4 py-3">Status</th>{isAdmin && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-slate-100">{visibleProducts.map((product) => <tr key={product.id} className="transition hover:bg-slate-50/70"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><ProductAvatar name={product.name} /><div><p className="text-sm font-medium text-slate-900">{product.name}</p><p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{product.notes || 'No notes'}</p></div></div></td><td className="px-4 py-3.5 text-sm capitalize text-slate-600">{product.type}</td><td className="px-4 py-3.5 text-sm font-medium tabular-nums text-slate-800">{moneyLabel(product.salesPrice)}</td><td className="px-4 py-3.5 text-sm tabular-nums text-slate-600">{moneyLabel(product.costPrice)}</td><td className="px-4 py-3.5 text-sm text-slate-600">{product.variants.length ? <details><summary className="cursor-pointer list-none font-medium text-indigo-700">{product.variants.length} options <span aria-hidden="true" className="text-[10px] text-slate-400">▾</span></summary><ul className="mt-2 space-y-1.5">{product.variants.map((variant) => <li key={variant.id} className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-700">{variant.name}{!variant.isActive && <span className="ml-1 text-slate-400">(inactive)</span>}</span><span className="whitespace-nowrap tabular-nums text-slate-500">{variantPrice(product, variant)}</span>{isAdmin && <button type="button" onClick={() => setEditingVariant({ product, variant })} className="font-semibold text-indigo-700">Edit</button>}</li>)}</ul></details> : <span className="text-slate-400">—</span>}</td><td className="px-4 py-3.5"><StatusBadge active={product.isActive} /></td>{isAdmin && <td className="px-4 py-3.5"><div className="flex justify-end gap-2"><button type="button" onClick={() => setVariantProduct(product)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">Add variant</button><button type="button" onClick={() => setEditorProduct(product)} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Edit</button></div></td>}</tr>)}</tbody></table></div>
            <ul className="divide-y divide-slate-100 md:hidden">{visibleProducts.map((product) => <li key={product.id} className="px-4 py-4"><div className="flex items-start gap-3"><ProductAvatar name={product.name} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-900">{product.name}</p><StatusBadge active={product.isActive} /></div><p className="mt-0.5 text-xs capitalize text-slate-500">{product.type} · {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}</p><div className="mt-3 grid grid-cols-2 gap-3"><MoneyStat label="Sales price" value={moneyLabel(product.salesPrice)} /><MoneyStat label="Cost price" value={moneyLabel(product.costPrice)} /></div>{product.notes && <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{product.notes}</p>}{product.variants.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{product.variants.map((variant) => <div key={variant.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-600">{variant.name}</span><span className="shrink-0 font-medium tabular-nums text-slate-800">{variantPrice(product, variant)}</span>{isAdmin && <button type="button" onClick={() => setEditingVariant({ product, variant })} className="font-semibold text-indigo-700">Edit</button>}</div>)}</div>}{isAdmin && <div className="mt-3 flex gap-2"><button type="button" onClick={() => setVariantProduct(product)} className="min-h-9 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700">Add variant</button><button type="button" onClick={() => setEditorProduct(product)} className="min-h-9 rounded-md px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Edit</button></div>}</div></div></li>)}</ul>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5"><span>{search ? `Search: ${search}` : 'Catalog results'} · {visibleProducts.length} shown</span>{nextCursor && <button disabled={loadingMore} type="button" onClick={() => void load(search, nextCursor, true)} className="rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more'}</button>}</div>
          </>}
        </section>
      </main>

      {editorProduct !== undefined && <ProductEditor product={editorProduct} saving={saving} error={error} onClose={() => { setEditorProduct(undefined); setError('') }} onSave={saveProduct} />}
      {variantProduct && <VariantEditor product={variantProduct} saving={saving} error={error} onClose={() => { setVariantProduct(null); setError('') }} onSave={saveVariant} />}
      {editingVariant && <VariantEditor product={editingVariant.product} variant={editingVariant.variant} saving={saving} error={error} onClose={() => { setEditingVariant(null); setError('') }} onSave={saveVariant} />}
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${active ? 'bg-emerald-600' : 'bg-slate-400'}`} />{active ? 'Active' : 'Inactive'}</span>
}

function MoneyStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">{value}</p></div>
}

function Overlay({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-950/40 sm:items-center sm:justify-end" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-[460px] sm:rounded-none"><div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 pb-4 pt-3 sm:px-7 sm:pt-7"><div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 sm:hidden" /><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Product catalog</p><h2 id="catalog-dialog-title" className="mt-1 text-xl font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div><button type="button" aria-label="Close" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-md text-lg text-slate-500 hover:bg-slate-100">×</button></div></div>{children}</section></div>
}

function ProductEditor({ product, saving, error, onClose, onSave }: { product: Product | null; saving: boolean; error: string; onClose: () => void; onSave: (input: ProductInput, product: Product | null) => Promise<void> }) {
  const [name, setName] = useState(product?.name ?? '')
  const [type, setType] = useState(product?.type ?? 'service')
  const [salesPrice, setSalesPrice] = useState(product?.salesPrice.amount ?? '')
  const [costPrice, setCostPrice] = useState(product?.costPrice.amount ?? '0.00')
  const [currency, setCurrency] = useState(product?.salesPrice.currency ?? 'USD')
  const [notes, setNotes] = useState(product?.notes ?? '')
  const [isActive, setIsActive] = useState(product?.isActive ?? true)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await onSave({ name, type, salesPrice: { amount: salesPrice, currency }, costPrice: { amount: costPrice, currency }, notes, isActive }, product)
    } catch { /* Parent renders the API error in this dialog. */ }
  }
  return <Overlay title={product ? 'Edit product' : 'Add product'} description="Set its type, pricing, and catalog details." onClose={onClose}><form onSubmit={(event) => void submit(event)} className="flex min-h-[calc(100%-104px)] flex-col"><div className="space-y-4 px-5 py-5 sm:px-7 sm:py-6"><label className="block text-sm font-medium text-slate-700">Product name<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Business Suite" className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium text-slate-700">Type<select value={type} onChange={(event) => setType(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"><option value="service">Service</option><option value="product">Product</option></select></label><label className="block text-sm font-medium text-slate-700">Currency<select disabled={Boolean(product)} value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none disabled:bg-slate-50 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"><option>USD</option><option>INR</option><option>EUR</option><option>GBP</option></select></label></div><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium text-slate-700">Sales price<input required type="number" min="0" step="0.01" value={salesPrice} onChange={(event) => setSalesPrice(event.target.value)} placeholder="0.00" className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><label className="block text-sm font-medium text-slate-700">Cost price<input required type="number" min="0" step="0.01" value={costPrice} onChange={(event) => setCostPrice(event.target.value)} placeholder="0.00" className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label></div><label className="block text-sm font-medium text-slate-700">Notes <span className="font-normal text-slate-400">(optional)</span><textarea maxLength={5000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Internal details for your team" className="mt-1.5 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>{product && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="size-4 accent-indigo-600" /> Product is active</label>}{error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}</div><div className="sticky bottom-0 mt-auto flex gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button disabled={saving} type="submit" className="min-h-11 flex-1 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Saving…' : product ? 'Save changes' : 'Create product'}</button></div></form></Overlay>
}

function VariantEditor({ product, variant, saving, error, onClose, onSave }: { product: Product; variant?: ProductVariant; saving: boolean; error: string; onClose: () => void; onSave: (product: Product, input: { name: string; priceAdjustment: { amount: string; currency: string }; isActive?: boolean }, variant?: ProductVariant) => Promise<void> }) {
  const [name, setName] = useState(variant?.name ?? '')
  const [adjustment, setAdjustment] = useState(variant?.priceAdjustment.amount ?? '0.00')
  const [isActive, setIsActive] = useState(variant?.isActive ?? true)
  const adjustmentMinor = /^-?\d+(\.\d{0,2})?$/.test(adjustment) ? toMinorUnits(adjustment) : 0n
  const previewMinor = toMinorUnits(product.salesPrice.amount) + adjustmentMinor
  const preview = fromMinorUnits(previewMinor)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { await onSave(product, { name, priceAdjustment: { amount: adjustment, currency: product.salesPrice.currency }, ...(variant ? { isActive } : {}) }, variant) } catch { /* Parent renders the API error in this dialog. */ }
  }
  return <Overlay title={variant ? 'Edit variant' : 'Add variant'} description={`${variant ? 'Update the option for' : 'Configure an option for'} ${product.name}.`} onClose={onClose}><form onSubmit={(event) => void submit(event)} className="flex min-h-[calc(100%-104px)] flex-col"><div className="space-y-4 px-5 py-5 sm:px-7 sm:py-6"><label className="block text-sm font-medium text-slate-700">Variant name<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Odoo brand" className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><label className="block text-sm font-medium text-slate-700">Price adjustment ({product.salesPrice.currency})<input required type="number" step="0.01" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /><span className="mt-1 block text-xs font-normal text-slate-500">Use a positive amount to increase price or a negative amount to discount this option.</span></label><div className="rounded-md border border-indigo-100 bg-indigo-50/70 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Updated price preview</p><div className="mt-3 flex items-center justify-between text-sm text-slate-600"><span>Base sales price</span><span className="tabular-nums">{moneyLabel(product.salesPrice)}</span></div><div className="mt-2 flex items-center justify-between text-sm text-slate-600"><span>Variant adjustment</span><span className="tabular-nums">{moneyLabel({ amount: adjustment || '0.00', currency: product.salesPrice.currency })}</span></div><div className="mt-3 border-t border-indigo-200 pt-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-800">Effective price</span><span className={`text-lg font-semibold tabular-nums ${previewMinor < 0n ? 'text-rose-700' : 'text-indigo-800'}`}>{moneyLabel({ amount: preview, currency: product.salesPrice.currency })}</span></div>{previewMinor < 0n && <p role="alert" className="mt-2 text-xs text-rose-700">The adjustment makes the resulting price negative. Review it before saving.</p>}</div></div>{variant && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="size-4 accent-indigo-600" /> Variant is active</label>}{error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}</div><div className="sticky bottom-0 mt-auto flex gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button disabled={saving || previewMinor < 0n} type="submit" className="min-h-11 flex-1 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Saving…' : variant ? 'Save changes' : 'Create variant'}</button></div></form></Overlay>
}
