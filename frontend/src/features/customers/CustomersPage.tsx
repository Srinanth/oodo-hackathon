import { useEffect, useState, type FormEvent } from 'react'

import { ApiError } from '../../lib/api'
import {
  createCustomer,
  getCustomers,
  updateCustomer,
  type Customer,
  type CustomerInput,
} from './customersApi'

type CustomerForm = {
  accountUserEmail: string
  companyName: string
  contactName: string
  email: string
  phone: string
  billingAddress: string
}

const emptyForm: CustomerForm = {
  accountUserEmail: '',
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  billingAddress: '',
}

function customerToForm(customer: Customer): CustomerForm {
  return {
    accountUserEmail: customer.accountUserEmail ?? '',
    companyName: customer.companyName,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone,
    billingAddress: customer.billingAddress,
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    getCustomers(search, cursor, controller.signal)
      .then((page) => {
        setCustomers(page.items)
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

  function startCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setNotice(null)
  }

  function startEdit(customer: Customer) {
    setEditing(customer)
    setForm(customerToForm(customer))
    setError(null)
    setNotice(null)
  }

  function setField(field: keyof CustomerForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    const customerInput: CustomerInput = {
      accountUserEmail: form.accountUserEmail.trim() || null,
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      billingAddress: form.billingAddress.trim(),
    }

    try {
      if (editing) {
        await updateCustomer(editing.id, customerInput)
        setNotice('Customer details updated.')
      } else {
        await createCustomer(customerInput)
        setNotice('Customer added.')
        setCursor(null)
      }
      setEditing(null)
      setForm(emptyForm)
      const page = await getCustomers(search, null)
      setCustomers(page.items)
      setNextCursor(page.nextCursor)
      setCursor(null)
    } catch (saveError: unknown) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const visibleRange = customers.length ? `Showing ${customers.length} customers` : 'No customers on this page'

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
              Brightloop · Operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Customers</h1>
            <p className="mt-2 text-sm text-slate-500">
              Keep customer details and portal account links in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Add customer
          </button>
        </header>

        {notice && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-semibold">Customer directory</h2>
                <p className="mt-1 text-xs text-slate-500">{visibleRange}</p>
              </div>
              <label className="relative block w-full sm:w-72">
                <span className="sr-only">Search customers</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400">
                  <circle cx="8.75" cy="8.75" r="5.75" stroke="currentColor" strokeWidth="1.5" />
                  <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setCursor(null)
                  }}
                  placeholder="Search name, email, company…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">Customer</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Email</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Phone</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Portal</th>
                    <th scope="col" className="px-6 py-3 text-right font-semibold">Added</th>
                    <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Loading customers…</td></tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-14 text-center">
                        <p className="font-medium text-slate-700">No customers found</p>
                        <p className="mt-1 text-sm text-slate-500">Add a customer or try another search.</p>
                      </td>
                    </tr>
                  ) : customers.map((customer) => (
                    <tr key={customer.id} className="transition hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{customer.contactName}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{customer.companyName || 'Individual'}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{customer.email}</td>
                      <td className="px-6 py-4 text-slate-600">{customer.phone || '—'}</td>
                      <td className="px-6 py-4">
                        {customer.accountUserEmail ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <span className="size-1.5 rounded-full bg-emerald-500" /> Linked
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Not linked</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-500">{formatDate(customer.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(customer)}
                          className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 sm:px-6">
              <span className="text-xs text-slate-500">Search across contact, company, email, or phone</span>
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
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">
                  {editing ? 'Customer profile' : 'New record'}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{editing ? 'Edit customer' : 'Add a customer'}</h2>
              </div>
              {editing && (
                <button type="button" onClick={startCreate} className="text-xs font-medium text-slate-500 hover:text-slate-900">
                  Clear
                </button>
              )}
            </div>

            <form onSubmit={saveCustomer} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Contact name <span className="text-rose-500">*</span></span>
                <input required maxLength={200} value={form.contactName} onChange={(event) => setField('contactName', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Company</span>
                <input maxLength={200} value={form.companyName} onChange={(event) => setField('companyName', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Email <span className="text-rose-500">*</span></span>
                <input required type="email" maxLength={254} value={form.email} onChange={(event) => setField('email', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Phone</span>
                <input maxLength={40} value={form.phone} onChange={(event) => setField('phone', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Billing address</span>
                <textarea rows={3} value={form.billingAddress} onChange={(event) => setField('billingAddress', event.target.value)} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Portal account email</span>
                <input type="email" maxLength={254} value={form.accountUserEmail} onChange={(event) => setField('accountUserEmail', event.target.value)} placeholder="Link an existing customer login" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                <span className="mt-1.5 block text-xs leading-5 text-slate-500">Link by the customer account’s email. One account can belong to one customer.</span>
              </label>
              <div className="flex gap-2 pt-1">
                <button disabled={saving} type="submit" className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create customer'}
                </button>
                {editing && <button type="button" onClick={startCreate} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>}
              </div>
            </form>
          </aside>
        </div>
      </div>
    </main>
  )
}

export default CustomersPage
