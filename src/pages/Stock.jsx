import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, ExternalLink } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useData } from '@/lib/data'
import { DEMO, supabase } from '@/lib/supabase'
import { Panel, Badge, Empty } from '@/components/ui'
import { STATUS, Verdict, fx, fp, fn, usd, cap } from '@/components/pillarUi'
import { PILLARS, marginTier } from '@shared/pillars.js'
import { date as fdate } from '@/lib/format'

export default function Stock() {
  const { symbol } = useParams()
  const d = useData()
  const s = d.bySymbol[symbol?.toUpperCase()]
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!s) return
    if (DEMO) { setDetail({ metrics: s.metricsSample || null, prices: s.pricesSample || [] }); return }
    Promise.all([
      supabase.from('scr_stocks').select('metrics').eq('symbol', s.symbol).single(),
      supabase.from('scr_prices').select('dates,closes').eq('symbol', s.symbol).maybeSingle(),
    ]).then(([m, p]) => setDetail({
      metrics: m.data?.metrics || null,
      prices: p.data ? p.data.dates.map((dt, i) => ({ date: dt, close: p.data.closes[i] })) : [],
    }))
  }, [s?.symbol]) // eslint-disable-line

  if (!s) return <Empty title={`${symbol} isn't in the screener`}>It may be below $500M market cap, not US-listed, an ETF, or its data hasn't loaded yet.</Empty>
  const e = s.eval
  const m = detail?.metrics

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/" className="text-[13px] text-muted hover:text-fg inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Screener</Link>
          <h1 className="text-2xl font-semibold tracking-tight flex flex-wrap items-center gap-2">
            {s.symbol} <span className="text-muted font-normal text-lg">{s.name}</span>
          </h1>
          <div className="text-[13px] text-muted mt-1">{s.sector} · {s.industry} · {cap(s.marketCap)}{s.ipoDate ? ` · listed ${s.ipoDate.slice(0, 4)}` : ''}</div>
        </div>
        <div className="text-right">
          <div className="num text-2xl font-semibold">{usd(s.price)}</div>
          <div className="text-[12.5px] text-muted">close {fdate(s.priceDate)}</div>
          <div className="mt-2 flex flex-wrap justify-end gap-2 items-center">
            <Verdict e={e} />
            {s.owned ? <Badge tone="accent">Owned · {fn(s.shares, 2)} sh</Badge>
              : s.watch ? <Badge>On watchlist</Badge>
              : <button className="btn" onClick={() => d.addToWatchlist(s)}><Plus size={14} /> Add to watchlist</button>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="Mandate fit" subtitle={e.firstFail ? 'The first failed pillar stops the verdict; the rest are shown for context.' : e.overall === 'incomplete' ? `Missing data: ${e.missing.join(', ')}` : 'Every hard pillar passes.'}>
          <ul className="grid gap-2">
            {PILLARS.map(([k, label]) => {
              const p = e.pillars[k]
              return (
                <li key={k} className={`flex gap-3 items-start rounded-lg px-3 py-2 ${k === e.firstFail ? 'ring-1 ring-loss/40' : ''}`}>
                  <span className={`shrink-0 mt-0.5 rounded px-1.5 py-px text-[11px] font-semibold w-16 text-center ${STATUS[p.status].soft}`}>{STATUS[p.status].label}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-[13.5px]">{label}</div>
                    <div className="text-[13px] text-muted">{p.why}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
        <MoatPanel s={s} />
      </div>

      <FibPanel s={s} prices={detail?.prices} />

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="EPS lens and value" subtitle={`Forward P/E uses the ${fdate(s.priceDate)} close of ${usd(s.price)}.`}>
          <Rows rows={[
            ['Forward P/E (next 12 months)', fx(s.forwardPE)],
            ['Next-12-month EPS (consensus)', s.ntmEps == null ? '—' : `$${s.ntmEps.toFixed(2)}`],
            ['Expected EPS growth / year', fp(s.epsGrowth, 1)],
            ['PEG', fx(s.peg, 2)],
            ['GAAP EPS, trailing 12 months', s.epsTtm == null ? '—' : `$${s.epsTtm.toFixed(2)}${s.gaapLossTtm ? ' (loss)' : ''}`],
            ['GAAP EPS growth, last fiscal year', fp(s.gaapEpsGrowthLastFy, 1)],
            ['Trailing P/E vs own 5-yr average', s.peTtm == null ? '—' : `${fx(s.peTtm)} vs ${fx(s.pe5yAvg)} (${fp(s.peVs5y, 0)})`],
            ['FMP DCF value', s.dcf == null ? '—' : `${usd(s.dcf)} (${fp(s.dcfUpside, 0)} vs price)`],
          ]} />
          {m?.estimates && (
            <div className="mt-3 text-[12.5px] text-muted">
              Consensus EPS: {['fy0', 'fy1', 'fy2'].filter((k) => m.estimates[k]).map((k) => `FY${m.estimates[k].date.slice(0, 4)} $${m.estimates[k].eps.toFixed(2)}`).join(' · ')}
              {m.estimates.fy1?.analysts ? ` · ${m.estimates.fy1.analysts} analysts` : ''}
              {m.epsGrowthBasis && <div>Growth basis: {m.epsGrowthBasis}.</div>}
            </div>
          )}
        </Panel>
        <Panel title="EBITDA lens and debt">
          <Rows rows={[
            ['EBITDA margin (TTM)', `${fp(s.ebitdaMargin, 1)} · ${marginTier(s.ebitdaMargin)}`],
            ['EV / EBITDA', fx(s.evToEbitda)],
            ['EBITDA growth, last fiscal year', fp(s.ebitdaGrowth, 1)],
            ['Net debt / EBITDA', s.netDebtToEbitda != null && s.netDebtToEbitda < 0 ? 'Net cash' : fx(s.netDebtToEbitda)],
            ['Interest coverage', fx(s.interestCoverage)],
            ['Piotroski F-Score (0–9)', fn(s.piotroski)],
            ['Altman Z-Score', s.altmanZ == null ? '—' : `${s.altmanZ.toFixed(1)} ${s.altmanZ < 1.8 ? '(distress zone)' : s.altmanZ < 3 ? '(grey zone)' : '(safe zone)'}`],
            ['Magic Formula rank', s.magicRank ? `#${s.magicRank} of ${s.magicOf}` : 'n/a (financials/utilities or missing data)'],
          ]} />
        </Panel>
        <FitPanel s={s} />
      </div>

      <Panel title="Recent financing (last 90 days)" subtitle="Stock sales, converts and at-the-market programs fail pillar 6. Plain bond issues don't.">
        {m?.recentRaises?.length || m?.recentShelves?.length ? (
          <ul className="grid gap-1.5 text-[13.5px]">
            {[...(m.recentRaises || []), ...(m.recentShelves || []).map((x) => ({ ...x, kind: 'shelf' }))].map((f) => (
              <li key={f.link} className="flex flex-wrap gap-x-3">
                <span className="num text-muted">{f.date}</span><span className="font-semibold">{f.form}</span>
                <span>{{ equity: 'Stock offering', convert: 'Convertible', atm: 'At-the-market program', debt: 'Bond issue', shelf: 'Shelf registration', unknown: 'Type unclear', unread: 'Not read yet' }[f.kind] || f.kind}</span>
                <a href={f.link} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-1">SEC filing <ExternalLink size={12} /></a>
              </li>
            ))}
          </ul>
        ) : <div className="text-muted text-[13.5px]">{m ? 'No offering or shelf filings.' : 'Loading…'}</div>}
      </Panel>
      <p className="text-[12.5px] text-faint">Data from Financial Modeling Prep; fundamentals refreshed {s.fundamentalsAt ? fdate(s.fundamentalsAt) : 'n/a'}. Not investment advice.</p>
    </div>
  )
}

function Rows({ rows }) {
  return (
    <dl className="grid gap-1.5 text-[13.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-line/60 pb-1.5 last:border-0">
          <dt className="text-muted">{k}</dt><dd className="num text-right">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function MoatPanel({ s }) {
  const d = useData()
  const o = d.overrides[s.symbol]
  const [val, setVal] = useState(o?.moat ?? '')
  const [note, setNote] = useState(o?.note ?? '')
  const parts = s.moatParts || []
  return (
    <Panel title={`Moat ${s.moatUsed ?? '—'}/10`} subtitle={o ? `Your override (calculated: ${s.moat?.score ?? '—'}).` : 'Calculated from 5 years of FMP data.'}>
      <table className="w-full text-[13px]">
        <tbody>
          {parts.map((p) => (
            <tr key={p.label} className="border-b border-line/60 last:border-0">
              <td className="py-1.5 pr-2">{p.label}<div className="text-[12px] text-muted">{p.detail}</div></td>
              <td className="py-1.5 num text-right whitespace-nowrap font-semibold">{p.pts} / {p.max}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 grid gap-2">
        <div className="text-[12.5px] font-semibold text-muted">Override the score</div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={val} onChange={(e) => setVal(e.target.value)}>
            <option value="">Use calculated</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input className="input flex-1 min-w-40" placeholder="Why (e.g. choke point in…)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary" onClick={() => d.saveOverride(s.symbol, val === '' ? null : Number(val), note)}>Save</button>
        </div>
        <div className="text-[12px] text-faint">The calculation measures the results of a moat (returns and margins), so it can miss a true choke point or over-rate a few strong years.</div>
      </div>
    </Panel>
  )
}

function FibPanel({ s, prices }) {
  const f = s.fib
  const data = useMemo(() => (prices || []).slice(-260), [prices])
  if (!f) return <Panel title="Entry levels (Fibonacci)"><div className="text-muted text-[13.5px]">Not enough price history yet.</div></Panel>
  const hi = f.swingHigh.price, lo = f.swingLow.price
  return (
    <Panel title="Entry levels (Fibonacci)" subtitle={`Swing low ${usd(lo)} on ${fdate(f.swingLow.date)} → swing high ${usd(hi)} on ${fdate(f.swingHigh.date)} (daily closes). Range ${usd(f.range)}.`}>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-64">
          {data.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => v.slice(5)} minTickGap={40} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={56} tickFormatter={(v) => `$${v.toFixed(0)}`} />
                <Tooltip formatter={(v) => usd(v)} labelFormatter={(l) => fdate(l)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 12 }} />
                {f.levels.map((l) => <ReferenceLine key={l.ratio} y={l.price} stroke="var(--accent)" strokeDasharray="4 3" label={{ value: `${(l.ratio * 100).toFixed(1)}%`, position: 'insideRight', fontSize: 10, fill: 'var(--accent)' }} />)}
                <Line dataKey="close" dot={false} stroke="var(--c-stocks)" strokeWidth={1.6} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-muted text-[13px]">Loading chart…</div>}
        </div>
        <div>
          <table className="w-full text-[13px]">
            <thead><tr className="text-muted text-[11px] uppercase tracking-wider"><th className="text-left pb-1">Level</th><th className="text-left pb-1">Calculation</th><th className="text-right pb-1">Price</th><th className="text-right pb-1">vs now</th></tr></thead>
            <tbody>
              {f.levels.map((l) => (
                <tr key={l.ratio} className={`border-t border-line/60 ${f.nextSupport?.ratio === l.ratio ? 'font-semibold text-accent' : ''}`}>
                  <td className="py-1.5 num">{(l.ratio * 100).toFixed(1)}%</td>
                  <td className="py-1.5 num text-muted text-[12px]">{hi.toFixed(2)} − {l.ratio} × {f.range.toFixed(2)}</td>
                  <td className="py-1.5 num text-right">{usd(l.price)}</td>
                  <td className="py-1.5 num text-right">{fp(l.price / s.price - 1, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-[12.5px] text-muted grid gap-1">
            {f.widened && <div>The 52-week leg was broken, so the swing low is the lowest close in the last ~2 years.</div>}
            <div>Next support below the price: {f.nextSupport ? `${(f.nextSupport.ratio * 100).toFixed(1)}% at ${usd(f.nextSupport.price)}` : f.belowSwing ? `none: the price is below the swing low (${usd(lo)}), a new low for this period` : 'none (below the swing low)'}</div>
            <div>Retraced {fp(f.retraced, 0)} of the swing · RSI(14) {fn(s.rsi14)} · 50-day avg {usd(s.sma50)} · 200-day avg {usd(s.sma200)}</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function FitPanel({ s }) {
  const d = useData()
  const guidePct = 0.03
  const guide = d.book * guidePct
  const drop = s.beta != null ? Math.max(-0.95, -0.25 * s.beta) : null
  const holdingValue = s.shares * (s.price || 0)
  // Theme exposure: what you already own in the same industry and sector.
  const same = d.stocks.filter((x) => x.owned && x.symbol !== s.symbol)
  const ind = same.filter((x) => x.industry === s.industry)
  const sec = same.filter((x) => x.sector === s.sector)
  const val = (list) => list.reduce((a, x) => a + x.shares * x.price, 0)
  return (
    <Panel title="Portfolio fit" subtitle="From your Life Ledger positions.">
      <Rows rows={[
        ['Stock book (individual stocks)', usd(d.book)],
        ['Satellite guide (3% of book)', usd(guide)],
        ['Your position now', s.owned ? `${usd(holdingValue)} (${fp(holdingValue / d.book, 1)} of book)` : 'None'],
        ['Same industry already owned', ind.length ? `${ind.map((x) => x.symbol).join(', ')} · ${usd(val(ind))}` : 'None'],
        ['Same sector already owned', sec.length ? `${sec.length} stocks · ${usd(val(sec))} (${fp(val(sec) / d.book, 0)})` : 'None'],
        ['Crash test: QQQ −25% × beta ' + fn(s.beta, 2), drop == null ? '—' : `${fp(drop, 0)} ≈ ${usd(guide * drop)} on a guide-size position`],
      ]} />
      <div className="text-[12px] text-faint mt-3">The crash test is a beta estimate, not a forecast; high-multiple names often fall more than beta implies. Funding source for any buy is your call.</div>
    </Panel>
  )
}
