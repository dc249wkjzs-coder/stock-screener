import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { GROUPS, TERMS } from '@/lib/glossary'

export default function Learn() {
  const { hash } = useLocation()
  const [q, setQ] = useState('')
  const active = hash.slice(1)

  // Jump to the requested definition and highlight it.
  useEffect(() => {
    if (!active) return
    const el = document.getElementById(active)
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [active])

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    return GROUPS.map(([title, ids]) => [title, ids.filter((id) => !term || JSON.stringify(TERMS[id]).toLowerCase().includes(term))]).filter(([, ids]) => ids.length)
  }, [q])

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr] items-start">
      <nav className="lg:sticky lg:top-6 card p-4 grid gap-4 max-h-[85vh] overflow-auto">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input pl-8" placeholder="Search terms" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {groups.map(([title, ids]) => (
          <div key={title}>
            <div className="label mb-1">{title}</div>
            <ul className="grid gap-0.5">
              {ids.map((id) => (
                <li key={id}><a href={`#${id}`} className={`block rounded px-2 py-1 text-[13px] ${active === id ? 'bg-accent-soft text-accent font-semibold' : 'text-muted hover:text-fg hover:bg-surface-2'}`}>{TERMS[id].term}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="grid gap-8">
        <p className="text-muted text-[14px] max-w-2xl">Every number and label in the screener, in plain language: what it is, why it matters, an example, and how the screener uses it. Dotted-underlined labels anywhere on the site link here.</p>
        {groups.map(([title, ids]) => (
          <section key={title} className="grid gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            {ids.map((id) => {
              const t = TERMS[id]
              return (
                <article key={id} id={id} className={`card p-5 scroll-mt-6 ${active === id ? 'ring-2 ring-accent' : ''}`}>
                  <h3 className="text-[16px] font-semibold">{t.term}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed">{t.what}</p>
                  <dl className="mt-3 grid gap-2.5 text-[13.5px] leading-relaxed">
                    <div><dt className="label">Why it matters</dt><dd className="mt-0.5">{t.why}</dd></div>
                    <div><dt className="label">Example</dt><dd className="mt-0.5">{t.example}</dd></div>
                    <div><dt className="label">In the screener</dt><dd className="mt-0.5 text-muted">{t.inScreener}</dd></div>
                  </dl>
                </article>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}
