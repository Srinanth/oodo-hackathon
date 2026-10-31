import { useCallback, useEffect, useState } from 'react'
import AuthPage, { type AuthMode } from './features/auth/AuthPage'
import CatalogPage from './features/catalog/CatalogPage'
import StaffPage from './features/staff/StaffPage'
import {
  getCurrentUser,
  prepareCsrf,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  signIn,
  signOut,
  type CurrentUser,
} from './features/auth/auth-api'

type Route = {
  mode: AuthMode
  uid?: string
  token?: string
}

function routeFor(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/register') return { mode: 'register' }
  if (path === '/password-reset') return { mode: 'request-reset' }
  if (path.startsWith('/password-reset/')) {
    const [, , uid, token] = path.split('/')
    return { mode: 'reset-password', uid: uid ? decodeURIComponent(uid) : undefined, token: token ? decodeURIComponent(token) : undefined }
  }
  return { mode: 'login' }
}

function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionMessage, setSessionMessage] = useState('')

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    let mounted = true
    async function restoreSession() {
      try {
        await prepareCsrf()
        const currentUser = await getCurrentUser()
        if (mounted) setUser(currentUser)
      } catch {
        if (mounted) setUser(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void restoreSession()
    return () => {
      mounted = false
    }
  }, [])

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  async function handleLogin(email: string, password: string) {
    const currentUser = await signIn(email, password)
    setUser(currentUser)
    setSessionMessage('')
    navigate('/app')
  }

  async function handleRegister(name: string, email: string, password: string) {
    const currentUser = await registerCustomer(name, email, password)
    setUser(currentUser)
    setSessionMessage('')
    navigate('/app')
  }

  async function handleLogout() {
    setSessionMessage('')
    try {
      await signOut()
      setUser(null)
      navigate('/login')
    } catch {
      setSessionMessage('We could not end your session. Please try again.')
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f5f6fa] px-5">
        <div role="status" className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <span className="size-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          Restoring your secure session…
        </div>
      </main>
    )
  }

  if (user) {
    if (path.replace(/\/+$/, '') === '/products' && ['admin', 'staff'].includes(user.role)) {
      return <CatalogPage isAdmin={user.role === 'admin'} onBack={() => navigate('/app')} />
    }
    if (path.replace(/\/+$/, '') === '/staff' && user.role === 'admin') {
      return <StaffPage onBack={() => navigate('/app')} />
    }
    return (
      <main className="min-h-dvh bg-[#f5f6fa] px-4 py-7 sm:px-8 sm:py-10">
        <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#17243b]">
                <span className="size-4 rounded-[5px] border-[3px] border-[#8ce2d2]" />
              </span>
              <div>
                <p className="font-semibold text-slate-950">Brightloop</p>
                <p className="text-xs text-slate-500">Subscription operations</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              Sign out
            </button>
          </header>

          <div className="py-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-indigo-700">Signed in as {user.role}</p>
              {['admin', 'staff'].includes(user.role) && (
                <button
                  type="button"
                  onClick={() => navigate('/products')}
                  className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                >
                  Product catalog
                </button>
              )}
              {user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => navigate('/staff')}
                  className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                >
                  Manage staff
                </button>
              )}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Welcome, {user.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Your secure Brightloop session is active for <strong className="font-medium text-slate-800">{user.email}</strong>.
              The role-aware workspace and portal pages will appear here as their feature slices are completed.
            </p>
            {sessionMessage && <p className="mt-4 text-sm text-rose-700">{sessionMessage}</p>}
            <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50/60 p-5">
              <p className="font-semibold text-slate-900">Account access is ready</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Session restoration is enabled. Refreshing this page will keep you signed in using your secure session cookie.
              </p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  const route = routeFor(path)
  return (
    <AuthPage
      mode={route.mode}
      resetUid={route.uid}
      resetToken={route.token}
      onNavigate={navigate}
      onLogin={handleLogin}
      onRegister={handleRegister}
      onRequestReset={requestPasswordReset}
      onResetPassword={resetPassword}
    />
  )
}

export default App
