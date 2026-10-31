import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../../lib/api'
import { createStaff, listStaff, type StaffAccount } from './staff-api'

type StaffPageProps = {
  onBack: () => void
}

type StatusFilter = 'all' | 'active' | 'inactive'

function messageFor(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'We could not complete this request. Please try again.'
}

function makeTemporaryPassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*'
  const values = new Uint32Array(14)
  window.crypto.getRandomValues(values)
  const characters = Array.from(values, (value) => alphabet[value % alphabet.length])
  characters[0] = 'B'
  characters[1] = '7'
  characters[2] = '!'
  const shuffle = new Uint32Array(characters.length)
  window.crypto.getRandomValues(shuffle)
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = shuffle[index] % (index + 1)
    const current = characters[index]
    characters[index] = characters[swapIndex]
    characters[swapIndex] = current
  }
  return characters.join('')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

function StaffAvatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700">
      {initials || '?'}
    </span>
  )
}

export default function StaffPage({ onBack }: StaffPageProps) {
  const [staff, setStaff] = useState<StaffAccount[]>([])
  const [totalStaff, setTotalStaff] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [inactiveCount, setInactiveCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [isCreateOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function refreshStaff(searchTerm = query) {
    setLoading(true)
    setError('')
    try {
      const page = await listStaff(undefined, searchTerm)
      setStaff(page.items)
      setNextCursor(page.nextCursor)
      setTotalStaff(page.total)
      setActiveCount(page.activeCount)
      setInactiveCount(page.inactiveCount)
    } catch (requestError) {
      setError(messageFor(requestError))
    } finally {
      setLoading(false)
    }
  }

  async function loadMoreStaff() {
    if (!nextCursor) return
    setLoadingMore(true)
    setError('')
    try {
      const page = await listStaff(nextCursor, query)
      setStaff((current) => {
        const known = new Set(current.map((account) => account.id))
        return [...current, ...page.items.filter((account) => !known.has(account.id))]
      })
      setNextCursor(page.nextCursor)
    } catch (requestError) {
      setError(messageFor(requestError))
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshStaff(query), query.trim() ? 250 : 0)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    if (!isCreateOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setCreateOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isCreateOpen])

  const visibleStaff = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return staff.filter((account) => {
      const matchesQuery = !normalizedQuery || `${account.name} ${account.email}`.toLocaleLowerCase().includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? account.isActive : !account.isActive)
      return matchesQuery && matchesStatus
    })
  }, [staff, query, statusFilter])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const account = await createStaff({ name, email, password })
      setTotalStaff((count) => count + 1)
      setActiveCount((count) => count + 1)
      if (staff.length < 25 && (!query || `${account.name} ${account.email}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) {
        setStaff((current) => [...current, account].sort((a, b) => a.email.localeCompare(b.email)))
      }
      setName('')
      setEmail('')
      setPassword('')
      setShowPassword(false)
      setCreateOpen(false)
      setNotice(`${account.name} now has staff access.`)
    } catch (requestError) {
      setError(messageFor(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#f8f9fc] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <button type="button" onClick={onBack} className="mb-8 flex items-center gap-3 px-2 text-left">
          <span className="grid size-9 place-items-center rounded-lg bg-[#17243b]">
            <span className="size-3.5 rounded-[4px] border-[3px] border-[#8ce2d2]" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Brightloop</span>
            <span className="block text-[11px] text-slate-500">Subscription operations</span>
          </span>
        </button>

        <nav aria-label="Workspace" className="space-y-6">
          <div>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Operations</p>
            <button type="button" onClick={onBack} className="w-full rounded-md px-2.5 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">Overview</button>
            <span className="block rounded-md px-2.5 py-2 text-sm text-slate-400">Customers</span>
            <span className="block rounded-md px-2.5 py-2 text-sm text-slate-400">Subscriptions</span>
            <span className="block rounded-md px-2.5 py-2 text-sm text-slate-400">Invoices</span>
          </div>
          <div>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Settings</p>
            <span className="block rounded-md px-2.5 py-2 text-sm text-slate-400">Products</span>
            <span className="block rounded-md px-2.5 py-2 text-sm text-slate-400">Plans</span>
            <span className="block rounded-md px-2.5 py-2 text-sm text-slate-400">Taxes &amp; discounts</span>
            <span aria-current="page" className="mt-1 flex items-center gap-2 rounded-md border-l-2 border-indigo-600 bg-indigo-50 px-2.5 py-2 text-sm font-semibold text-indigo-700">
              <span aria-hidden="true">◈</span> Team
            </span>
          </div>
        </nav>

        <div className="mt-auto border-t border-slate-100 pt-4">
          <div className="flex items-center gap-3 px-2">
            <span className="grid size-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">AD</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">Administrator</p>
              <p className="text-[11px] text-slate-500">Workspace owner</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-[#17243b]"><span className="size-3 rounded-[3px] border-2 border-[#8ce2d2]" /></span>
          <span className="text-sm font-semibold">Team</span>
        </div>
        <button type="button" onClick={onBack} aria-label="Back to workspace" className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">⌂</button>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8">
        <div className="mb-5 hidden text-xs text-slate-500 lg:block">Settings <span className="mx-1.5 text-slate-300">/</span> <span className="font-medium text-slate-700">Team</span></div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs text-slate-500 lg:hidden">Settings / Team</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">Staff accounts</h1>
            <p className="mt-1.5 text-sm text-slate-600">Manage the people who help run your subscriptions.</p>
          </div>
          <button
            type="button"
            onClick={() => { setError(''); setNotice(''); setCreateOpen(true) }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 sm:w-auto"
          >
            <span aria-hidden="true" className="text-lg leading-none">+</span> Add staff member
          </button>
        </div>

        {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
        {error && !isCreateOpen && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

        <section aria-label="Staff account summary" className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard label="Total staff" value={loading ? '—' : String(totalStaff)} detail="Team members" />
          <MetricCard label="Active" value={loading ? '—' : String(activeCount)} detail="Can sign in" tone="teal" />
          <MetricCard label="Inactive" value={loading ? '—' : String(inactiveCount)} detail="Access disabled" tone="amber" />
          <div className="hidden rounded-lg border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:block">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Access level</p>
            <p className="mt-2 text-base font-semibold text-slate-900">Standard staff</p>
            <p className="mt-1 text-xs text-slate-500">Operational access only</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Team members</h2>
              <p className="mt-0.5 text-xs text-slate-500">{visibleStaff.length} account{visibleStaff.length === 1 ? '' : 's'} shown</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block min-w-0 sm:w-64">
                <span className="sr-only">Search staff by name or email</span>
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 text-slate-400">⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label>
                <span className="sr-only">Filter by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-36">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <div role="status" className="p-8 text-sm text-slate-500">Loading staff accounts…</div>
          ) : error && staff.length === 0 ? (
            <div className="p-8 text-sm text-slate-600">Staff accounts could not be loaded. <button type="button" onClick={() => void refreshStaff()} className="font-semibold text-indigo-700 underline">Try again</button></div>
          ) : visibleStaff.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-full bg-indigo-50 text-lg text-indigo-700">⌕</span>
              <p className="mt-3 text-sm font-semibold text-slate-900">{staff.length ? 'No matching staff accounts' : 'No staff accounts yet'}</p>
              <p className="mt-1 text-sm text-slate-500">{staff.length ? 'Try a different search or status filter.' : 'Add a teammate to give them operational access.'}</p>
              {!staff.length && <button type="button" onClick={() => setCreateOpen(true)} className="mt-4 text-sm font-semibold text-indigo-700 hover:text-indigo-800">Add your first staff member</button>}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-left">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr><th className="px-5 py-3">Staff member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Added</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleStaff.map((account) => (
                      <tr key={account.id} className="transition hover:bg-slate-50/70">
                        <td className="px-5 py-3.5"><div className="flex items-center gap-3"><StaffAvatar name={account.name} /><div><p className="text-sm font-medium text-slate-900">{account.name}</p><p className="mt-0.5 text-xs text-slate-500">{account.email}</p></div></div></td>
                        <td className="px-4 py-3.5"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Staff</span></td>
                        <td className="px-4 py-3.5"><StatusBadge active={account.isActive} /></td>
                        <td className="px-4 py-3.5 text-xs text-slate-600">{formatDate(account.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-slate-100 md:hidden">
                {visibleStaff.map((account) => (
                  <li key={account.id} className="flex items-start gap-3 px-4 py-4">
                    <StaffAvatar name={account.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-slate-900">{account.name}</p><StatusBadge active={account.isActive} /></div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{account.email}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">Staff</span><span>Added {formatDate(account.createdAt)}</span></div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5">
                <span>{query ? `${visibleStaff.length} matches · ` : 'Showing '}{staff.length} loaded of {totalStaff} staff members</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void refreshStaff()} className="rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Refresh</button>
                  {nextCursor && <button disabled={loadingMore} type="button" onClick={() => void loadMoreStaff()} className="rounded-md border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more'}</button>}
                </div>
              </div>
            </>
          )}
        </section>
      </main>

      {isCreateOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-950/40 sm:items-center sm:justify-end" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="create-staff-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-[460px] sm:rounded-none">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 pb-4 pt-3 sm:px-7 sm:pt-7">
              <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Team access</p><h2 id="create-staff-title" className="mt-1 text-xl font-semibold text-slate-950">Add staff member</h2><p className="mt-1 text-sm text-slate-500">Provision sign-in access for a teammate.</p></div>
                <button type="button" aria-label="Close" onClick={() => setCreateOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-md text-lg text-slate-500 hover:bg-slate-100">×</button>
              </div>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-[calc(100%-104px)] flex-col">
              <div className="space-y-4 px-5 py-5 sm:px-7 sm:py-6">
                <label className="block text-sm font-medium text-slate-700" htmlFor="staff-name">Full name
                  <input id="staff-name" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Maya Lin" className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                </label>
                <label className="block text-sm font-medium text-slate-700" htmlFor="staff-email">Work email
                  <input id="staff-email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                </label>
                <div>
                  <div className="flex items-center justify-between gap-2"><label className="text-sm font-medium text-slate-700" htmlFor="staff-password">Temporary password</label><button type="button" onClick={() => setPassword(makeTemporaryPassword())} className="text-xs font-semibold text-indigo-700 hover:text-indigo-800">Generate secure password</button></div>
                  <div className="relative mt-1.5">
                    <input id="staff-password" required type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={9} value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 pr-16 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800">{showPassword ? 'Hide' : 'Show'}</button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">Use at least 9 characters with an uppercase letter, a lowercase letter, and a special character.</p>
                </div>
                <div className="rounded-md border border-indigo-100 bg-indigo-50/70 p-3.5">
                  <p className="text-xs font-semibold text-slate-800">Standard staff access</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">New accounts receive the Staff role. Staff cannot create accounts or change team access and system settings.</p>
                </div>
                {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
              </div>
              <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
                <button type="button" onClick={() => setCreateOpen(false)} className="min-h-11 flex-1 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button disabled={saving} type="submit" className="min-h-11 flex-1 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{saving ? 'Creating…' : 'Create account'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, detail, tone = 'indigo' }: { label: string; value: string; detail: string; tone?: 'indigo' | 'teal' | 'amber' }) {
  const toneClass = tone === 'teal' ? 'bg-teal-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-indigo-500'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3"><p className="text-2xl font-semibold leading-none tracking-tight text-slate-950 tabular-nums">{value}</p><span aria-hidden="true" className={`mb-1 size-2 rounded-full ${toneClass}`} /></div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${active ? 'bg-emerald-600' : 'bg-amber-500'}`} />{active ? 'Active' : 'Inactive'}</span>
}
