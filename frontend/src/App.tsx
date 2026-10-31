import { useState } from 'react'

import CustomersPage from './features/customers/CustomersPage'
import QuoteTemplatesPage from './features/quotes/QuoteTemplatesPage'

function App() {
  const [section, setSection] = useState<'customers' | 'quoteTemplates'>('customers')

  return (
    <>
      <nav aria-label="Sales navigation" className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-5 py-3 sm:px-8 lg:px-10">
          <span className="mr-4 text-sm font-bold tracking-tight text-slate-900">Brightloop</span>
          <button
            type="button"
            aria-pressed={section === 'customers'}
            onClick={() => setSection('customers')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${section === 'customers' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Customers
          </button>
          <button
            type="button"
            aria-pressed={section === 'quoteTemplates'}
            onClick={() => setSection('quoteTemplates')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${section === 'quoteTemplates' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Quote templates
          </button>
        </div>
      </nav>
      {section === 'customers' ? <CustomersPage /> : <QuoteTemplatesPage />}
    </>
  )
}

export default App
