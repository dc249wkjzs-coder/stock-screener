import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/lib/data'
import { prospects, PROSPECT_RULES as R } from '@shared/prospects.js'
import PortfolioButton from '@/components/PortfolioButton'
import { CALL_STYLE } from '@/components/PlanPanel'
import Term from '@/components/Term'
import { Panel } from '@/components/ui'
import { usd } from '@/components/pillarUi'

// Every stock in every sector, scanned for a sound business at a discount, ranked. See shared/prospects.js.
export default function Prospects() {
  const d = useData()
  const res = useMemo(() => prospects(d.stocks, d.peers), [d.stocks, d.peers])
  const [sector, setSector] = useState('All')
  const [buyOnly, setBuyOnly] = useState(false)
  const [shown, setShown] = useState(25)
  const list = res.list.filter((p) => (sector === 'All' || p.sector === sector) && (!buyOnly || p.call === 'buy'))
  const buys = res.list.filter((p) => p.call === 'buy').length

  return (
    <div className="grid gap-5 grid-cols-[minmax(0,1fr)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prospects</h1>
        <p className="text-[13.5px] text-muted mt-1 max-w-3xl">
          Every stock in every sector ({res.scanned.toLocaleString()} scanned), looking for a sound business at a discount: profitable,
          moat {R.moatMin}+, debt at most {R.debtMax}x EBITDA, and at least one sign it's cheap (10%+ below fair value, forward P/E 15%+ under
          its industry, or P/E 20%+ under its own 5-year average). <b className="text-fg">{res.list.length} qualify, {buys} with a Buy call.</b>{' '}
          Ranked by <Term id="prospects">opportunity score</Term>. A list to research, not advice.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {['All', ...res.sectors.map((x) => x.sector)].map((k) => {
          const n = k === 'All' ? res.list.length : res.sectors.find((x) => x.sector === k).picks.length
          return (
            <button key={k} onClick={() => { setSector(k); setShown(25) }}
              className={`rounded-full px-3 py-1 text-[13px] border ${sector === k ? 'bg-fg text-bg border-fg font-medium' : 'border-line text-fg hover:bg-surface-2'}`}>
              {k === 'All' ? 'All sectors' : k} <span className={sector === k ? 'opacity-70' : 'text-faint'}>{n}</span>
            </button>
          )
        })}
        <label className="ml-auto inline-flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" checked={buyOnly} onChange={(e) => setBuyOnly(e.target.checked)} /> Buy calls only
        </label>
      </div>

      <Panel title={sector === 'All' ? 'Top opportunities, all sectors' : `Top opportunities in ${sector}`}
        subtitle="Score 0–100 = discount 35 + quality 30 + timing 20 + growth 15, ranked against the other prospects.">
        {list.length ? (
          <ol className="grid grid-cols-[minmax(0,1fr)]">
            {list.slice(0, shown).map((p, i) => <Row key={p.symbol} p={p} n={i + 1} />)}
          </ol>
        ) : <p className="text-[13.5px] text-muted">Nothing qualifies here right now{buyOnly ? ' with a Buy call' : ''}.</p>}
        {list.length > shown && <button className="btn mt-3" onClick={() => setShown(shown + 25)}>Show 25 more ({list.length - shown} left)</button>}
      </Panel>

      {sector === 'All' && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-3">Best in each sector</h2>
          <div className="grid gap-4 grid-cols-[minmax(0,1fr)] md:grid-cols-2 xl:grid-cols-3">
            {res.sectors.map((x) => {
              const top = x.picks.filter((p) => !buyOnly || p.call === 'buy').slice(0, 3)
              return (
                <div key={x.sector} className="card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <button className="font-semibold text-left hover:text-accent" onClick={() => setSector(x.sector)}>{x.sector}</button>
                    <span className="text-[12px] text-faint num">{x.picks.length} of {x.scanned} qualify</span>
                  </div>
                  {top.length ? (
                    <ol className="mt-2 grid gap-2 grid-cols-[minmax(0,1fr)]">
                      {top.map((p) => (
                        <li key={p.symbol} className="flex items-center gap-2 text-[13.5px]">
                          <Score v={p.score} small />
                          <Link to={`/stock/${p.symbol}`} className="font-semibold hover:text-accent">{p.symbol}</Link>
                          <span className="text-muted truncate min-w-0 flex-1">{p.name}</span>
                          <Call c={p.call} small />
                          <PortfolioButton symbol={p.symbol} />
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-[13px] text-faint mt-2">No opportunities by these rules right now.</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ p, n }) {
  return (
    <li className="flex items-start gap-3 py-3 border-t border-line/60 first:border-0 first:pt-0 min-w-0">
      <span className="num text-[13px] text-faint w-6 text-right pt-1 shrink-0">{n}</span>
      <Score v={p.score} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={`/stock/${p.symbol}`} className="font-semibold hover:text-accent">{p.symbol}</Link>
          <span className="text-muted text-[13.5px] truncate min-w-0 max-w-full">{p.name}</span>
          <Call c={p.call} />
          <span className="text-[12px] text-faint">{p.sector} · {usd(p.price)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {p.reasons.map((r) => <span key={r} className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px]">{r}</span>)}
        </div>
      </div>
      <div className="shrink-0"><PortfolioButton symbol={p.symbol} /></div>
    </li>
  )
}

function Score({ v, small }) {
  const tone = v >= 70 ? 'bg-gain-soft text-gain' : v >= 50 ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
  return <span className={`shrink-0 rounded-lg num font-bold text-center ${tone} ${small ? 'text-[12px] w-8 py-0.5' : 'text-[15px] w-11 py-1'}`} title="Opportunity score 0–100">{v}</span>
}

function Call({ c, small }) {
  if (!c) return null
  return <span className={`rounded-full font-bold tracking-wide ${CALL_STYLE[c].pill} ${small ? 'px-1.5 text-[10.5px]' : 'px-2 py-px text-[11px]'}`}>{c.toUpperCase()}</span>
}
