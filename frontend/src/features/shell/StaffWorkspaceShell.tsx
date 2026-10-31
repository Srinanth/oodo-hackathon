import type { ReactNode } from 'react'

type Props = {
  pathname: string
  role: string
  name: string
  onNavigate: (path: string) => void
  onLogout: () => void
  children: ReactNode
}

const operations = [
  { path: '/app', label: 'Overview', icon: '▦' },
  { path: '/customers', label: 'Customers', icon: '♙' },
  { path: '/quotes', label: 'Quotes', icon: '▤' },
  { path: '/quote-templates', label: 'Quote templates', icon: '▧' },
  { path: '/subscriptions', label: 'Subscriptions', icon: '↻' },
  { path: '/products', label: 'Products', icon: '◫' },
  { path: '/plans', label: 'Plans', icon: '◇' },
  { path: '/tax-rules', label: 'Taxes', icon: '%' },
  { path: '/discount-rules', label: 'Discounts', icon: '−' },
  { path: '/billing-runs', label: 'Billing runs', icon: '▣' },
  { path: '/invoices', label: 'Invoices', icon: '▧' },
  { path: '/reports/finance', label: 'Reports', icon: '▥' },
]

function isActive(pathname: string, path: string) {
  if (path === '/app') return pathname === '/app' || pathname === '/'
  if (path === '/invoices') return pathname === path
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function StaffWorkspaceShell({ pathname, role, name, onNavigate, onLogout, children }: Props) {
  const links = role === 'admin' ? [...operations, { path: '/staff', label: 'Team', icon: '♧' }] : operations

  const nav = (mobile = false) => (
    <nav aria-label="Main navigation" className={mobile ? 'flex min-w-max gap-1 px-3 py-2' : 'min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4'}>
      {links.map((item) => {
        const active = isActive(pathname, item.path)
        return (
          <button
            key={item.path}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onNavigate(item.path)}
            className={`${mobile ? 'shrink-0' : 'w-full'} flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${active ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            <span aria-hidden="true" className="grid size-5 place-items-center text-base">{item.icon}</span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-dvh bg-[#faf8ff] text-[#131b2e]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <button type="button" onClick={() => onNavigate('/app')} className="flex h-16 items-center gap-3 border-b border-slate-100 px-5 text-left">
          <span className="grid size-9 place-items-center rounded-lg bg-indigo-600 text-lg font-bold text-white">∞</span>
          <span><span className="block font-semibold">Brightloop</span><span className="block text-[11px] text-slate-500">Subscription operations</span></span>
        </button>
        <div className="px-3 pt-4">
          <button type="button" onClick={() => onNavigate('/billing-runs')} className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">⚡ Run billing</button>
        </div>
        {nav()}
        <div className="mt-auto border-t border-slate-100 p-4">
          <div className="mb-3 truncate text-xs text-slate-500">{role === 'admin' ? 'Administrator' : 'Staff'} workspace</div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            <button type="button" onClick={onLogout} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">Sign out</button>
          </div>
        </div>
      </aside>

      <div className="min-h-dvh lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <button type="button" onClick={() => onNavigate('/app')} className="flex items-center gap-2 font-semibold lg:hidden"><span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">∞</span>Brightloop</button>
            <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex"><span>Brightloop</span><span>/</span><span className="font-semibold text-indigo-700">{links.find((item) => isActive(pathname, item.path))?.label ?? 'Overview'}</span></div>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-slate-500 sm:inline">{name}</span>
              <button type="button" onClick={() => onNavigate('/billing-runs')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 lg:hidden">Run billing</button>
              <button type="button" onClick={onLogout} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:hidden">Sign out</button>
            </div>
          </div>
          <div className="overflow-x-auto border-t border-slate-100 lg:hidden">{nav(true)}</div>
        </header>
        <main className="min-h-[calc(100dvh-4rem)]">{children}</main>
      </div>
    </div>
  )
}
