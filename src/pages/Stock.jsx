import PortfolioButton from '@/components/PortfolioButton'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Check, X } from 'lucide-react'
import PriceChart from '@/components/PriceChart'
import PlanPanel from '@/components/PlanPanel'
import Term from '@/components/Term'
import { CompanyPanel, NewsPanel, AiPanel } from '@/components/CompanyPanels'
import { useData, canonical } from '@/lib/data'
import { DEMO, supabase } from '@/lib/supabase'
import { Panel, Badge, Empty } from '@/components/ui'
import { fx, fp, fn, usd, cap } from '@/components/pillarUi'
import { marginTier } from '@shared/pillars.js'
import { checks } from '@shared/criteria.js'
import { MOAT_SOURCES } from '@shared/crossSection.js'
import { date as fdate } from '@/lib/format'

const CHECK_TERM = { themes: null, moatMin: 'moat', debtMax: 'net-debt-ebitda', pe: 'forward-pe', pegMax: 'peg', growthMin: 'eps-growth', marginMin: 'ebitda-margin', profitable: 'gaap-adjusted', noDilution: 'financing', capMin: 'market-cap', betaMax: 'beta', aiRiskMax: 'ai-risk', entry: 'buy-zone' }
const MOAT_TERM = { 'Return on operating capital': 'roic', Durability: 'durability', Consistency: 'track-record', 'Pricing power': 'gross-margin', 'Margin premium over peers': 'margin-premium', Erosion: 'erosion', 'Loss years': 'loss-years' }

export default function Stock() {
  const { symbol } = useParams()
  const d = useData()
  const s = d.bySymbol[canonical(symbol)]
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

  const waiting = !s && d.pending?.find((p) => p.symbol === symbol?.toUpperCase())
  if (waiting) return <Empty title={`${waiting.symbol} · ${waiting.name || ''}`}>This stock is in the screener, but its financials are still downloading (the first full load of all 2,350+ stocks takes a few hours). Check back later; nothing needs doing on your side.</Empty>
  if (!s) return <Empty title={`${symbol} isn't in the screener`} action={<Link className="btn" to="/lookup">Look up another stock</Link>}>It may be below $500M market cap, not listed in the US, an ETF, or its data hasn't loaded yet.</Empty>
  const screenChecks = checks(s, d.screen)
  const fits = screenChecks.length ? screenChecks.every((k) => k.ok) : null
  const m = detail?.metrics

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/results" className="text-[13px] text-muted hover:text-fg inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Results</Link>
          <h1 className="text-2xl font-semibold tracking-tight flex flex-wrap items-center gap-2">
            {s.symbol} <span className="text-muted font-normal text-lg">{s.name}</span>
          </h1>
          <div className="text-[13px] text-muted mt-1">{s.sector} · {s.industry} · {cap(s.marketCap)}{s.ipoDate ? ` · listed ${s.ipoDate.slice(0, 4)}` : ''}</div>
        </div>
        <div className="text-right">
          <div className="num text-2xl font-semibold">{usd(s.price)}</div>
          <div className="text-[12.5px] text-muted">close {fdate(s.priceDate)}</div>
          <div className="mt-2 flex flex-wrap justify-end gap-2 items-center">
            <PortfolioButton symbol={s.symbol} full />
            {fits != null && <Badge tone={fits ? 'gain' : 'loss'}>{fits ? 'Matches your screen' : `Misses ${screenChecks.filter((k) => !k.ok).length} of ${screenChecks.length} screen boxes`}</Badge>}
          </div>
        </div>
      </div>

      <PlanPanel s={s} />

      <CompanyPanel s={s} metrics={m} />

      <AiPanel s={s} />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <ScreenPanel checks={screenChecks} fits={fits} />
        <MoatPanel s={s} />
      </div>

      <FibPanel s={s} prices={detail?.prices} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="EPS lens and value" subtitle={`Forward P/E uses the ${fdate(s.priceDate)} close of ${usd(s.price)}.`}>
          <Rows rows={[
            ['Forward P/E (next 12 months)', fx(s.forwardPE), 'forward-pe'],
            ['Next-12-month EPS (consensus)', s.ntmEps == null ? '—' : `$${s.ntmEps.toFixed(2)}`, 'ttm-ntm'],
            ['Expected EPS growth / year', fp(s.epsGrowth, 1), 'eps-growth'],
            ['PEG', fx(s.peg, 2), 'peg'],
            ['GAAP EPS, trailing 12 months', s.epsTtm == null ? '—' : `$${s.epsTtm.toFixed(2)}${s.gaapLossTtm ? ' (loss)' : ''}`, 'gaap-adjusted'],
            ['GAAP EPS growth, last fiscal year', fp(s.gaapEpsGrowthLastFy, 1), 'eps'],
            ['Trailing P/E vs own 5-yr average', s.peTtm == null ? '—' : `${fx(s.peTtm)} vs ${fx(s.pe5yAvg)} (${fp(s.peVs5y, 0)})`, 'pe-5y'],
            ['FMP DCF value', s.dcf == null ? '—' : `${usd(s.dcf)} (${fp(s.dcfUpside, 0)} vs price)`, 'dcf'],
          ]} />
          {m?.estimates && (
            <div className="mt-3 text-[12.5px] text-muted">
              Consensus EPS: {['fy0', 'fy1', 'fy2'].filter((k) => m.estimates[k]).map((k) => `FY${m.estimates[k].date.slice(0, 4)} $${m.estimates[k].eps.toFixed(2)}`).join(' · ')}
              {m.estimates.fy1?.analysts ? ` · ${m.estimates.fy1.analysts} analysts` : ''}
              {m.epsGrowthBasis && <div>Growth basis: {m.epsGrowthBasis}.</div>}
            </div>
          )}
        </Panel>
        <Panel title="Profit, cash and debt">
          <Rows rows={[
            ['Sales growth, last year', fp(s.revenueGrowth, 1), 'revenue-growth'],
            ['Sales growth, 3 years (a year)', fp(s.revenueGrowth3y, 1), 'revenue-growth'],
            ['Free cash flow margin (TTM)', fp(s.fcfMargin, 1), 'free-cash-flow'],
            ['Free cash flow yield (TTM)', fp(s.fcfYield, 1), 'fcf-yield'],
            ['Dividend yield', s.dividendYield ? `${fp(s.dividendYield, 2)}${s.payoutRatio > 0 ? ` · pays out ${fp(s.payoutRatio, 0)} of profit` : ''}` : 'No dividend', 'dividend-yield'],
            ['EBITDA margin (TTM)', `${fp(s.ebitdaMargin, 1)} · ${marginTier(s.ebitdaMargin)}`, 'ebitda-margin'],
            ['EV / EBITDA', fx(s.evToEbitda), 'ev-ebitda'],
            ['EBITDA growth, last fiscal year', fp(s.ebitdaGrowth, 1), 'ebitda'],
            ['Net debt / EBITDA', s.netDebtToEbitda != null && s.netDebtToEbitda < 0 ? 'Net cash' : fx(s.netDebtToEbitda), 'net-debt-ebitda'],
            ['Interest coverage', fx(s.interestCoverage), 'interest-coverage'],
            ['Piotroski F-Score (0–9)', fn(s.piotroski), 'piotroski'],
            ['Altman Z-Score', s.altmanZ == null ? '—' : `${s.altmanZ.toFixed(1)} ${s.altmanZ < 1.8 ? '(distress zone)' : s.altmanZ < 3 ? '(grey zone)' : '(safe zone)'}`, 'altman'],
            ['Magic Formula rank', s.magicRank ? `#${s.magicRank} of ${s.magicOf}` : 'n/a (financials/utilities or missing data)', 'magic-formula'],
          ]} />
        </Panel>
      </div>

      <Panel title="Recent financing (last 90 days)" subtitle={'Stock sales, convertibles and at-the-market programs dilute shareholders; plain bond issues don\'t. The "No recent share sales" option rules out the first three.'}>
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
      <NewsPanel s={s} />
      <p className="text-[12.5px] text-faint">Data from Financial Modeling Prep; fundamentals refreshed {s.fundamentalsAt ? fdate(s.fundamentalsAt) : 'n/a'}. Not investment advice.</p>
    </div>
  )
}

function Rows({ rows }) {
  return (
    <dl className="grid gap-1.5 text-[13.5px]">
      {rows.map(([k, v, id]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-line/60 pb-1.5 last:border-0">
          <dt className="text-muted">{id ? <Term id={id}>{k}</Term> : k}</dt><dd className="num text-right">{v}</dd>
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
    <Panel title={`Moat ${s.moatUsed ?? '—'}/10`} subtitle={o ? `Your own score. Otherwise it would be ${s.moatBlend ?? 'none'}.`
      : s.moatReview ? `${s.moatReview.rating}/10 business assessment (60%) + ${s.moat?.score ?? 'no'} from the numbers (40%).`
      : s.moat?.score == null ? (s.moat?.reason || 'No calculated score.') : 'From up to 10 years of annual reports. No written assessment yet.'}>
      {s.moatReview && (
        <div className="mb-4 pb-4 border-b border-line">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[12.5px] font-semibold"><Term id="moat-sources">Business assessment</Term> · {s.moatReview.rating}/10</div>
            <div className="text-[11.5px] text-faint">{s.moatReview.rated_by}, {fdate(s.moatReview.rated_at)}</div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {MOAT_SOURCES.map(([k, label]) => {
              const v = s.moatReview.sources?.[k] ?? 0
              return <span key={k} className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${v === 2 ? 'bg-gain-soft text-gain' : v === 1 ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-faint'}`}>{label}: {['none', 'some', 'strong'][v]}</span>
            })}
          </div>
          <p className="text-[13px] mt-2 leading-relaxed">{s.moatReview.why}</p>
        </div>
      )}
      {parts.length > 0 && <div className="text-[12.5px] font-semibold mb-1">From the numbers · {s.moat?.score}/8</div>}
      <table className="w-full text-[13px]">
        <tbody>
          {parts.map((p) => (
            <tr key={p.label} className="border-b border-line/60 last:border-0">
              <td className="py-1.5 pr-2"><Term id={MOAT_TERM[p.label]}>{p.label}</Term><div className="text-[12px] text-muted">{p.detail}</div></td>
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
        <div className="text-[12px] text-faint">The numbers measure the results of a moat (returns and margins) and stop at 8; the written assessment judges where the advantage comes from. Combined scores stop at 9: a 10 is yours to set.</div>
      </div>
    </Panel>
  )
}

function FibPanel({ s, prices }) {
  const f = s.fib
  const hi = f?.swingHigh.price, lo = f?.swingLow.price
  const ma = (v) => { if (v == null || !s.price) return ''; const g = s.price / v - 1; return ` · price is ${fp(Math.abs(g), 1)} ${g >= 0 ? 'above' : 'below'}` }
  return (
    <Panel title="Chart, moving averages and Fibonacci entry levels"
      subtitle={f ? `Swing low ${usd(lo)} on ${fdate(f.swingLow.date)} → swing high ${usd(hi)} on ${fdate(f.swingHigh.date)}, daily closes. The highlighted dashed line is the next support below the price.` : 'Not enough price history yet for Fibonacci levels.'}>
      <PriceChart prices={prices} fib={f} />
      {f && (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] mt-5 pt-4 border-t border-line">
          <table className="w-full text-[13px]">
            <thead><tr className="text-muted text-[11px] uppercase tracking-wider"><th className="text-left pb-1">Level</th><th className="text-left pb-1 hidden sm:table-cell">Calculation</th><th className="text-right pb-1">Price</th><th className="text-right pb-1">vs now</th></tr></thead>
            <tbody>
              {f.levels.map((l) => (
                <tr key={l.ratio} className={`border-t border-line/60 ${f.nextSupport?.ratio === l.ratio ? 'font-semibold text-accent' : ''}`}>
                  <td className="py-1.5 num">{(l.ratio * 100).toFixed(1)}%{l.ratio === 1 ? ' (swing low)' : ''}</td>
                  <td className="py-1.5 num text-muted text-[12px] hidden sm:table-cell">{hi.toFixed(2)} − {l.ratio} × {f.range.toFixed(2)}</td>
                  <td className="py-1.5 num text-right">{usd(l.price)}</td>
                  <td className="py-1.5 num text-right">{fp(l.price / s.price - 1, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[13px] grid gap-1.5 content-start">
            <div><span className="text-muted"><Term id="fibonacci">Next support</Term>:</span> {f.nextSupport ? `${(f.nextSupport.ratio * 100).toFixed(1)}% at ${usd(f.nextSupport.price)} (${fp(f.nextSupport.price / s.price - 1, 1)})` : f.belowSwing ? `none, the price is below the swing low (${usd(lo)})` : 'none'}</div>
            <div><span className="text-muted">Retraced:</span> {fp(f.retraced, 0)} of the swing</div>
            <div><span className="text-muted"><Term id="sma-50">50-day average</Term>:</span> {usd(s.sma50)}{ma(s.sma50)}</div>
            <div><span className="text-muted"><Term id="sma-200">200-day average</Term>:</span> {usd(s.sma200)}{ma(s.sma200)}</div>
            <div><span className="text-muted"><Term id="rsi">RSI (14)</Term>:</span> {fn(s.rsi14)}{s.rsi14 < 30 ? ' · oversold' : s.rsi14 > 70 ? ' · overbought' : ''}</div>
            {f.widened && <div className="text-[12.5px] text-muted">The 52-week swing was broken, so the swing low is the lowest close in the last ~2 years.</div>}
            <div className="text-[12px] text-faint">Formula: level = swing high − ratio × (swing high − swing low).</div>
          </div>
        </div>
      )}
    </Panel>
  )
}

// How this stock does against each box of the visitor's current screen.
function ScreenPanel({ checks, fits }) {
  return (
    <Panel title="Your screen" subtitle={fits == null ? 'No boxes set yet.' : fits ? 'Passes every box you set.' : 'Misses at least one box you set.'}
      action={<Link to="/" className="btn btn-ghost text-[12.5px]">Change</Link>}>
      {checks.length ? (
        <ul className="grid gap-2">
          {checks.map((k) => (
            <li key={k.key} className="flex gap-3 items-start">
              <span className={`shrink-0 mt-0.5 rounded-full p-0.5 ${k.ok ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss'}`}>{k.ok ? <Check size={13} /> : <X size={13} />}</span>
              <div className="min-w-0 text-[13.5px]">
                <span className="font-semibold">{CHECK_TERM[k.key] ? <Term id={CHECK_TERM[k.key]}>{k.label}</Term> : k.label}</span>
                <span className="text-muted"> · {k.why}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13.5px] text-muted">Pick what matters to you in the <Link to="/" className="text-accent">Stock finder</Link>, and this panel shows how {`this stock`} measures up, box by box.</p>}
    </Panel>
  )
}
