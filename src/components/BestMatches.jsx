import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { bestMatches, GROUP_LABELS } from '@shared/picks.js'
import { SetupChip, fx, fp, fn, usd } from '@/components/pillarUi'
import { Info } from '@/components/Term'
import PortfolioButton from '@/components/PortfolioButton'

const HIDE_KEY = 'screener.bestMatches.hidden'

// How each figure is written on a chip, and the definition it links to.
const FMT = {
  rsi14: [(v) => `RSI ${fn(v)}`, 'rsi'],
  offHigh: [(v) => `${fp(v)} from 52-wk high`, 'off-high'],
  fairGap: [(v) => `${v > 0 ? '+' : ''}${fp(v)} vs fair value`, 'fair-value'],
  moatUsed: [(v) => `Moat ${v}`, 'moat'],
  peg: [(v) => `PEG ${fx(v, 2)}`, 'peg'],
  forwardPE: [(v) => `Fwd P/E ${fx(v)}`, 'forward-pe'],
  fcfYield: [(v) => `FCF yield ${fp(v, 1)}`, 'fcf-yield'],
  ebitdaMargin: [(v) => `EBITDA margin ${fp(v)}`, 'ebitda-margin'],
  netDebtToEbitda: [(v) => (v < 0 ? 'Net cash' : `Debt ${fx(v)} EBITDA`), 'net-debt-ebitda'],
  aiRisk: [(v) => `AI risk ${v}/10`, 'ai-risk'],
  epsGrowth: [(v) => `EPS growth ${fp(v)}/yr`, 'eps-growth'],
  revenueGrowth: [(v) => `Sales growth ${fp(v)}`, 'revenue-growth'],
  revenueGrowth3y: [(v) => `Sales growth ${fp(v)}/yr over 3 yrs`, 'revenue-growth'],
  dividendYield: [(v) => `Dividend ${fp(v, 1)}`, 'dividend-yield'],
  payoutRatio: [(v) => `Pays out ${fp(v)} of profit`, 'dividend-yield'],
}

const topPct = (r) => `top ${Math.max(1, Math.ceil((1 - r) * 100))}%`

function Chip({ f }) {
  if (f.key === 'setup') return f.value ? <SetupChip setup={f.value} long /> : null
  if (f.value == null) return null
  const [fmt0] = FMT[f.key] || [(v) => String(v)]
  const fmt = f.unverified ? (v) => `${fmt0(v)} (unverified)` : fmt0
  const strong = f.rank != null && f.rank >= 0.8
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[11.5px] whitespace-nowrap ${strong ? 'bg-gain-soft text-gain' : 'bg-surface-2 text-muted'}`}>
      <span className="num">{fmt(f.value)}</span>
      {f.rank != null && <span className="opacity-75">· {topPct(f.rank)}</span>}
    </span>
  )
}

function Bar({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-[11px] text-muted"><span className="truncate">{label}</span><span className="num">{value == null ? 'n/a' : Math.round(value * 100)}</span></div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${value == null ? 0 : Math.max(3, value * 100)}%` }} /></div>
    </div>
  )
}

function StockLink({ s }) {
  return (
    <div className="min-w-0 flex items-start gap-2">
      <PortfolioButton symbol={s.symbol} />
      <div className="min-w-0">
        <Link to={`/stock/${s.symbol}`} className="font-semibold text-accent hover:underline">{s.symbol}</Link>
        <span className="text-[12px] text-muted ml-2 num">{usd(s.price)}</span>
        <div className="text-[12px] text-muted truncate">{s.name}</div>
      </div>
    </div>
  )
}

export default function BestMatches({ stocks }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false } })
  const toggle = () => { const h = !hidden; setHidden(h); try { localStorage.setItem(HIDE_KEY, h ? '1' : '0') } catch { /* ignore */ } }
  const cats = useMemo(() => bestMatches(stocks), [stocks])
  if (stocks.length < 2) return null
  const [overall, ...rest] = cats

  return (
    <section className="card">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold inline-flex items-center gap-2"><Trophy size={16} className="text-accent" /> Best matches<Info id="best-matches" /></h2>
          <p className="text-[13px] text-muted mt-0.5">The {stocks.length} matching stocks ranked against each other. Each pick shows the numbers that put it there; green = top 20% of this group.</p>
        </div>
        <button className="btn" onClick={toggle}>{hidden ? <><ChevronDown size={14} /> Show</> : <><ChevronUp size={14} /> Hide</>}</button>
      </header>
      {!hidden && (
        <div className="px-5 pb-5 grid gap-5">
          {overall.picks.length > 0 && (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h3 className="font-semibold">{overall.title}</h3>
                <span className="text-[12px] text-faint">{overall.how}</span>
              </div>
              <div className="grid gap-2">
                {overall.picks.map((p, i) => (
                  <div key={p.stock.symbol} className="grid grid-cols-[28px_minmax(120px,1fr)_56px] md:grid-cols-[28px_minmax(150px,220px)_56px_1fr] items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3 py-2.5">
                    <span className="text-[18px] font-semibold text-faint num">{i + 1}</span>
                    <StockLink s={p.stock} />
                    <div className="text-right"><div className="text-[18px] font-semibold num">{Math.round(p.score * 100)}</div><div className="text-[10.5px] text-faint -mt-0.5">of 100</div></div>
                    <div className="col-span-3 md:col-span-1 grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5">
                      {p.factors.map((f) => <Bar key={f.key} label={GROUP_LABELS[f.key]} value={f.value} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rest.map((c) => (
              <div key={c.id} className="rounded-xl border border-line p-3.5 min-w-0">
                <h3 className="font-semibold">{c.title}</h3>
                <p className="text-[12px] text-faint mt-0.5 mb-2.5">{c.how}</p>
                {c.picks.length === 0 ? <p className="text-[13px] text-muted">None of the matching stocks qualify right now.</p> : (
                  <ol className="grid gap-3">
                    {c.picks.map((p) => (
                      <li key={p.stock.symbol} className="min-w-0">
                        <StockLink s={p.stock} />
                        <div className="flex flex-wrap gap-1 mt-1">{p.factors.map((f, k) => <Chip key={k} f={f} />)}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-faint">Ranked by formula on the figures shown, within this screen's results only; change the screen and the picks change. A shortlist to research, not a buy recommendation.</p>
        </div>
      )}
    </section>
  )
}
