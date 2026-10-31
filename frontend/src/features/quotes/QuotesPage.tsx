import { useEffect, useState, type FormEvent } from 'react'

import { ApiError } from '../../lib/api'
import { getCustomers, type Customer } from '../customers/customersApi'
import { getQuoteTemplates, type QuoteTemplate } from './quoteTemplatesApi'
import { createQuote, getQuotes, updateQuote, type Quote, type QuoteInput } from './quotesApi'

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function dateAfterDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [editing, setEditing] = useState<Quote | null>(null)
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [validUntil, setValidUntil] = useState(dateAfterDays(14))
  const [paymentTerms, setPaymentTerms] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getCustomers('', null, controller.signal),
      getQuoteTemplates('', null, controller.signal),
    ]).then(([customerPage, templatePage]) => {
      setCustomers(customerPage.items)
      setTemplates(templatePage.items)
    }).catch((loadError: unknown) => {
      if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) setError(errorMessage(loadError))
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    getQuotes(search, cursor, controller.signal)
      .then((page) => { setQuotes(page.items); setNextCursor(page.nextCursor) })
      .catch((loadError: unknown) => {
        if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) setError(errorMessage(loadError))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [search, cursor])

  function resetForm() {
    setEditing(null)
    setCustomerId('')
    setTemplateId('')
    setValidUntil(dateAfterDays(14))
    setPaymentTerms('')
    setCurrency('USD')
    setError(null)
    setNotice(null)
  }

  function editQuote(quote: Quote) {
    setEditing(quote)
    setCustomerId(quote.customerId)
    setTemplateId(quote.templateId ?? '')
    setValidUntil(quote.validUntil)
    setPaymentTerms(quote.paymentTerms)
    setCurrency(quote.currency)
    setError(null)
    setNotice(null)
  }

  function selectTemplate(id: string) {
    setTemplateId(id)
    const template = templates.find((item) => item.id === id)
    if (template) {
      setPaymentTerms(template.paymentTerms)
      setValidUntil(dateAfterDays(template.validityDays))
    }
  }

  async function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    const input: QuoteInput = { customerId, templateId: templateId || null, validUntil, paymentTerms: paymentTerms.trim(), currency: currency.trim().toUpperCase() }
    try {
      let successMessage: string
      if (editing) {
        await updateQuote(editing.id, input)
        successMessage = `${editing.number} updated.`
      } else {
        const created = await createQuote(input)
        successMessage = `${created.number} created as a draft.`
      }
      resetForm()
      setNotice(successMessage)
      setCursor(null)
      const page = await getQuotes(search, null)
      setQuotes(page.items)
      setNextCursor(page.nextCursor)
    } catch (saveError: unknown) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Brightloop · Sales</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Draft quotes</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Create a quote header from a customer and reusable terms. Product lines and pricing become available after catalog integration.</p>
        </header>

        {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div><h2 className="font-semibold">Quote drafts</h2><p className="mt-1 text-xs text-slate-500">Draft totals remain zero until priced lines are added</p></div>
              <input aria-label="Search quotes" value={search} onChange={(event) => { setSearch(event.target.value); setCursor(null) }} placeholder="Search quotes or customers…" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 sm:w-72" />
            </div>
            <div className="divide-y divide-slate-100">
              {loading ? <p className="px-6 py-12 text-center text-sm text-slate-500">Loading quotes…</p> : quotes.length === 0 ? (
                <div className="px-6 py-14 text-center"><p className="font-medium text-slate-700">No quote drafts found</p><p className="mt-1 text-sm text-slate-500">Choose a customer to create the first draft.</p></div>
              ) : quotes.map((quote) => (
                <article key={quote.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                  <div><div className="flex items-center gap-2"><h3 className="font-medium text-slate-900">{quote.number}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600">{quote.status}</span></div><p className="mt-1 text-sm text-slate-600">{quote.customerName}{quote.templateName ? ` · ${quote.templateName}` : ''}</p><p className="mt-1 text-xs text-slate-500">Valid until {quote.validUntil} · {quote.paymentTerms || 'No payment terms'}</p></div>
                  {quote.status === 'draft' && <button type="button" onClick={() => editQuote(quote)} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Edit draft</button>}
                </article>
              ))}
            </div>
            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 sm:px-6"><span className="text-xs text-slate-500">Quote numbering and customer association are managed by the API</span><button type="button" disabled={!nextCursor || loading} onClick={() => setCursor(nextCursor)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next page →</button></footer>
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">{editing ? 'Draft details' : 'New quote'}</p><h2 className="mt-1 text-lg font-semibold">{editing ? `Edit ${editing.number}` : 'Quote header'}</h2></div>{editing && <button type="button" onClick={resetForm} className="text-xs font-medium text-slate-500 hover:text-slate-900">Clear</button>}</div>
            <form onSubmit={saveQuote} className="mt-5 space-y-4">
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Customer <span className="text-rose-500">*</span></span><select required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="">Select a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName || customer.contactName} · {customer.email}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Template</span><select value={templateId} onChange={(event) => selectTemplate(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="">No template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Valid until <span className="text-rose-500">*</span></span><input required type="date" min={dateAfterDays(0)} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
              <div className="grid grid-cols-[1fr_100px] gap-3"><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Payment terms</span><input maxLength={200} value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} placeholder="Net 30" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Currency</span><input required maxLength={3} minLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label></div>
              <button disabled={saving || customers.length === 0} type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : editing ? 'Save draft' : 'Create draft'}</button>
            </form>
          </aside>
        </div>
      </div>
    </main>
  )
}

export default QuotesPage
