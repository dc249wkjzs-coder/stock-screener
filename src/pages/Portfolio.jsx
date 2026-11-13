import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Minus, X, ThumbsUp, AlertTriangle, Search, History } from 'lucide-react'
import { useData } from '@/lib/data'
import { Panel, Empty } from '@/components/ui'
import { SetupChip, fx, fp, fn, usd, cap } from '@/components/pillarUi'
import { scorePortfolio, PORTFOLIO_LABELS, PORTFOLIO_WEIGHTS } from '@shared/portfolio.js'
import RiskMeter from '@/components/RiskMeter'
import { Info } from '@/components/Term'
import PastPerformance from '@/components/PastPerformance'

const GRADES = [[80, 'Excellent'], [65, 'Strong'], [50, 'Average'], [35, 'Below average'], [0, 'Weak']]
const grade = (x) => GRADES.find(([min]) => x >= min)[1]

function Bar({ label, value, note }) {
  const v = value == null ? null : Math.round(value * 100)
  return (
    <div>
      <div className="flex justify-between text-[13px]"><span>{label}{note && <span className="text-faint text-[11.5px]"> · {note}</span>}</span><span className="num font-semibold">{v ?? 'n/a'}</span></div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden mt-1"><div className={`h-full rounded-full ${v >= 65 ? 'bg-gain' : v < 35 ? 'bg-loss' : 'bg-accent'}`} style={{ width: `${v == null ? 0 : Math.max(3, v)}%` }} /></div>
    </div>
  )
}

function Lines({ title, icon: Icon, tone, items, empty }) {
  return (
    <Panel title={<span className={`inline-flex items-center gap-2 ${tone}`}><Icon size={16} /> {title}</span>}>
      {items.length === 0 ? <p className="text-[13px] text-muted">{empty}</p> : (
        <ul className="grid gap-2.5">
          {items.map((x, i) => (
            <li key={i} className="text-[13.5px] leading-snug"><span className="text-[11px] font-semibold uppercase tracking-wide text-faint block">{x.area}</span>{x.text}</li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default function Portfolio() {
  const d = useData()
  const [past, setPast] = useState(false)
  const pastRef = useRef(null)
  useEffect(() => { if (past) pastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [past])
  const navigate = useNavigate()
  const result = useMemo(() => scorePortfolio(d.portfolio, d.stocks), [d.portfolio, d.stocks])
  const rows = d.portfolio.map((p) => ({ ...p, s: d.bySymbol[p.symbol] })).filter((r) => r.s)
  const missing = d.portfolio.filter((p) => !d.bySymbol[p.symbol])

  if (!d.portfolio.length) {
    return (
      <div className="grid gap-5">
        <h1 className="text-2xl font-semibold tracking-tight">My portfolio</h1>
        <Empty title="No stocks yet" action={<div className="flex gap-2 justify-center"><Link className="btn btn-primary" to="/results">Go to Results</Link><Link className="btn" to="/lookup"><Search size={14} /> Look up a stock</Link></div>}>
          Your stock cart is empty. Press <span className="inline-grid place-items-center w-5 h-5 rounded border border-line align-middle"><Plus size={12} /></span> next to any stock (in Results, Best matches, Look up a stock or on a stock's page), or use the Stock cart at the top right, then press Check out. The page then scores the whole group and lists its strengths and weaknesses.
        </Empty>
      </div>
    )
  }

  const w = result?.weights || {}
  const anySet = d.portfolio.some((p) => p.weight != null)
  // − / + move a stock's share by 1 point; the first press fixes it at its current share.
  const nudge = (symbol, step) => {
    const now = Math.round((w[symbol] || 0) * 100)
    d.setWeights({ [symbol]: Math.min(100, Math.max(0, now + step)) })
  }
  const setExact = (symbol, txt) => {
    const v = txt.trim() === '' ? null : Math.min(100, Math.max(0, Number(txt)))
    if (v === null || Number.isFinite(v)) d.setWeights({ [symbol]: v })
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My portfolio</h1>
          <div className="text-[13px] text-muted mt-1">{rows.length} stock{rows.length === 1 ? '' : 's'} · {anySet ? 'your own weights' : 'equal weights'} · from your stock cart · a planning list, not real holdings</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {anySet && <button className="btn" onClick={() => d.setWeights(Object.fromEntries(d.portfolio.map((p) => [p.symbol, null])))}>Reset to equal weights</button>}
          <button className="btn" onClick={() => { if (window.confirm('Remove every stock from My portfolio?')) d.clearPortfolio() }}>Clear all</button>
          <button className="btn btn-primary" onClick={() => (past ? pastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : setPast(true))}><History size={14} /> What if I bought these 1 or 3 years ago?</button>
        </div>
      </div>

      {result && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
          <div className="grid gap-5 min-w-0">
          <Panel title={<>Portfolio score<Info id="portfolio-score" /></>} subtitle="Each part compares your stocks with every stock in the screener (100 = best in the market), weighted by each stock's share.">
            <div className="grid gap-5 sm:grid-cols-[150px_1fr] items-center">
              <div className="text-center">
                <div className="text-5xl font-semibold num">{Math.round(result.overall * 100)}</div>
                <div className="text-[12px] text-faint">out of 100</div>
                <div className="mt-1 font-semibold">{grade(result.overall * 100)}</div>
              </div>
              <div className="grid gap-3">
                {Object.keys(PORTFOLIO_WEIGHTS).map((k) => (
                  <Bar key={k} label={PORTFOLIO_LABELS[k]} value={result.scores[k]} note={`${PORTFOLIO_WEIGHTS[k] * 100}% of score`} />
                ))}
              </div>
            </div>
          </Panel>
          <div className="grid gap-5 md:grid-cols-2">
            <Lines title="Strengths" icon={ThumbsUp} tone="text-gain" items={result.strengths} empty="Nothing stands out above the market yet." />
            <Lines title="Weaknesses" icon={AlertTriangle} tone="text-loss" items={result.weaknesses} empty="No clear weak spots against the checks used here." />
          </div>
          </div>
          <Panel title="Risk and spread">
            <RiskMeter risk={result.risk} />
            <div className="mt-5 pt-4 border-t border-line">
              <h3 className="font-semibold text-[14px] mb-2">By sector</h3>
            <div className="grid gap-2">
              {result.sectors.map((x) => (
                <div key={x.name}>
                  <div className="flex justify-between text-[13px]"><span>{x.name}</span><span className="num">{fp(x.share)}</span></div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1"><div className={`h-full rounded-full ${x.share > 0.4 ? 'bg-loss' : 'bg-accent'}`} style={{ width: `${Math.max(2, x.share * 100)}%` }} /></div>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-faint mt-3">Effective number of stocks: {fn(result.effective, 1)} (counts uneven weights: two stocks at 90/10 behave like 1.2).</p>
            </div>
          </Panel>
        </div>
      )}


      {past && result && (
        <div ref={pastRef} className="scroll-mt-20">
          <PastPerformance holdings={rows.map((x) => ({ symbol: x.symbol, w: result.weights[x.symbol] }))} />
        </div>
      )}

      <div className="grid gap-5">
        <Panel title="Stocks" subtitle="Use − / + to change a stock's share, or type a %. Stocks you haven't set share what's left equally." pad={false}>
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead><tr>
                <th>Stock</th><th>Share</th><th>Moat<Info id="moat" /></th><th>Fwd P/E<Info id="forward-pe" /></th><th>PEG<Info id="peg" /></th>
                <th>EPS gr.<Info id="eps-growth" /></th><th>Debt<Info id="net-debt-ebitda" /></th><th>Beta<Info id="beta" /></th><th className="text-left!">Entry<Info id="buy-zone" /></th><th>Price</th><th />
              </tr></thead>
              <tbody>
                {rows.map(({ symbol, weight, s }) => (
                  <tr key={symbol} className="cursor-pointer" onClick={() => navigate(`/stock/${symbol}`)}>
                    <td className="max-w-[200px]"><Link to={`/stock/${symbol}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-accent hover:underline">{symbol}</Link><div className="text-[12px] text-muted truncate">{s.name}</div></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <button className="w-7 h-7 grid place-items-center rounded-full bg-accent-soft text-accent hover:bg-accent hover:text-accent-fg" onClick={() => nudge(symbol, -1)} title="1 point less"><Minus size={14} strokeWidth={2.6} /></button>
                        <input className="w-12 text-center num rounded border border-line bg-surface py-0.5 text-[13px]" key={`${symbol}-${weight}-${Math.round((w[symbol] || 0) * 1000)}`}
                          defaultValue={(w[symbol] * 100).toFixed(weight == null ? 1 : 0)} onBlur={(e) => setExact(symbol, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
                        <span className="text-[12px] text-muted">%</span>
                        <button className="w-7 h-7 grid place-items-center rounded-full bg-accent-soft text-accent hover:bg-accent hover:text-accent-fg" onClick={() => nudge(symbol, 1)} title="1 point more"><Plus size={14} strokeWidth={2.6} /></button>
                      </div>
                      {weight == null && <div className="text-[10.5px] text-faint">equal share</div>}
                    </td>
                    <td className="num font-semibold">{s.moatUsed ?? '—'}{s.moatUnverified && <div className="text-[10.5px] font-normal text-warn" title="Unverified — numbers only: no written assessment yet, so capped at 6">unverified</div>}</td>
                    <td className="num">{fx(s.forwardPE)}</td>
                    <td className="num">{fx(s.peg, 2)}</td>
                    <td className="num">{fp(s.epsGrowth)}</td>
                    <td className="num">{s.netDebtToEbitda != null && s.netDebtToEbitda < 0 ? <span className="text-gain">net cash</span> : fx(s.netDebtToEbitda)}</td>
                    <td className="num">{fn(s.beta, 2)}</td>
                    <td className="text-left!"><SetupChip setup={s.setup} /></td>
                    <td className="num">{usd(s.price)}<div className="text-[11px] text-muted">{cap(s.marketCap)}</div></td>
                    <td onClick={(e) => e.stopPropagation()}><button className="inline-flex items-center gap-1 rounded-full border border-loss/40 bg-loss-soft px-2.5 py-1 text-[12px] font-semibold text-loss hover:bg-loss hover:text-white" title={`Remove ${symbol}`} onClick={() => d.removeFromPortfolio(symbol)}><X size={12} strokeWidth={2.6} /> Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.length > 0 && <p className="px-5 py-3 text-[12.5px] text-muted">Not in the screener's data right now: {missing.map((m) => m.symbol).join(', ')}.</p>}
        </Panel>
      </div>
      <p className="text-[12.5px] text-faint px-1">The score and lines are worked out from the figures on this site against fixed thresholds or the market median. Not investment advice.</p>
    </div>
  )
}
