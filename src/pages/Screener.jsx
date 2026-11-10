import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useData } from '@/lib/data'
import { Panel, Segmented, useSort, Badge, Empty } from '@/components/ui'
import { PillarDots, Verdict, SetupChip, fx, fp, fn, usd, cap } from '@/components/pillarUi'
import { SETUP_ORDER } from '@shared/valuation.js'
import { Info } from '@/components/Term'

const VERDICTS = [['pass', 'Passes'], ['all', 'All'], ['fail', 'Fails'], ['incomplete', 'Incomplete']]
const HOLD = [['all', 'All'], ['owned', 'Owned'], ['watch', 'Watchlist'], ['none', 'Not held']]
const TOGGLES = [
  ['zone', 'In buy zone', 'Passes the mandate and is within the buy zone of a Fibonacci level'],
  ['confirmed', 'Bounce confirmed', 'In the buy zone, back above the 20-day average, RSI above 30'],
  ['under', 'Below fair value', 'Price below the middle of its fair value range'],
  ['value', 'Value signal', 'P/E at least 20% below its own 5-year average'],
  ['oversold', 'RSI under 30', '14-day RSI below 30'],
  ['nearFib', 'Near Fib support', 'Within 3% above the next Fibonacci level'],
  ['knife', '25%+ off high', 'At least 25% below the 52-week high'],
  ['newco', 'New companies', 'Listed within the last 3 years'],
]

export default function Screener() {
  const d = useData()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(100)
  const verdict = params.get('v') || 'pass'
  const hold = params.get('h') || 'all'
  const sector = params.get('sector') || ''
  const minMoat = Number(params.get('moat') || 0)
  const on = new Set((params.get('t') || '').split(',').filter(Boolean))
  const set = (k, v) => { const p = new URLSearchParams(params); if (v === '' || v == null || v === 'all' && k !== 'v') p.delete(k); else p.set(k, v); setParams(p, { replace: true }); setLimit(100) }
  const toggle = (k) => { const n = new Set(on); n.has(k) ? n.delete(k) : n.add(k); set('t', [...n].join(',')) }

  const sectors = useMemo(() => [...new Set(d.stocks.map((s) => s.sector).filter(Boolean))].sort(), [d.stocks])

  const rows = useMemo(() => {
    const term = q.trim().toUpperCase()
    return d.stocks.filter((s) => {
      if (term && !s.symbol.includes(term) && !(s.name || '').toUpperCase().includes(term)) return false
      const o = s.eval.overall
      // A typed search looks across every verdict, so a named stock is never hidden by the Pass filter.
      if (term) return true
      if (verdict === 'pass' && !(o === 'pass' || o === 'pass-warn')) return false
      if (verdict === 'fail' && o !== 'fail') return false
      if (verdict === 'incomplete' && o !== 'incomplete') return false
      if (hold === 'owned' && !s.owned) return false
      if (hold === 'watch' && !s.watch) return false
      if (hold === 'none' && (s.owned || s.watch)) return false
      if (sector && s.sector !== sector) return false
      if (minMoat && !(s.moatUsed >= minMoat)) return false
      if (on.has('zone') && !['zone', 'zone-confirmed'].includes(s.setup.status)) return false
      if (on.has('confirmed') && s.setup.status !== 'zone-confirmed') return false
      if (on.has('under') && !(s.fair?.vsMid < 0)) return false
      if (on.has('value') && !s.eval.pillars.value.signal) return false
      if (on.has('oversold') && !(s.rsi14 < 30)) return false
      if (on.has('nearFib') && !(s.fibSupport && s.price / s.fibSupport.price - 1 <= 0.03)) return false
      if (on.has('knife') && !(s.offHigh <= -0.25)) return false
      if (on.has('newco') && !(s.yearsListed != null && s.yearsListed < d.rules.newCompanyYears)) return false
      return true
    }).map((s) => ({ ...s, fibGap: s.fibSupport ? s.price / s.fibSupport.price - 1 : null, verdictRank: { pass: 0, 'pass-warn': 1, incomplete: 2, fail: 3 }[s.eval.overall], setupRank: SETUP_ORDER[s.setup.status], fairGap: s.fair?.vsMid ?? null }))
  }, [d.stocks, q, verdict, hold, sector, minMoat, params]) // eslint-disable-line

  const waitingMatches = useMemo(() => {
    const term = q.trim().toUpperCase()
    if (!term) return []
    return (d.pending || []).filter((p) => p.symbol.includes(term) || (p.name || '').toUpperCase().includes(term))
  }, [d.pending, q])

  const { sorted, th } = useSort(rows, 'marketCap')
  const counts = useMemo(() => {
    const c = { pass: 0, warn: 0, fail: 0, incomplete: 0 }
    for (const s of d.stocks) { const o = s.eval.overall; if (o === 'pass') c.pass++; else if (o === 'pass-warn') c.warn++; else if (o === 'fail') c.fail++; else c.incomplete++ }
    return c
  }, [d.stocks])

  return (
    <div className="grid gap-5">
      <div className="card p-5 grid grid-cols-2 md:grid-cols-4 gap-5">
        <Count label="Pass every pillar" value={counts.pass} tone="text-gain" />
        <Count label="Pass with caution" value={counts.warn} tone="text-warn" />
        <Count label="Fail a pillar" value={counts.fail} tone="text-loss" />
        <Count label="Data still loading" value={counts.incomplete} tone="text-muted" sub={`of ${d.stocks.length} US stocks over $500M`} />
      </div>

      <Panel pad={false}>
        <div className="px-5 pt-4 pb-3 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input className="input pl-8 w-52" placeholder="Ticker or company" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Segmented value={verdict} onChange={(v) => set('v', v)} options={VERDICTS} />
            <Segmented value={hold} onChange={(v) => set('h', v)} options={HOLD} />
            <select className="input w-auto" value={sector} onChange={(e) => set('sector', e.target.value)}>
              <option value="">All sectors</option>
              {sectors.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="input w-auto" value={minMoat} onChange={(e) => set('moat', e.target.value === '0' ? '' : e.target.value)}>
              <option value="0">Any moat</option>
              {[6, 7, 8, 9].map((m) => <option key={m} value={m}>Moat {m}+</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TOGGLES.map(([k, label, hint]) => (
              <button key={k} title={hint} onClick={() => toggle(k)}
                className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${on.has(k) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg'}`}>{label}</button>
            ))}
            <span className="ml-auto text-[12.5px] text-muted self-center">{rows.length} stocks</span>
          </div>
        </div>

        {waitingMatches.length > 0 && (
          <div className="px-5 pb-3 text-[13px] text-muted">
            Still downloading: {waitingMatches.slice(0, 8).map((p, i) => <span key={p.symbol}>{i ? ', ' : ''}<Link to={`/stock/${p.symbol}`} className="font-semibold text-fg">{p.symbol}</Link> {p.name}</span>)}
            {waitingMatches.length > 8 ? ` and ${waitingMatches.length - 8} more` : ''}. Their financials arrive within a few hours.
          </div>
        )}
        {q.trim() && <div className="px-5 pb-3 text-[12.5px] text-faint">Searching all stocks; the Pass/Fail and other filters apply again when the search box is empty.</div>}
        {rows.length === 0 ? <Empty title="No stocks match">Loosen a filter, or check Data status if the first load is still running.</Empty> : (
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="grid-table">
              <thead><tr>
                {th('symbol', 'Stock')}
                {th('verdictRank', <>Verdict<Info id="pillars" /></>, 'text-left!')}
                {th('setupRank', <>Status<Info id="buy-zone" /></>, 'text-left!')}
                <th className="text-left!">Pillars<Info id="pillars" /></th>
                {th('moatUsed', <>Moat<Info id="moat" /></>)}
                {th('aiRisk', <>AI risk<Info id="ai-risk" /></>)}
                {th('aiBenefit', <>AI benefit<Info id="ai-benefit" /></>)}
                {th('price', 'Price')}
                {th('marketCap', <>Mkt cap<Info id="market-cap" /></>)}
                {th('forwardPE', <>Fwd P/E<Info id="forward-pe" /></>)}
                {th('peg', <>PEG<Info id="peg" /></>)}
                {th('epsGrowth', <>EPS gr.<Info id="eps-growth" /></>)}
                {th('ebitdaMargin', <>EBITDA %<Info id="ebitda-margin" /></>)}
                {th('netDebtToEbitda', <>ND/EBITDA<Info id="net-debt-ebitda" /></>)}
                {th('rsi14', <>RSI<Info id="rsi" /></>)}
                {th('offHigh', <>Off high<Info id="off-high" /></>)}
                {th('fibGap', <>To Fib<Info id="fibonacci" /></>)}
                {th('fairGap', <>vs fair value<Info id="fair-value" /></>)}
              </tr></thead>
              <tbody>
                {sorted.slice(0, limit).map((s) => (
                  <tr key={s.symbol} className="cursor-pointer" onClick={() => navigate(`/stock/${s.symbol}`)} title={`Open ${s.symbol}`}>
                    <td className="max-w-[230px]">
                      <Link to={`/stock/${s.symbol}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-accent hover:underline">{s.symbol}</Link>
                      {s.owned && <span className="ml-1.5"><Badge tone="accent">Owned</Badge></span>}
                      {!s.owned && s.watch && <span className="ml-1.5"><Badge>Watch</Badge></span>}
                      <div className="text-[12px] text-muted truncate">{s.name}</div>
                    </td>
                    <td className="text-left!"><Verdict e={s.eval} short /></td>
                    <td className="text-left!"><SetupChip setup={s.setup} />{s.setup.status === 'wait' && <div className="text-[11.5px] text-muted num">{s.setup.title.replace('Wait for ', '')}</div>}</td>
                    <td className="text-left!"><PillarDots pillars={s.eval.pillars} /></td>
                    <td className="num font-semibold">{s.moatUsed ?? '—'}{s.moatOverride != null && <span className="text-accent" title="Your override">*</span>}</td>
                    <td className={`num ${s.aiRisk >= 7 ? 'text-loss font-semibold' : ''}`}>{s.aiRisk ?? '—'}</td>
                    <td className={`num ${s.aiBenefit >= 7 ? 'text-gain font-semibold' : ''}`}>{s.aiBenefit ?? '—'}</td>
                    <td className="num">{usd(s.price)}</td>
                    <td className="num text-muted">{cap(s.marketCap)}</td>
                    <td className="num">{fx(s.forwardPE)}</td>
                    <td className="num">{fx(s.peg, 2)}</td>
                    <td className="num">{fp(s.epsGrowth)}</td>
                    <td className="num">{fp(s.ebitdaMargin)}</td>
                    <td className="num">{s.netDebtToEbitda != null && s.netDebtToEbitda < 0 ? <span className="text-gain">net cash</span> : fx(s.netDebtToEbitda)}</td>
                    <td className={`num ${s.rsi14 < 30 ? 'text-gain font-semibold' : s.rsi14 > 70 ? 'text-loss' : ''}`}>{fn(s.rsi14)}</td>
                    <td className="num">{fp(s.offHigh)}</td>
                    <td className="num" title={s.fibSupport ? `${(s.fibSupport.ratio * 100).toFixed(1)}% level at ${usd(s.fibSupport.price)}` : ''}>{s.fibGap == null ? '—' : `${fp(s.fibGap, 1)}`}</td>
                    <td className={`num ${s.fairGap < 0 ? 'text-gain' : s.fairGap > 0 ? 'text-loss' : ''}`} title={s.fair ? `Fair value middle ${usd(s.fair.mid)} (range ${usd(s.fair.low)}–${usd(s.fair.high)})` : ''}>{fp(s.fairGap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length > limit && <div className="p-4 text-center"><button className="btn" onClick={() => setLimit(limit + 200)}>Show more ({sorted.length - limit} left)</button></div>}
          </div>
        )}
      </Panel>
      <p className="text-[12.5px] text-faint px-1">
        Click any row to open the stock's page with its chart, Fibonacci levels and moat breakdown. Pillar dots, in order: moat, value, EPS, EBITDA, debt, financing. Hover a dot for the reason. "To Fib" is how far the price is above the next Fibonacci support. "vs fair value" is the price against the middle of its fair value range (negative = below fair value). Not investment advice.
      </p>
    </div>
  )
}

function Count({ label, value, tone, sub }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`num text-2xl font-semibold mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-[12.5px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}
