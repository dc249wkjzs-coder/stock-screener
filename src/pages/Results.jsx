import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useData } from '@/lib/data'
import { Panel, useSort, Empty } from '@/components/ui'
import { SetupChip, fx, fp, fn, usd, cap } from '@/components/pillarUi'
import { SETUP_ORDER } from '@shared/valuation.js'
import { BLANK, THEMES, matches, checks, riskProfile, fromParams, toParams } from '@shared/criteria.js'
import RiskMeter from '@/components/RiskMeter'
import BestMatches from '@/components/BestMatches'
import PortfolioButton from '@/components/PortfolioButton'
import { Info } from '@/components/Term'

export default function Results() {
  const d = useData()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [limit, setLimit] = useState(100)
  // The screen comes from the link (so it can be bookmarked); otherwise the one being built.
  const c = useMemo(() => ([...params.keys()].length ? fromParams(params) : d.screen), [params]) // eslint-disable-line
  useEffect(() => { if (JSON.stringify(c) !== JSON.stringify({ ...BLANK, ...d.screen })) d.setScreen(c) }, [c]) // eslint-disable-line

  const rows = useMemo(() => d.stocks.filter((s) => matches(s, c)).map((s) => ({ ...s, setupRank: SETUP_ORDER[s.setup.status], fairGap: s.fair?.vsMid ?? null })), [d.stocks, c])
  const risk = useMemo(() => riskProfile(rows), [rows])
  const { sorted, th } = useSort(rows, 'marketCap')
  const summary = useMemo(() => checks({}, c).map((k) => k.label), [c])
  const themes = THEMES.filter((t) => c.themes.includes(t.id)).map((t) => t.label)

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="text-[13px] text-muted hover:text-fg inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Stock finder</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{rows.length} matching stocks</h1>
          <div className="text-[13px] text-muted mt-1">{summary.length ? `Screened on: ${summary.map((l) => (l === 'Industry' ? themes.join(', ') : l)).join(' · ')}` : 'No boxes set: every stock is shown.'}</div>
        </div>
      </div>

      <BestMatches stocks={rows} />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <Panel pad={false} className="min-w-0 order-2 lg:order-1">
          {rows.length === 0 ? <Empty title="No stocks match">Loosen one of the boxes, or check Data status if the first data load is still running.</Empty> : (
            <div className="overflow-x-auto max-h-[75vh]">
              <table className="grid-table">
                <thead><tr>
                  <th className="w-8" title="Add to My portfolio" />
                  {th('symbol', 'Stock', 'text-left!')}
                  {th('setupRank', <>Entry<Info id="buy-zone" /></>, 'text-left!')}
                  {th('moatUsed', <>Moat<Info id="moat" /></>)}
                  {th('forwardPE', <>Fwd P/E<Info id="forward-pe" /></>)}
                  {th('peg', <>PEG<Info id="peg" /></>)}
                  {th('epsGrowth', <>EPS gr.<Info id="eps-growth" /></>)}
                  {th('ebitdaMargin', <>EBITDA %<Info id="ebitda-margin" /></>)}
                  {th('revenueGrowth', <>Sales gr.<Info id="revenue-growth" /></>)}
                  {th('fcfYield', <>FCF yld<Info id="fcf-yield" /></>)}
                  {th('dividendYield', <>Div.<Info id="dividend-yield" /></>)}
                  {th('netDebtToEbitda', <>Debt<Info id="net-debt-ebitda" /></>)}
                  {th('beta', <>Beta<Info id="beta" /></>)}
                  {th('offHigh', <>Off high<Info id="off-high" /></>)}
                  {th('fairGap', <>vs fair<Info id="fair-value" /></>)}
                  {th('aiRisk', <>AI risk<Info id="ai-risk" /></>)}
                  {th('price', 'Price')}
                  {th('marketCap', <>Mkt cap<Info id="market-cap" /></>)}
                </tr></thead>
                <tbody>
                  {sorted.slice(0, limit).map((s) => (
                    <tr key={s.symbol} className="cursor-pointer" onClick={() => navigate(`/stock/${s.symbol}`)} title={`Open ${s.symbol}`}>
                      <td className="w-8 pr-0!"><PortfolioButton symbol={s.symbol} /></td>
                      <td className="max-w-[220px] text-left!">
                        <Link to={`/stock/${s.symbol}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-accent hover:underline">{s.symbol}</Link>
                        <div className="text-[12px] text-muted truncate">{s.name}</div>
                      </td>
                      <td className="text-left!"><SetupChip setup={s.setup} />{s.setup.status === 'wait' && <div className="text-[11.5px] text-muted num">{s.setup.title.replace('Wait for ', '')}</div>}</td>
                      <td className="num font-semibold">{s.moatUsed ?? '—'}{s.moatOverride != null && <span className="text-accent" title="Your own score">*</span>}{s.moatUnverified && <div className="text-[10.5px] font-normal text-warn" title="Unverified — numbers only: no written assessment yet, so capped at 6">unverified</div>}</td>
                      <td className="num">{fx(s.forwardPE)}</td>
                      <td className="num">{fx(s.peg, 2)}</td>
                      <td className="num">{fp(s.epsGrowth)}</td>
                      <td className="num">{fp(s.ebitdaMargin)}</td>
                      <td className="num">{fp(s.revenueGrowth)}</td>
                      <td className={`num ${s.fcfYield < 0 ? 'text-loss' : ''}`}>{fp(s.fcfYield, 1)}</td>
                      <td className="num">{s.dividendYield ? fp(s.dividendYield, 1) : '—'}</td>
                      <td className="num">{s.netDebtToEbitda != null && s.netDebtToEbitda < 0 ? <span className="text-gain">net cash</span> : fx(s.netDebtToEbitda)}</td>
                      <td className="num">{fn(s.beta, 2)}</td>
                      <td className="num">{fp(s.offHigh)}</td>
                      <td className={`num ${s.fairGap < 0 ? 'text-gain' : s.fairGap > 0 ? 'text-loss' : ''}`}>{fp(s.fairGap)}</td>
                      <td className={`num ${s.aiRisk >= 7 ? 'text-loss font-semibold' : ''}`}>{s.aiRisk ?? '—'}</td>
                      <td className="num">{usd(s.price)}</td>
                      <td className="num text-muted">{cap(s.marketCap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sorted.length > limit && <div className="p-4 text-center"><button className="btn" onClick={() => setLimit(limit + 200)}>Show more ({sorted.length - limit} left)</button></div>}
            </div>
          )}
        </Panel>
        <Panel title="Risk of this group" className="order-1 lg:order-2 lg:sticky lg:top-6">
          <RiskMeter risk={risk} />
          <p className="text-[11.5px] text-faint mt-3">Measured on the matching stocks against the whole market: past volatility and drops, losses, debt, valuation and moat. A guide, not a promise.</p>
        </Panel>
      </div>
      <p className="text-[12.5px] text-faint px-1">Click a row for the chart, Fibonacci levels, fair value and moat breakdown. "vs fair" = price against the middle of its fair value range (negative = below). Bookmark this page to come back to the same screen: <Link className="text-accent" to={`/results?${toParams(c)}`}>link</Link>. Not investment advice.</p>
    </div>
  )
}
