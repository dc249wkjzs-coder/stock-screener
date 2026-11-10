import { useEffect, useState } from 'react'
import { ExternalLink, TrendingUp, TrendingDown } from 'lucide-react'
import { Panel } from './ui'
import Term from './Term'
import { assess } from '@/lib/assessment'
import { DEMO, supabase } from '@/lib/supabase'
import { usd, fp } from './pillarUi'

// What the company does (FMP profile) and its strengths and weaknesses from the numbers.
export function CompanyPanel({ s, metrics }) {
  const c = metrics?.company
  const { good, bad } = assess(s)
  const [open, setOpen] = useState(false)
  const text = c?.description || ''
  const long = text.length > 700
  return (
    <Panel title="The company" subtitle={[c?.hq, c?.ceo && `CEO ${c.ceo}`, c?.employees && `${c.employees.toLocaleString('en-US')} employees`].filter(Boolean).join(' · ') || null}
      action={c?.website ? <a className="btn btn-ghost text-[12.5px]" href={c.website} target="_blank" rel="noreferrer">Website <ExternalLink size={12} /></a> : null}>
      {text ? (
        <p className="text-[14px] leading-relaxed">
          {long && !open ? `${text.slice(0, 700).replace(/\s+\S*$/, '')}… ` : text}
          {long && <button className="text-accent text-[13px] font-semibold" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</button>}
        </p>
      ) : <p className="text-muted text-[13.5px]">{metrics ? 'The company description arrives with the next data refresh for this stock (within a day).' : 'Loading…'}</p>}

      <div className="grid gap-5 md:grid-cols-2 mt-5">
        <div>
          <div className="label mb-2 text-gain">Strengths in the numbers</div>
          {good.length ? <ul className="grid gap-1.5 text-[13.5px]">{good.map((g) => <li key={g.text} className="flex gap-2"><span className="text-gain mt-0.5">+</span><span>{g.text} <Term id={g.term} className="text-[12px] text-faint">what's this?</Term></span></li>)}</ul>
            : <div className="text-muted text-[13px]">None of the checks stand out.</div>}
        </div>
        <div>
          <div className="label mb-2 text-loss">Weaknesses in the numbers</div>
          {bad.length ? <ul className="grid gap-1.5 text-[13.5px]">{bad.map((g) => <li key={g.text} className="flex gap-2"><span className="text-loss mt-0.5">−</span><span>{g.text} <Term id={g.term} className="text-[12px] text-faint">what's this?</Term></span></li>)}</ul>
            : <div className="text-muted text-[13px]">None of the checks flag a problem.</div>}
        </div>
      </div>
      <p className="text-[12px] text-faint mt-4">Each line compares one figure with a fixed threshold. It describes the numbers, not the company's future.</p>
    </Panel>
  )
}

// AI risk and benefit: Claude's written judgement, stored in scr_ai.
export function AiPanel({ s }) {
  const a = s.ai
  const Score = ({ label, term, v, good }) => (
    <div className="flex items-baseline gap-2">
      <span className={`num text-2xl font-semibold ${v >= 7 ? (good ? 'text-gain' : 'text-loss') : ''}`}>{v}</span>
      <span className="text-muted text-[13px]">/10 <Term id={term}>{label}</Term></span>
    </div>
  )
  return (
    <Panel title="AI impact" subtitle={a ? `Rated by ${a.rated_by} on ${new Date(a.rated_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}. A judgement from what the company does, not a calculation.` : null}>
      {!a ? <p className="text-muted text-[13.5px]">Not rated yet. Ask Claude in chat to rate {s.symbol}.</p> : (
        <>
          {a.summary && <p className="text-[14px] leading-relaxed mb-4">{a.summary}</p>}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Score label="AI risk" term="ai-risk" v={a.risk} good={false} />
              <ul className="grid gap-1.5 text-[13.5px] mt-2">{a.risk_reasons.map((r) => <li key={r} className="flex gap-2"><span className="text-loss">−</span><span>{r}</span></li>)}</ul>
            </div>
            <div>
              <Score label="AI benefit" term="ai-benefit" v={a.benefit} good />
              <ul className="grid gap-1.5 text-[13.5px] mt-2">{a.benefit_reasons.map((r) => <li key={r} className="flex gap-2"><span className="text-gain">+</span><span>{r}</span></li>)}</ul>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}

// Today's move and the latest headlines, fetched live when the page opens.
export function NewsPanel({ s }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (DEMO) { setErr('News loads on the live site.'); return }
    setData(null); setErr(null)
    supabase.functions.invoke('stock-news', { body: { symbol: s.symbol } })
      .then(({ data, error }) => (error ? setErr(error.message) : setData(data)))
  }, [s.symbol])

  const q = data?.quote
  const recent = (data?.news || []).filter((n) => Date.now() - Date.parse(n.date.replace(' ', 'T') + '-05:00') < 2.5 * 864e5)
  const older = (data?.news || []).filter((n) => !recent.includes(n))
  const up = q?.changePct >= 0
  return (
    <Panel title="Today and the latest news" subtitle="Live from Financial Modeling Prep when you open this page.">
      {err && <div className="text-muted text-[13.5px]">{err}</div>}
      {!err && !data && <div className="text-muted text-[13.5px]">Loading today's move and headlines…</div>}
      {q && (
        <div className={`rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 ${up ? 'bg-gain-soft' : 'bg-loss-soft'}`}>
          <div className={`flex items-center gap-2 text-lg font-semibold ${up ? 'text-gain' : 'text-loss'}`}>
            {up ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            <span className="num">{fp(q.changePct / 100, 2)}</span>
            <span className="num text-[14px]">({q.change >= 0 ? '+' : ''}{usd(q.change)})</span>
          </div>
          <div className="text-[13px] text-muted num">Last {usd(q.price)} · previous close {usd(q.previousClose)} · day range {usd(q.dayLow)}–{usd(q.dayHigh)}</div>
          <div className="text-[12px] text-faint">{q.time ? `as of ${new Date(q.time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</div>
        </div>
      )}
      {data && (
        <>
          <div className="label mb-2">Last 2–3 days {recent.length ? '' : '(no headlines)'}</div>
          {recent.length > 0 && <p className="text-[12.5px] text-muted mb-2">Headlines like these usually explain the day's move; the screener doesn't judge which one caused it.</p>}
          <NewsList items={recent} />
          {older.length > 0 && <><div className="label mt-5 mb-2">Earlier</div><NewsList items={older.slice(0, 8)} /></>}
        </>
      )}
    </Panel>
  )
}

function NewsList({ items }) {
  return (
    <ul className="grid gap-3">
      {items.map((n) => (
        <li key={n.url} className="flex gap-3">
          {n.image && <img src={n.image} alt="" loading="lazy" className="w-20 h-14 object-cover rounded-md shrink-0 bg-surface-2" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
          <div className="min-w-0">
            <a href={n.url} target="_blank" rel="noreferrer" className="font-semibold text-[14px] hover:text-accent">{n.title}</a>
            <div className="text-[12px] text-faint mt-0.5">{n.publisher} · {new Date(Date.parse(n.date.replace(' ', 'T') + '-05:00')).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            {n.summary && <p className="text-[13px] text-muted mt-1 line-clamp-2">{n.summary}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}
