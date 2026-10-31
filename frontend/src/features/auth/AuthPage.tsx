import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../lib/api'

export type AuthMode = 'login' | 'register' | 'request-reset' | 'reset-password'

type AuthPageProps = {
  mode: AuthMode
  onNavigate: (path: string) => void
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (name: string, email: string, password: string) => Promise<void>
  onRequestReset: (email: string) => Promise<string>
  onResetPassword: (uid: string, token: string, password: string) => Promise<string>
  resetUid?: string
  resetToken?: string
}

type FieldErrors = Record<string, string>

function errorDetails(error: unknown): { message: string; fields: FieldErrors } {
  if (error instanceof ApiError) {
    const apiError = error.body?.error
    return {
      message: apiError?.message ?? error.message,
      fields: apiError?.fieldErrors ?? {},
    }
  }
  return {
    message: 'We could not complete that request. Please try again.',
    fields: {},
  }
}

function passwordPolicyMessage(password: string): string | undefined {
  if (password.length < 9) return 'Use at least 9 characters.'
  if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.'
  if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add at least one special character.'
  return undefined
}

function BrandPanel() {
  return (
    <aside className="relative hidden min-h-[660px] flex-col justify-between overflow-hidden bg-[#17243b] p-10 text-white md:flex lg:p-14">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 size-48 rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-12 size-64 rounded-full bg-[#4f46e5]/30 blur-3xl" />

      <div className="relative flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
          <span className="size-4 rounded-[5px] border-[3px] border-[#8ce2d2]" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Brightloop</span>
      </div>

      <div className="relative max-w-md py-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#8ce2d2]">
          Subscription operations
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-[-0.035em] lg:text-[2.7rem]">
          Your recurring business, in one clear view.
        </h1>
        <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">
          Keep plans, renewals, invoices, and customer access organized in one workspace.
        </p>
      </div>

      <p className="relative text-xs text-slate-400">Secure access for your Brightloop account</p>
    </aside>
  )
}

function BrandMark() {
  return (
    <div className="mb-8 flex items-center gap-3 md:hidden">
      <span className="grid size-10 place-items-center rounded-xl bg-[#17243b]">
        <span className="size-4 rounded-[5px] border-[3px] border-[#8ce2d2]" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-slate-900">Brightloop</span>
    </div>
  )
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-rose-700" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-100'

function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800'
          : 'rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900'
      }
    >
      {children}
    </div>
  )
}

function SubmitButton({ children, busy }: { children: ReactNode; busy: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#4f46e5] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4338ca] focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-wait disabled:opacity-70"
    >
      {busy ? 'Please wait…' : children}
    </button>
  )
}

function LoginForm({ props }: { props: AuthPageProps }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setErrors({})
    setBusy(true)
    try {
      await props.onLogin(email.trim(), password)
    } catch (error) {
      const details = errorDetails(error)
      setMessage(details.message)
      setErrors(details.fields)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-sm font-medium text-indigo-700">Welcome back</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Sign in to Brightloop</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Use your work account to continue.</p>

      <form className="mt-7 space-y-5" onSubmit={submit}>
        {message && <Alert>{message}</Alert>}
        <Field id="login-email" label="Email address" error={errors.email}>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className={inputClass}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
          />
        </Field>

        <Field id="login-password" label="Password" error={errors.password}>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClass} pr-16`}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              className="absolute inset-y-0 right-3 text-xs font-semibold text-slate-600 hover:text-indigo-700 focus:outline-none focus:underline"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>

        <div className="flex justify-end">
          <a
            href="/password-reset"
            onClick={(event) => {
              event.preventDefault()
              props.onNavigate('/password-reset')
            }}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            Forgot password?
          </a>
        </div>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>

      <div className="mt-7 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
        New to Brightloop?{' '}
        <a
          href="/register"
          onClick={(event) => {
            event.preventDefault()
            props.onNavigate('/register')
          }}
          className="font-semibold text-indigo-700 hover:underline"
        >
          Create a customer account
        </a>
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-slate-500">
        Staff accounts are created by a Brightloop administrator.
      </p>
    </>
  )
}

function RegisterForm({ props }: { props: AuthPageProps }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setErrors({})
    const validationMessage = passwordPolicyMessage(password)
    if (validationMessage) {
      setErrors({ password: validationMessage })
      return
    }
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match.' })
      return
    }
    setBusy(true)
    try {
      await props.onRegister(name.trim(), email.trim(), password)
    } catch (error) {
      const details = errorDetails(error)
      setMessage(details.message)
      setErrors(details.fields)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-sm font-medium text-indigo-700">Customer account</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Create your account</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Set up access to your Brightloop subscription portal.</p>

      <form className="mt-7 space-y-4" onSubmit={submit}>
        {message && <Alert>{message}</Alert>}
        <Field id="register-name" label="Full name" error={errors.name}>
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={300}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'register-name-error' : undefined}
          />
        </Field>
        <Field id="register-email" label="Email address" error={errors.email}>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className={inputClass}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
          />
        </Field>
        <Field id="register-password" label="Password" error={errors.password}>
          <div className="relative">
            <input
              id="register-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClass} pr-16`}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'register-password-error' : 'password-policy'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              className="absolute inset-y-0 right-3 text-xs font-semibold text-slate-600 hover:text-indigo-700 focus:outline-none focus:underline"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <p id="password-policy" className="mt-1.5 text-xs leading-5 text-slate-500">
            At least 9 characters, including uppercase, lowercase, and a special character.
          </p>
        </Field>
        <Field id="confirm-password" label="Confirm password" error={errors.confirmPassword}>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={inputClass}
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
          />
        </Field>
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already registered?{' '}
        <a
          href="/login"
          onClick={(event) => {
            event.preventDefault()
            props.onNavigate('/login')
          }}
          className="font-semibold text-indigo-700 hover:underline"
        >
          Sign in
        </a>
      </p>
    </>
  )
}

function RequestResetForm({ props }: { props: AuthPageProps }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      setSuccess(await props.onRequestReset(email.trim()))
    } catch (cause) {
      setError(errorDetails(cause).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-sm font-medium text-indigo-700">Account recovery</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Reset your password</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Enter the email address on your account. If it is registered, we’ll send a reset link.
      </p>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}
        <Field id="reset-email" label="Email address">
          <input
            id="reset-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </Field>
        <SubmitButton busy={busy}>Send reset link</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm">
        <a
          href="/login"
          onClick={(event) => {
            event.preventDefault()
            props.onNavigate('/login')
          }}
          className="font-semibold text-indigo-700 hover:underline"
        >
          Back to sign in
        </a>
      </p>
    </>
  )
}

function ResetPasswordForm({ props }: { props: AuthPageProps }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    const policyError = passwordPolicyMessage(password)
    if (policyError) {
      setError(policyError)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!props.resetUid || !props.resetToken) {
      setError('This reset link is incomplete. Request a new password reset link.')
      return
    }
    setBusy(true)
    try {
      setSuccess(await props.onResetPassword(props.resetUid, props.resetToken, password))
    } catch (cause) {
      const details = errorDetails(cause)
      setError(details.fields.newPassword ?? details.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-sm font-medium text-indigo-700">Account recovery</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Choose a new password</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Use a password you have not used for this account before.</p>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}
        <Field id="new-password" label="New password">
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
            aria-describedby="reset-password-policy"
          />
          <p id="reset-password-policy" className="mt-1.5 text-xs leading-5 text-slate-500">
            At least 9 characters, including uppercase, lowercase, and a special character.
          </p>
        </Field>
        <Field id="confirm-new-password" label="Confirm new password">
          <input
            id="confirm-new-password"
            name="confirmNewPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={inputClass}
          />
        </Field>
        {success ? (
          <button
            type="button"
            onClick={() => props.onNavigate('/login')}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#4f46e5] px-4 text-sm font-semibold text-white hover:bg-[#4338ca] focus:outline-none focus:ring-4 focus:ring-indigo-200"
          >
            Return to sign in
          </button>
        ) : (
          <SubmitButton busy={busy}>Update password</SubmitButton>
        )}
      </form>
    </>
  )
}

export default function AuthPage(props: AuthPageProps) {
  let content: ReactNode
  switch (props.mode) {
    case 'login':
      content = <LoginForm props={props} />
      break
    case 'register':
      content = <RegisterForm props={props} />
      break
    case 'request-reset':
      content = <RequestResetForm props={props} />
      break
    case 'reset-password':
      content = <ResetPasswordForm props={props} />
      break
  }

  return (
    <main className="min-h-dvh bg-[#f5f6fa] px-4 py-7 sm:px-8 sm:py-10">
      <div className="mx-auto grid min-h-[min(760px,calc(100dvh-3.5rem))] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_-28px_rgba(15,23,42,0.22)] md:grid-cols-[0.92fr_1.08fr]">
        <BrandPanel />
        <section className="flex items-center justify-center px-6 py-8 sm:px-12 md:px-10 lg:px-16">
          <div className="w-full max-w-sm">
            <BrandMark />
            {content}
            <p className="mt-8 text-center text-xs text-slate-400">© 2026 Brightloop Software</p>
          </div>
        </section>
      </div>
      <p className="mx-auto mt-5 max-w-5xl text-center text-xs text-slate-400">
        Secure sign-in · Your session is protected with HTTP-only cookies
      </p>
    </main>
  )
}
