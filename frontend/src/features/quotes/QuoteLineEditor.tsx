import { useEffect, useState } from 'react'

import { listProducts, type Product } from '../catalog/catalog-api'
import { listPlans, type Plan } from '../plans/plans-api'
import { listTaxRules, type TaxRule } from '../tax/tax-api'

export type QuoteLineDraft = {
  planId: string | null
  productId: string | null
  variantId: string | null
  description: string
  quantity: string
  taxRuleIds: string[]
}

type Props = {
  lines: QuoteLineDraft[]
  currency: string
  onChange: (lines: QuoteLineDraft[]) => void
}

export function QuoteLineEditor({ lines, currency, onChange }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [taxRules, setTaxRules] = useState<TaxRule[]>([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([listProducts(), listPlans(), listTaxRules()])
      .then(([productPage, planPage, taxPage]) => {
        if (!active) return
        setProducts(productPage.items.filter((product) => product.isActive))
        setPlans(planPage.items.filter((plan) => plan.isActive))
        setTaxRules(taxPage.items.filter((rule) => rule.isActive))
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load catalog pricing.')
      })
    return () => { active = false }
  }, [])

  function update(index: number, change: Partial<QuoteLineDraft>) {
    onChange(lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...change } : line))
  }

  function addLine() {
    onChange([...lines, { planId: null, productId: null, variantId: null, description: '', quantity: '1', taxRuleIds: [] }])
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-slate-900">Offer lines</h3><p className="text-xs text-slate-500">Server pricing and tax rules are used to calculate the quote.</p></div>
        <button type="button" onClick={addLine} className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Add line</button>
      </div>
      {loadError && <p role="alert" className="mb-3 text-xs text-rose-700">{loadError}</p>}
      {lines.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">Add at least one line before sending a quote.</p>}
      <div className="space-y-3">
        {lines.map((line, index) => {
          const product = products.find((item) => item.id === line.productId)
          const plan = plans.find((item) => item.id === line.planId)
          const variants = product?.variants.filter((variant) => variant.isActive) ?? []
          return (
            <div key={`line-${index}`} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">Plan<select value={line.planId ?? ''} onChange={(event) => update(index, { planId: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option value="">No plan</option>{plans.filter((item) => item.price.currency === currency.toUpperCase()).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.price.currency} {item.price.amount} / {item.interval}</option>)}</select></label>
              <label className="text-xs font-medium text-slate-600">Product<select value={line.productId ?? ''} onChange={(event) => update(index, { productId: event.target.value || null, variantId: null })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option value="">No product</option>{products.filter((item) => item.salesPrice.currency === currency.toUpperCase()).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.salesPrice.currency} {item.salesPrice.amount}</option>)}</select></label>
              {variants.length > 0 && <label className="text-xs font-medium text-slate-600">Variant<select value={line.variantId ?? ''} onChange={(event) => update(index, { variantId: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option value="">Base product</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} ({variant.priceAdjustment.amount} adjustment)</option>)}</select></label>}
              <label className="text-xs font-medium text-slate-600">Quantity<input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">Description<input maxLength={500} value={line.description} onChange={(event) => update(index, { description: event.target.value })} placeholder={product?.name || plan?.name || 'Line description'} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm" /></label>
              <fieldset className="sm:col-span-2"><legend className="text-xs font-medium text-slate-600">Tax rules</legend><div className="mt-2 flex flex-wrap gap-2">{taxRules.filter((rule) => (!rule.activeFrom || rule.activeFrom <= new Date().toISOString().slice(0, 10)) && (!rule.activeUntil || rule.activeUntil >= new Date().toISOString().slice(0, 10))).map((rule) => <label key={rule.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"><input type="checkbox" checked={line.taxRuleIds.includes(rule.id)} onChange={(event) => update(index, { taxRuleIds: event.target.checked ? [...line.taxRuleIds, rule.id] : line.taxRuleIds.filter((id) => id !== rule.id) })} />{rule.name} ({rule.ratePercent}%)</label>)}</div></fieldset>
              <div className="sm:col-span-2 flex justify-end"><button type="button" onClick={() => onChange(lines.filter((_, lineIndex) => lineIndex !== index))} className="text-xs font-semibold text-rose-700 hover:underline">Remove line</button></div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
