import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Lightbulb, Calculator, Scale, TriangleAlert, MapPin } from 'lucide-react'
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
    <div className="grid gap-6 lg:grid-cols-[250px_1fr] items-start">
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

      <div className="grid gap-8 min-w-0">
        <div className="card p-5 bg-accent-soft/60 border-accent/30 max-w-3xl">
          <div className="font-semibold">New to investing? Start at section 1.</div>
          <p className="text-[14px] mt-1 leading-relaxed">Each section builds on the one before: what a stock is, then whether it's cheap, how profitable it is, how much it owes, how strong the business is, what it might be worth, and finally when to buy and how risky it is. Every term has a one-line meaning, an everyday comparison, a worked example with simple numbers, and what counts as good or bad. Underlined labels anywhere on the site link here.</p>
        </div>
        {groups.map(([title, ids]) => (
          <section key={title} className="grid gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            {ids.map((id) => <Entry key={id} id={id} t={TERMS[id]} active={active === id} />)}
          </section>
        ))}
        <p className="text-[12.5px] text-faint">For learning, not investment advice. Rules of thumb are common guides, not hard laws, and differ by industry.</p>
      </div>
    </div>
  )
}

function Entry({ id, t, active }) {
  return (
    <article id={id} className={`card p-5 scroll-mt-6 max-w-3xl ${active ? 'ring-2 ring-accent' : ''}`}>
      <h3 className="text-[17px] font-semibold">{t.term}</h3>
      <p className="mt-1.5 text-[15.5px] leading-relaxed">{t.simple}</p>
      <dl className="mt-4 grid gap-3 text-[14px] leading-relaxed">
        <Row icon={Lightbulb} label="Think of it like">{t.like}</Row>
        <Row icon={Calculator} label="Example">{t.example}</Row>
        <Row icon={Scale} label="Good or bad?">{t.rule}</Row>
        {t.watch && <Row icon={TriangleAlert} label="Watch out" tone="text-warn">{t.watch}</Row>}
        <Row icon={MapPin} label="Where you'll see it" muted>{t.where}</Row>
      </dl>
    </article>
  )
}

function Row({ icon: Icon, label, children, tone = 'text-accent', muted }) {
  return (
    <div className="flex gap-3">
      <Icon size={16} className={`shrink-0 mt-0.5 ${tone}`} aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
        <dd className={`mt-0.5 ${muted ? 'text-muted text-[13px]' : ''}`}>{children}</dd>
      </div>
    </div>
  )
}
