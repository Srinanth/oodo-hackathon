import { useEffect, useState, type FormEvent } from 'react'

import { ApiError } from '../../lib/api'
import { QuoteLineEditor, type QuoteLineDraft } from './QuoteLineEditor'
import {
  createQuoteTemplate,
  getQuoteTemplates,
  updateQuoteTemplate,
  type QuoteTemplate,
} from './quoteTemplatesApi'

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function QuoteTemplatesPage({ onBack }: { onBack: () => void }) {
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [editing, setEditing] = useState<QuoteTemplate | null>(null)
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [validityDays, setValidityDays] = useState('14')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [lines, setLines] = useState<QuoteLineDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function startCreate() {
    setEditing(null)
    setName('')
    setValidityDays('14')
    setPaymentTerms('')
    setLines([])
    setError(null)
    setNotice(null)
  }

  function startEdit(template: QuoteTemplate) {
    setEditing(template)
    setName(template.name)
    setValidityDays(String(template.validityDays))
    setPaymentTerms(template.paymentTerms)
    setLines(template.lines.map((line) => ({ planId: line.planId, productId: line.productId, variantId: line.variantId, description: line.description, quantity: line.quantity, taxRuleIds: line.taxRuleIds.map(String) })))
    setError(null)
    setNotice(null)
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    getQuoteTemplates(search, cursor, controller.signal)
      .then((page) => {
        setTemplates(page.items)
        setNextCursor(page.nextCursor)
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(errorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [search, cursor])

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const input = {
        name: name.trim(),
        validityDays: Number(validityDays),
        paymentTerms: paymentTerms.trim(),
        lines,
      }
      if (editing) {
        await updateQuoteTemplate(editing.id, input)
        setNotice('Quotation template updated.')
      } else {
        await createQuoteTemplate(input)
        setNotice('Quotation template created.')
      }
      setEditing(null)
      setName('')
      setValidityDays('14')
      setPaymentTerms('')
      setLines([])
      setCursor(null)
      const page = await getQuoteTemplates(search, null)
      setTemplates(page.items)
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
          <button type="button" onClick={onBack} className="mb-4 text-sm font-semibold text-indigo-700 hover:text-indigo-900">← Workspace</button>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Brightloop · Sales</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Quotation templates</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Set reusable offer terms, validity periods, and default priced lines.
          </p>
        </header>

        {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-semibold">Template library</h2>
                <p className="mt-1 text-xs text-slate-500">Reusable validity and payment terms</p>
              </div>
              <label className="block w-full sm:w-72">
                <span className="sr-only">Search templates</span>
                <input
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setCursor(null) }}
                  placeholder="Search templates…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            <div className="divide-y divide-slate-100">
              {loading ? (
                <p className="px-6 py-12 text-center text-sm text-slate-500">Loading templates…</p>
              ) : templates.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <p className="font-medium text-slate-700">No templates found</p>
                  <p className="mt-1 text-sm text-slate-500">Create a template to reuse quote terms.</p>
                </div>
              ) : templates.map((template) => (
                <article key={template.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                  <div>
                    <h3 className="font-medium text-slate-900">{template.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{template.paymentTerms || 'No payment terms'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-indigo-50 px-3 py-2 text-right">
                      <p className="text-lg font-semibold text-indigo-700">{template.validityDays}</p>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-500">validity days</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(template)}
                      className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      Edit
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 sm:px-6">
              <span className="text-xs text-slate-500">Templates are reusable starting points for quotes</span>
              <button
                type="button"
                disabled={!nextCursor || loading}
                onClick={() => setCursor(nextCursor)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next page →
              </button>
            </footer>
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">{editing ? 'Template details' : 'New template'}</p>
                <h2 className="mt-1 text-lg font-semibold">{editing ? 'Edit template' : 'Reusable quote terms'}</h2>
              </div>
              {editing && (
                <button type="button" onClick={startCreate} className="text-xs font-medium text-slate-500 hover:text-slate-900">
                  Clear
                </button>
              )}
            </div>
            <form onSubmit={saveTemplate} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Template name <span className="text-rose-500">*</span></span>
                <input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="Standard annual offer" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Valid for</span>
                <div className="flex items-center gap-2">
                  <input required type="number" min={1} value={validityDays} onChange={(event) => setValidityDays(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                  <span className="text-sm text-slate-500">days</span>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Payment terms</span>
                <textarea maxLength={200} rows={3} value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} placeholder="Net 30" className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <QuoteLineEditor lines={lines} currency="USD" onChange={setLines} />
              <button disabled={saving} type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create template'}
              </button>
            </form>
          </aside>
        </div>
      </div>
    </main>
  )
}

export default QuoteTemplatesPage
