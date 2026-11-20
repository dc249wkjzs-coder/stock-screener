import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useData } from '@/lib/data'
import { Panel, useSort, Empty } from '@/components/ui'
import { SetupChip, fp, fn, usd, cap } from '@/components/pillarUi'
import { SETUP_ORDER } from '@shared/valuation.js'
import { ETF_BLANK, ETF_PRESETS, ETF_CATEGORIES, ETF_SECTORS, etfChecks, etfScreen, etfToParams, etfFromParams } from '@shared/etfScreen.js'
import PortfolioButton from '@/components/PortfolioButton'
import Term, { Info } from '@/components/Term'

const SAVE_KEY = 'screener.etfscreen.v1'
const load = () => { try { return { ...ETF_BLANK, ...JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } } catch { return { ...ETF_BLANK } } }

// One row of pill buttons; value null = "Any".
function Pills({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button key={String(v)} onClick={() => onChange(v)}
          className={`rounded-full border px-2.5 py-1 text-[12.5px] ${value === v ? 'border-accent bg-accent-soft text-accent font-semibold' : 'border-line hover:border-fg/30'}`}>{label}</button>
      ))}
    </div>
  )
}
function Box({ title, term, q, children }) {
  return (
    <div className="grid gap-2 py-3.5 border-t border-line first:border-0 first:pt-0">
      <div><div className="font-semibold text-[13.5px]">{title}{term && <Info id={term} />}</div>{q && <div className="text-[12px] text-muted">{q}</div>}</div>
      {children}
    </div>
  )
}

// ETF finder: its own boxes and presets (funds have no earnings), results below; ETFs share the cart and My portfolio.
export default function EtfFinder() {
  const d = useData()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const c = useMemo(() => ([...params.keys()].length ? etfFromParams(params) : load()), [params])
  const set = (patch) => {
    const next = { ...c, ...patch }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)) } catch { /* private window */ }
    setParams(etfToParams(next), { replace: true })
  }
  const [limit, setLimit] = useState(100)
  const [showBoxes, setShowBoxes] = useState(false)
  useEffect(() => setLimit(100), [params])

  const rows = useMemo(() => etfScreen(d.etfs, c).map((e) => ({ ...e, setupRank: SETUP_ORDER[e.setup?.status] ?? 99 })), [d.etfs, c])
  const { sorted, th } = useSort(rows, 'aum')
  const summary = etfChecks({}, c).map((k) => k.label)
  const same = (p) => JSON.stringify({ ...ETF_BLANK, ...p.set }) === JSON.stringify(c)
  const loading = !d.loading && d.etfs.length === 0
  const withPrices = d.etfs.filter((e) => e.priceDate).length

  const boxes = (
    <Panel className="lg:sticky lg:top-6" title={<span className="inline-flex items-center gap-2"><SlidersHorizontal size={15} /> Boxes</span>}
      action={<button className="text-[12.5px] text-muted hover:text-fg inline-flex items-center gap-1" onClick={() => set({ ...ETF_BLANK })}><RotateCcw size={12} /> Clear</button>}>
      <Box title="Kind of fund" term="etf-category">
        <div className="flex flex-wrap gap-1.5">
          {ETF_CATEGORIES.filter((k) => k !== 'Leveraged / inverse').map((k) => {
            const on = c.cats.includes(k)
            return <button key={k} onClick={() => set({ cats: on ? c.cats.filter((x) => x !== k) : [...c.cats, k] })}
              className={`rounded-full border px-2.5 py-1 text-[12.5px] ${on ? 'border-accent bg-accent-soft text-accent font-semibold' : 'border-line hover:border-fg/30'}`}>{k}</button>
          })}
        </div>
        <div className="text-[11.5px] text-faint">None picked = all kinds.</div>
      </Box>
      <Box title="Sector" q="Holds at least this much in one sector">
        <select className="input py-1.5! text-[13px]!" value={c.sector} onChange={(e) => set({ sector: e.target.value })}>
          <option value="">Any sector</option>
          {ETF_SECTORS.map((s) => <option key={s}>{s}</option>)}
        </select>
        {c.sector && <Pills value={c.sectorMin} onChange={(v) => set({ sectorMin: v })} options={[[0.2, '20%+'], [0.3, '30%+'], [0.4, '40%+'], [0.6, '60%+'], [0.9, '90%+']]} />}
      </Box>
      <Box title="Cost per year, at most" term="expense-ratio">
        <Pills value={c.costMax} onChange={(v) => set({ costMax: v })} options={[[null, 'Any'], [0.0005, '0.05%'], [0.001, '0.10%'], [0.002, '0.20%'], [0.004, '0.40%'], [0.0075, '0.75%']]} />
      </Box>
      <Box title="Fund size, at least" term="fund-size">
        <Pills value={c.aumMin} onChange={(v) => set({ aumMin: v })} options={[[500e6, '$500M'], [1e9, '$1B'], [5e9, '$5B'], [10e9, '$10B'], [50e9, '$50B']]} />
      </Box>
      <Box title="Dividend yield, at least" term="dividend-yield">
        <Pills value={c.divMin} onChange={(v) => set({ divMin: v })} options={[[null, 'Any'], [0.01, '1%'], [0.02, '2%'], [0.03, '3%'], [0.04, '4%'], [0.06, '6%']]} />
      </Box>
      <Box title="1-year price change, at least" term="momentum">
        <Pills value={c.chg1yMin} onChange={(v) => set({ chg1yMin: v })} options={[[null, 'Any'], [0, '0%'], [0.1, '10%'], [0.2, '20%'], [0.3, '30%']]} />
      </Box>
      <Box title="Volatility (beta), at most" term="beta">
        <Pills value={c.betaMax} onChange={(v) => set({ betaMax: v })} options={[[null, 'Any'], [0.6, '0.6'], [0.8, '0.8'], [1.0, '1.0'], [1.2, '1.2']]} />
      </Box>
      <Box title="Past drops" term="pullback" q="Deepest fall from a high in ~2 years, no worse than">
        <Pills value={c.dropMax} onChange={(v) => set({ dropMax: v })} options={[[null, 'Any'], [0.1, '−10%'], [0.2, '−20%'], [0.3, '−30%'], [0.4, '−40%']]} />
      </Box>
      <Box title="Where the companies are" q="Share in US companies, at least">
        <Pills value={c.usMin} onChange={(v) => set({ usMin: v })} options={[[null, 'Any'], [0.5, '50%'], [0.9, '90%']]} />
      </Box>
      <Box title="Entry timing" term="buy-zone" q="Only show funds at a good moment to buy">
        <Pills value={c.entry} onChange={(v) => set({ entry: v })} options={[['any', 'Any'], ['zone', 'In a buy zone'], ['bouncing', 'Buy zone · bouncing'], ['off10', '10%+ off high'], ['off20', '20%+ off high']]} />
      </Box>
      <Box title="Leveraged and inverse funds" term="leveraged-etf">
        <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" checked={c.showLev} onChange={(e) => set({ showLev: e.target.checked })} /> Show them (hidden by default)</label>
      </Box>
    </Panel>
  )

  return (
    <div className="grid gap-5 grid-cols-[minmax(0,1fr)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ETF finder</h1>
        <p className="text-[13.5px] text-muted mt-1 max-w-3xl">
          {d.etfs.length.toLocaleString()} US-listed <Term id="etf">ETFs</Term> over $500M. Funds hold many companies, so there's no moat, fair value or P/E here:
          choose on cost, size, what the fund holds, dividends, past swings and entry timing. Add any to your stock cart; My portfolio scores stocks and ETFs together.
        </p>
      </div>

      <div className="grid gap-2">
        <div className="label">Presets</div>
        <div className="flex flex-wrap gap-2">
          {ETF_PRESETS.map((p) => (
            <button key={p.id} title={p.hint} onClick={() => set({ ...ETF_BLANK, ...p.set })}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${same(p) ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:border-fg/30'}`}>{p.label}</button>
          ))}
        </div>
        {ETF_PRESETS.find(same) && <div className="text-[12.5px] text-muted">{ETF_PRESETS.find(same).hint}.</div>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
        <div className="lg:hidden"><button className="btn w-full justify-center" onClick={() => setShowBoxes(!showBoxes)}><SlidersHorizontal size={14} /> {showBoxes ? 'Hide the boxes' : 'Change the boxes'}</button></div>
        <div className={showBoxes ? '' : 'hidden lg:block'}>{boxes}</div>

        <Panel pad={false} className="min-w-0" title={`${rows.length.toLocaleString()} matching ETFs`} subtitle={summary.length ? summary.join(' · ') : 'No boxes set: every ETF over $500M (leveraged and inverse hidden).'}>
          {loading ? <Empty title="ETF data is loading">The ETF list is being downloaded for the first time. Check back shortly.</Empty>
            : rows.length === 0 ? <Empty title="No ETFs match">Loosen one of the boxes.</Empty> : (
            <div className="overflow-x-auto max-h-[75vh]">
              <table className="grid-table">
                <thead><tr>
                  <th className="w-8" title="Add to the stock cart" />
                  {th('symbol', 'ETF', 'text-left!')}
                  {th('category', 'Kind', 'text-left!')}
                  {th('setupRank', <>Entry<Info id="buy-zone" /></>, 'text-left!')}
                  {th('expenseRatio', <>Cost<Info id="expense-ratio" /></>)}
                  {th('aum', <>Size<Info id="fund-size" /></>)}
                  {th('dividendYield', <>Div.<Info id="dividend-yield" /></>)}
                  {th('chg1y', <>1 yr<Info id="momentum" /></>)}
                  {th('offHigh', <>Off high<Info id="off-high" /></>)}
                  {th('pullbackMax', <>Worst drop<Info id="pullback" /></>)}
                  {th('beta', <>Beta<Info id="beta" /></>)}
                  {th('topSectorWeight', 'Top sector', 'text-left!')}
                  {th('price', 'Price')}
                </tr></thead>
                <tbody>
                  {sorted.slice(0, limit).map((e) => (
                    <tr key={e.symbol} className="cursor-pointer" onClick={() => navigate(`/stock/${e.symbol}`)} title={`Open ${e.symbol}`}>
                      <td className="w-8 pr-0!"><PortfolioButton symbol={e.symbol} /></td>
                      <td className="max-w-[240px] text-left!">
                        <Link to={`/stock/${e.symbol}`} onClick={(ev) => ev.stopPropagation()} className="font-semibold text-accent hover:underline">{e.symbol}</Link>
                        <div className="text-[12px] text-muted truncate">{e.name}</div>
                      </td>
                      <td className="text-left! text-[12.5px] whitespace-nowrap">{e.category}</td>
                      <td className="text-left!">{e.setup ? <SetupChip setup={e.setup} /> : '—'}</td>
                      <td className="num">{e.expenseRatio == null ? '—' : fp(e.expenseRatio, 2)}</td>
                      <td className="num">{cap(e.aum)}</td>
                      <td className="num">{e.dividendYield ? fp(e.dividendYield, 1) : '—'}</td>
                      <td className={`num ${e.chg1y > 0 ? 'text-gain' : e.chg1y < 0 ? 'text-loss' : ''}`}>{fp(e.chg1y)}</td>
                      <td className="num">{fp(e.offHigh)}</td>
                      <td className="num">{fp(e.pullbackMax)}</td>
                      <td className="num">{fn(e.beta, 2)}</td>
                      <td className="text-left! text-[12.5px] whitespace-nowrap">{e.topSector ? `${e.topSector} ${fp(e.topSectorWeight)}` : '—'}</td>
                      <td className="num">{usd(e.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sorted.length > limit && <div className="p-4 text-center"><button className="btn" onClick={() => setLimit(limit + 200)}>Show more ({sorted.length - limit} left)</button></div>}
            </div>
          )}
        </Panel>
      </div>
      <p className="text-[12.5px] text-faint px-1">
        {withPrices < d.etfs.length && d.etfs.length > 0 ? `Price history still loading for ${(d.etfs.length - withPrices).toLocaleString()} funds (entry timing, returns and drops fill in as it arrives). ` : ''}
        Click a row for the chart, Fibonacci buy levels and the fund's sector and country mix. Bookmark this page to keep the same boxes. Not investment advice.
      </p>
    </div>
  )
}
