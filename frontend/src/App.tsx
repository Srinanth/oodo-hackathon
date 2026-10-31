function App() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-950">
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
          Brightloop Software
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Subscription Management
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Frontend scaffold is ready. Feature screens will be added in the
          assigned frontend modules and use the Django API at <code>/api/v1</code>.
        </p>
        <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
          <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />
          React, TypeScript, Vite, and Tailwind are connected
        </div>
      </section>
    </main>
  )
}

export default App
