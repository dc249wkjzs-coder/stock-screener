import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink, RefreshCw, ChevronDown, ArrowRight, LayoutGrid, List, X } from 'lucide-react'
import { useData } from '@/lib/data'
import { DEMO, supabase } from '@/lib/supabase'
import { Panel, Empty } from '@/components/ui'
import { usd, cap, fx, fp, SetupChip } from '@/components/pillarUi'
import { pct, ago, tone } from '@/lib/format'
import PortfolioButton from '@/components/PortfolioButton'
import Term, { Info } from '@/components/Term'
import { CALL_STYLE } from '@/components/PlanPanel'
import { TERMS } from '@/lib/glossary'
import { vixZone } from '@shared/market.js'
import { verdict } from '@shared/valuation.js'
import { groupedTreemap } from '@shared/treemap.js'

const REFRESH_MS = 120_000
const localTime = (iso, withDay) => new Date(iso).toLocaleString('en-US', withDay
  ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  : { hour: 'numeric', minute: '2-digit' })
const nyTime = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
const until = (iso) => {
  const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000))
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
const isIndexLike = (q) => q.sym.startsWith('^') || q.sym === 'ESUSD'
const fmtPrice = (q, v = q.price) => (v == null ? '—' : isIndexLike(q) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : usd(v))
const fmtChange = (q) => (q.change == null ? '—' : `${q.change > 0 ? '+' : ''}${q.change.toLocaleString('en-US', { maximumFractionDigits: Math.abs(q.change) >= 100 ? 0 : 2 })}`)
const bigNum = (v) => (v == null ? '—' : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(Math.round(v)))

// Right-hand watchlist, like a trading terminal's sidebar.
const WATCH = [
  ['Indices', ['^GSPC', '^IXIC', '^DJI', '^RUT', '^VIX']],
  ['Futures', ['ESUSD']],
  ['Commodities', ['GCUSD', 'SIUSD', 'BZUSD', 'USO', 'UNG', 'CPER']],
  ['Bonds, dollar and crypto', ['TLT', 'UUP', 'BTCUSD']],
]
const SHORT = { '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^DJI': 'Dow Jones', '^RUT': 'Russell 2000', '^VIX': 'VIX', ESUSD: 'S&P 500 fut.', GCUSD: 'Gold', SIUSD: 'Silver', BZUSD: 'Oil (Brent)', USO: 'Oil (WTI)', UNG: 'Natural gas', CPER: 'Copper', TLT: 'Treasuries', UUP: 'US dollar', BTCUSD: 'Bitcoin' }

// The lists above the map. Each builds the tiles: value = company size (market value, or fund size for ETFs).
const LISTS = [
  { id: 'all', label: 'All stocks', note: 'The 500 largest US-listed stocks' },
  { id: 'gainers', label: 'Top gainers', note: 'The 100 stocks up the most today (over $500M)' },
  { id: 'losers', label: 'Biggest losers', note: 'The 100 stocks down the most today (over $500M)' },
  { id: 'active', label: 'Most active', note: 'The 100 stocks with the most dollars traded today' },
  { id: 'high', label: '52-week high', note: 'Stocks within 2% of their 52-week high' },
  { id: 'low', label: '52-week low', note: 'Stocks within 2% of their 52-week low' },
  { id: 'industries', label: 'Industries', note: 'Every industry as one tile (all its companies added up); click one to see its companies' },
  { id: 'buyzone', label: 'Buy zone', note: 'Stocks sitting at a Fibonacci buy level now (wait or bouncing)' },
  { id: 'unusual', label: 'Unusual volume', note: 'Stocks trading at least twice their usual daily volume' },
  { id: 'etfs', label: 'ETFs', note: 'The 200 largest ETFs, grouped by kind (leveraged funds left out)' },
]

function buildList(id, d, moves, zoom) {
  if (id === 'etfs') {
    return d.etfs.filter((e) => !e.leveraged && moves.etfs[e.symbol] && e.aum > 0).sort((a, b) => b.aum - a.aum).slice(0, 200)
      .map((e) => ({ symbol: e.symbol, name: e.name, value: e.aum, chg: moves.etfs[e.symbol][0], price: moves.etfs[e.symbol][1], vol: moves.etfs[e.symbol][2], group: e.category, etf: true }))
  }
  const rows = d.stocks.filter((s) => moves.stocks[s.symbol] && s.marketCap > 0).map((s) => {
    const m = moves.stocks[s.symbol]
    return { symbol: s.symbol, name: s.name, value: s.marketCap, chg: m[0], price: m[1], vol: m[2], avgVol: m[3], group: s.sector || 'Other',
      industry: s.industry || 'Other', high52: s.high52, low52: s.low52, setup: s.setup?.status }
  })
  const byValue = (a, b) => b.value - a.value
  // Zoomed into one industry (from the Industries map): every company in it, whatever the list.
  if (zoom?.type === 'industry') return rows.filter((r) => r.industry === zoom.name).sort(byValue)
  if (id === 'industries') {
    const ind = {}
    for (const r of rows) {
      const I = (ind[r.industry] ||= { symbol: r.industry, label: r.industry, name: `${r.industry} (${r.group})`, value: 0, w: 0, n: 0, group: r.group, industryTile: true })
      I.value += r.value; I.w += r.value * r.chg; I.n++
    }
    return Object.values(ind).map((I) => ({ ...I, chg: I.w / I.value, price: null, name: `${I.label} · ${I.n} companies` }))
  }
  if (id === 'buyzone') return rows.filter((r) => r.setup === 'zone' || r.setup === 'zone-confirmed').sort(byValue)
  if (id === 'unusual') return rows.filter((r) => r.vol > 0 && r.avgVol > 0 && r.vol >= 2 * r.avgVol).sort((a, b) => b.vol / b.avgVol - a.vol / a.avgVol).slice(0, 100)
  if (id === 'all') return rows.sort(byValue).slice(0, 500)
  if (id === 'gainers') return rows.filter((r) => r.chg > 0).sort((a, b) => b.chg - a.chg).slice(0, 100)
  if (id === 'losers') return rows.filter((r) => r.chg < 0).sort((a, b) => a.chg - b.chg).slice(0, 100)
  if (id === 'active') return rows.filter((r) => r.vol > 0).sort((a, b) => b.vol * b.price - a.vol * a.price).slice(0, 100)
  if (id === 'high') return rows.filter((r) => r.high52 > 0 && r.price >= r.high52 * 0.98).sort(byValue).slice(0, 200)
  if (id === 'low') return rows.filter((r) => r.low52 > 0 && r.price <= r.low52 * 1.02).sort(byValue).slice(0, 200)
  return []
}

// Colour by today's move: red ← grey → green, full strength at ±3%. Fixed colours so white text reads in light and dark mode.
const STOPS = [[-0.03, [190, 45, 45]], [-0.015, [205, 80, 78]], [-0.005, [139, 72, 78]], [0, [72, 77, 90]], [0.005, [58, 120, 82]], [0.015, [47, 158, 90]], [0.03, [36, 176, 92]]]
function heatColor(chg) {
  if (chg == null) return 'rgb(72,77,90)'
  const c = Math.max(-0.03, Math.min(0.03, chg))
  for (let i = 1; i < STOPS.length; i++) {
    const [x1, a] = STOPS[i - 1], [x2, b] = STOPS[i]
    if (c <= x2) { const t = (c - x1) / (x2 - x1); return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})` }
  }
  return 'rgb(36,176,92)'
}

function useMarket() {
  const [state, setState] = useState({ loading: true, data: null, calendar: null, error: null })
  useEffect(() => {
    if (DEMO) {   // demo mode: a saved snapshot if one is bundled (public/market-sample.json), otherwise nothing
      fetch('/market-sample.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((data) => setState({ loading: false, data, calendar: data?.calendar || null, error: null }))
      return
    }
    let alive = true
    const load = () => supabase.from('scr_market').select('id,data').in('id', ['today', 'calendar'])
      .then(({ data, error }) => alive && setState({ loading: false, data: data?.find((r) => r.id === 'today')?.data || null,
        calendar: data?.find((r) => r.id === 'calendar')?.data || null, error: error?.message || null }))
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return state
}
function useWidth(ref) {
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}
const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches

function Status({ s, session }) {
  const map = {
    open: ['bg-gain', `US market open · closes ${nyTime(s.closesAt)} New York (${localTime(s.closesAt)} your time), in ${until(s.closesAt)}${s.earlyClose ? ' · early close today' : ''}`],
    pre: ['bg-warn', `Pre-market · opens ${localTime(s.nextOpen)} your time (9:30am New York), in ${until(s.nextOpen)}`],
    after: ['bg-warn', `After hours · closed at ${s.earlyClose ? '1:00pm' : '4:00pm'} New York · opens ${localTime(s.nextOpen, true)} your time`],
    closed: ['bg-faint', `${s.holiday ? `Closed for ${s.holiday}` : s.weekend ? 'Closed for the weekend' : 'Closed overnight'} · opens ${localTime(s.nextOpen, true)} your time${s.nextOpenEarlyClose ? ' (early close at 1:00pm New York that day)' : ''}`],
  }
  const [dot, text] = map[s.state] || map.closed
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="inline-flex items-center gap-2 rounded-full bg-surface border border-line px-3 py-1.5 font-medium"><span className={`w-2 h-2 rounded-full ${dot} ${s.state === 'open' ? 'animate-pulse' : ''}`} />{text}</span>
      {s.state !== 'open' && <span className="text-muted">Moves are for the last session, {dayName(session)}.</span>}
      <Term id="market-hours">Market hours</Term>
    </div>
  )
}

// Intraday chart with the previous close as a dashed line, coloured against that close.
function Spark({ data, base, h = 34 }) {
  if (!data || data.length < 2) return null
  const w = 120
  const vals = base != null ? [...data, base] : data
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1
  const y = (v) => h - 2 - ((v - min) / span) * (h - 4)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const color = data[data.length - 1] >= (base ?? data[0]) ? 'var(--gain)' : 'var(--loss)'
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      {base != null && <line x1="0" x2={w} y1={y(base)} y2={y(base)} stroke="var(--faint)" strokeDasharray="3 3" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Range({ low, high, now, label, q }) {
  if (low == null || high == null || now == null || high <= low) return null
  const p = Math.max(0, Math.min(100, ((now - low) / (high - low)) * 100))
  return (
    <div>
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="relative h-1.5 rounded-full bg-surface-2 mt-1"><div className="absolute -top-[3px] w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface" style={{ left: `calc(${p}% - 5px)` }} /></div>
      <div className="flex justify-between text-[11.5px] num mt-1"><span>{q ? fmtPrice(q, low) : usd(low)}</span><span>{q ? fmtPrice(q, high) : usd(high)}</span></div>
    </div>
  )
}

function Watchlist({ quotes, selected, onSelect }) {
  const [closed, setClosed] = useState({})
  const q = Object.fromEntries(quotes.map((x) => [x.sym, x]))
  return (
    <section className="card overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_76px_58px_58px] gap-1 px-4 pt-3 pb-1.5 text-[11px] font-semibold text-faint uppercase tracking-wide">
        <span>Symbol</span><span className="text-right">Last</span><span className="text-right">Chg</span><span className="text-right">Chg %</span>
      </div>
      {WATCH.map(([group, syms]) => (
        <div key={group} className="border-t border-line">
          <button className="w-full flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg" onClick={() => setClosed({ ...closed, [group]: !closed[group] })}>
            <ChevronDown size={13} className={`transition ${closed[group] ? '-rotate-90' : ''}`} />{group}
          </button>
          {!closed[group] && syms.map((s) => q[s]).filter(Boolean).map((x) => {
            const zone = x.sym === '^VIX' ? vixZone(x.price) : null
            return (
              <button key={x.sym} onClick={() => onSelect({ type: 'quote', sym: x.sym })}
                className={`w-full grid grid-cols-[minmax(0,1fr)_76px_58px_58px] gap-1 items-center px-4 py-1.5 text-[13px] text-left hover:bg-surface-2 ${selected?.sym === x.sym ? 'bg-accent-soft' : ''}`}>
                <span className="truncate font-medium">{SHORT[x.sym] || x.label}{x.via && <span className="text-[10px] text-faint font-normal"> · {x.sym}</span>}{zone && <span className={`ml-1.5 rounded px-1 text-[10px] font-semibold ${x.price >= 30 ? 'bg-loss-soft text-loss' : x.price >= 20 ? 'bg-warn-soft text-warn' : 'bg-gain-soft text-gain'}`}>{zone.label}</span>}</span>
                <span className="num text-right">{x.ok ? fmtPrice(x).replace('$', '') : '—'}</span>
                <span className={`num text-right ${tone(x.change)}`}>{x.via ? '' : fmtChange(x)}</span>
                <span className={`num text-right ${tone(x.chg)}`}>{pct(x.chg, { decimals: 2 })}</span>
              </button>
            )
          })}
        </div>
      ))}
      <p className="px-4 py-2.5 border-t border-line text-[11px] text-faint">Rows with a ticker (USO, UNG, CPER, TLT, UUP) are ETFs standing in for that market: read the % change. Click any row for details.</p>
    </section>
  )
}

function QuoteDetail({ q }) {
  const zone = q.sym === '^VIX' ? vixZone(q.price) : null
  const t = TERMS[q.term]
  return (
    <section className="card p-4 grid grid-cols-[minmax(0,1fr)] gap-3 min-w-0 overflow-hidden">
      <div>
        <div className="font-semibold">{q.label}{q.via && <span className="text-muted font-normal text-[13px]"> · via {q.via}</span>}</div>
        <div className="flex items-baseline gap-2 mt-1"><span className="num text-[26px] font-semibold">{fmtPrice(q)}</span><span className={`num font-semibold ${tone(q.chg)}`}>{q.via ? '' : `${fmtChange(q)} `}{pct(q.chg, { decimals: 2 })}</span></div>
        {q.unit && <div className="text-[11.5px] text-faint">{q.unit}</div>}
      </div>
      {q.spark && <div><Spark data={q.spark} base={q.prevClose} h={60} /><div className="text-[11px] text-faint mt-1">{q.sym === 'ESUSD' ? 'Last 24 hours, hourly' : 'Latest session, every 5 minutes'} · dashed line = previous close</div></div>}
      {zone && <div className={`rounded-lg px-3 py-2 text-[13px] ${q.price >= 30 ? 'bg-loss-soft' : q.price >= 20 ? 'bg-warn-soft' : 'bg-gain-soft'}`}><b>{zone.label}.</b> {zone.note} {q.chg > 0.005 ? 'Up today: investors are paying more for protection.' : q.chg < -0.005 ? 'Down today: worries are easing.' : ''}</div>}
      <Range low={q.dayLow} high={q.dayHigh} now={q.price} label="Day range" q={q} />
      <Range low={q.yearLow} high={q.yearHigh} now={q.price} label="52-week range" q={q} />
      {t && <p className="text-[12.5px] text-muted">{t.simple} <Link to={`/learn#${q.term}`} className="text-accent">More</Link></p>}
      {q.via && <Link to={`/stock/${q.sym}`} className="btn justify-center">Open {q.sym} <ArrowRight size={14} /></Link>}
    </section>
  )
}

// Last ~3 months of daily closes for the company card's mini chart.
function useCloses(symbol) {
  const [closes, setCloses] = useState(null)
  useEffect(() => {
    setCloses(null)
    if (DEMO || !symbol) return
    let alive = true
    supabase.from('scr_prices').select('closes').eq('symbol', symbol).maybeSingle()
      .then(({ data }) => alive && setCloses(data?.closes ? data.closes.slice(-63).map(Number) : null))
    return () => { alive = false }
  }, [symbol])
  return closes
}

function StockDetail({ s, m, cal }) {
  const etf = s.kind === 'etf'
  const closes = useCloses(s.symbol)
  const today = new Date().toISOString().slice(0, 10)
  const nextEarnings = cal?.earnings?.find((e) => e.symbol === s.symbol && (e.eps == null || e.date >= today))
  const rating = cal?.ratings?.find((r) => r.symbol === s.symbol)
  const insider = cal?.insiders?.filter((x) => x.symbol === s.symbol) || []
  const v = etf ? null : verdict(s)
  const price = m?.[1] ?? s.price
  const rows = etf ? [
    ['Kind', s.category], ['Cost per year', s.expenseRatio == null ? '—' : fp(s.expenseRatio, 2)], ['Fund size', cap(s.aum)],
    ['Dividend yield', s.dividendYield ? fp(s.dividendYield, 1) : '—'], ['1-year change', pct(s.chg1y)],
  ] : [
    ['Company value', cap(s.marketCap)], ['Moat', s.moatUsed ?? '—'], ['Fwd P/E', fx(s.forwardPE)], ['PEG', fx(s.peg, 2)],
    ['Fair value vs price', s.fair?.vsMid == null ? 'no verdict' : s.fair.vsMid < 0 ? `${fp(-s.fair.vsMid)} below middle` : `${fp(s.fair.vsMid)} above middle`],
    ['1-year change', pct(s.chg1y)],
  ]
  return (
    <section className="card p-4 grid grid-cols-[minmax(0,1fr)] gap-3 min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[17px]">{s.symbol}{etf && <span className="ml-1.5 text-[10px] font-bold text-accent">ETF</span>}</div>
          <div className="text-[12.5px] text-muted truncate">{s.name}</div>
          <div className="text-[11.5px] text-faint truncate">{etf ? s.issuer : `${s.sector || ''} · ${s.industry || ''}`}</div>
        </div>
        {v?.call && <span className={`mr-6 rounded-full px-2.5 py-0.5 text-[12px] font-bold uppercase ${CALL_STYLE[v.call].pill}`}>{v.call}</span>}
      </div>
      <div className="flex items-baseline gap-2"><span className="num text-[26px] font-semibold">{usd(price)}</span><span className={`num font-semibold ${tone(m?.[0])}`}>{pct(m?.[0], { decimals: 2 })} today</span></div>
      {m?.[2] > 0 && <div className="text-[12px] text-muted -mt-2">Volume today {bigNum(m[2])} shares{s.avgVolume ? ` · average ${bigNum(s.avgVolume)}` : ''}</div>}
      <table className="w-full text-[13px]"><tbody>
        {rows.map(([k, val]) => <tr key={k} className="border-t border-line/60"><td className="py-1.5 text-muted">{k}</td><td className="py-1.5 text-right num">{val}</td></tr>)}
        <tr className="border-t border-line/60"><td className="py-1.5 text-muted">Entry</td><td className="py-1.5 text-right">{s.setup ? <SetupChip setup={s.setup} /> : '—'}</td></tr>
      </tbody></table>
      {closes?.length > 5 && <div><Spark data={closes} h={50} /><div className="text-[11px] text-faint mt-1">Last 3 months, daily closes</div></div>}
      <Range low={s.low52} high={s.high52} now={price} label="52-week range" />
      {(nextEarnings || rating || insider.length > 0) && (
        <div className="grid gap-1.5 text-[12.5px] border-t border-line pt-3">
          {nextEarnings && <div><span className="text-muted">Earnings:</span> {fmtDay(nextEarnings.date)}{nextEarnings.eps != null ? <> · EPS {nextEarnings.eps} vs {nextEarnings.epsEst ?? '—'} expected <BeatMiss a={nextEarnings.eps} e={nextEarnings.epsEst} /></> : nextEarnings.epsEst != null ? ` · ${nextEarnings.epsEst} EPS expected` : ''}</div>}
          {rating && <div><span className="text-muted">Analyst:</span> {rating.firm} {rating.action === 'up' ? 'upgraded' : 'downgraded'} to {rating.to} ({fmtDay(rating.at)})</div>}
          {insider.length > 0 && <div><span className="text-muted">Insiders this week:</span> {insider.filter((x) => x.kind === 'buy').length} buys, {insider.filter((x) => x.kind === 'sell').length} sells</div>}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <Link to={`/stock/${s.symbol}`} className="btn btn-primary justify-center">Full page <ArrowRight size={14} /></Link>
        <PortfolioButton symbol={s.symbol} full />
      </div>
    </section>
  )
}

function MarketMap({ items, selected, onPick, onGroup }) {
  const ref = useRef(null)
  const width = useWidth(ref)
  const height = width < 640 ? Math.max(380, Math.round(width * 1.1)) : Math.round(Math.min(680, Math.max(460, width * 0.62)))
  const { groups, tiles } = useMemo(() => (width ? groupedTreemap(items, (x) => x.group, { x: 0, y: 0, w: width, h: height }) : { groups: [], tiles: [] }), [items, width, height])
  const [hover, setHover] = useState(null)
  return (
    <div ref={ref} className="relative w-full rounded-xl overflow-hidden bg-[rgb(30,32,38)]" style={{ height }} onMouseLeave={() => setHover(null)}>
      {groups.map((g) => g.showHeader && (
        <button key={g.name} onClick={() => onGroup?.(g.name)} title={onGroup ? `Zoom into ${g.name}` : undefined}
          className="absolute px-1.5 text-left text-[11px] font-semibold text-white/85 truncate leading-[18px] hover:text-white hover:underline" style={{ left: g.x, top: g.y, width: g.w, height: 18 }}>
          {g.name} <span className={g.chg >= 0 ? 'text-[rgb(120,220,150)]' : 'text-[rgb(255,140,140)]'}>{pct(g.chg, { decimals: 2 })}</span>
        </button>
      ))}
      {tiles.map((t) => {
        const text = t.label || t.symbol
        const fs = t.label ? Math.max(9, Math.min(16, Math.min(t.w / Math.max(6, text.length * 0.62), t.h / 3))) : Math.max(9, Math.min(26, Math.min(t.w / 4.2, t.h / 2.8)))
        const showSym = t.w > 26 && t.h > 16
        const showChg = t.w > 40 && t.h > 32
        const sel = selected === t.symbol
        return (
          <button key={t.symbol} onClick={() => onPick(t.symbol)} onMouseEnter={() => setHover(t)}
            className={`absolute grid place-content-center text-center text-white overflow-hidden leading-tight hover:brightness-125 ${sel ? 'z-10 outline-2 outline-white -outline-offset-2' : ''}`}
            style={{ left: t.x + 0.5, top: t.y + 0.5, width: Math.max(0, t.w - 1), height: Math.max(0, t.h - 1), background: heatColor(t.chg) }}>
            {showSym && <span className={`font-bold ${t.label ? 'px-1 line-clamp-2' : ''}`} style={{ fontSize: fs }}>{text}</span>}
            {showChg && <span className="num opacity-90" style={{ fontSize: Math.max(9, fs * 0.62) }}>{pct(t.chg, { decimals: 2 })}</span>}
          </button>
        )
      })}
      {hover && (
        <div className="absolute z-20 pointer-events-none rounded-lg bg-surface text-fg shadow-lg border border-line px-3 py-2 text-[12.5px] max-w-[240px]"
          style={{ left: Math.max(0, Math.min(hover.x + hover.w / 2, width - 250)), top: Math.min(hover.y + hover.h + 4, height - 90) }}>
          <div className="font-semibold">{hover.label || hover.symbol} <span className={`num ${tone(hover.chg)}`}>{pct(hover.chg, { decimals: 2 })}</span></div>
          <div className="text-muted truncate">{hover.industryTile ? `${hover.n} companies · click to see them` : hover.name}</div>
          <div className="num">{hover.price != null ? `${usd(hover.price)} · ` : ''}{cap(hover.value)}{hover.avgVol > 0 && hover.vol > 0 ? ` · ${(hover.vol / hover.avgVol).toFixed(1)}× usual volume` : ''}</div>
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-0.5 text-[11px]">
      {[-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03].map((c) => (
        <span key={c} className="num text-white px-1.5 py-0.5 rounded-sm" style={{ background: heatColor(c) }}>{c > 0 ? '+' : ''}{Math.round(c * 100)}%</span>
      ))}
    </div>
  )
}

function ListView({ items, onPick }) {
  const rows = [...items].sort((a, b) => b.chg - a.chg)
  return (
    <div className="overflow-x-auto max-h-[680px]">
      <table className="grid-table">
        <thead><tr><th className="w-8" /><th className="text-left!">Symbol</th><th>Chg %</th><th>Price</th><th>Value</th><th className="text-left!">Sector / kind</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="cursor-pointer" onClick={() => onPick(r.symbol)}>
              <td className="w-8 pr-0!" onClick={(e) => e.stopPropagation()}>{!r.industryTile && <PortfolioButton symbol={r.symbol} />}</td>
              <td className="text-left! max-w-[260px]"><span className="font-semibold text-accent">{r.label || r.symbol}</span><div className="text-[12px] text-muted truncate">{r.industryTile ? `${r.n} companies` : r.name}</div></td>
              <td className={`num font-semibold ${tone(r.chg)}`}>{pct(r.chg, { decimals: 2 })}</td>
              <td className="num">{r.price == null ? '—' : usd(r.price)}</td>
              <td className="num">{cap(r.value)}</td>
              <td className="text-left! text-[12.5px] whitespace-nowrap">{r.group}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const fmtDay = (d) => (d ? new Date(d.length <= 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: d.length <= 10 ? 'UTC' : undefined }) : '—')
const money = (v) => (v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`)
function BeatMiss({ a, e }) {
  if (a == null || e == null) return null
  const beat = a >= e
  return <span className={`ml-1 rounded px-1.5 py-px text-[10.5px] font-semibold ${beat ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss'}`}>{beat ? 'Beat' : 'Miss'}</span>
}
const CAL_TABS = [['earnings', 'Earnings', 'earnings-calendar'], ['economy', 'Economy', 'economic-calendar'], ['ratings', 'Analyst moves', 'analyst-ratings'], ['insiders', 'Insider trades', 'insider-trades']]

function ThisWeek({ cal, d, onPick }) {
  const [tab, setTab] = useState('earnings')
  const [more, setMore] = useState(false)
  const [side, setSide] = useState('all')
  if (!cal) return null
  const cap0 = (sym) => d.bySymbol[sym]?.marketCap || d.bySymbol[sym]?.aum || 0
  const nameOf = (sym) => d.bySymbol[sym]?.name || ''
  const Sym = ({ s }) => <button className="font-semibold text-accent hover:underline" onClick={() => onPick(s)}>{s}</button>
  let body = null
  if (tab === 'earnings') {
    const days = {}
    for (const e of cal.earnings) (days[e.date] ||= []).push(e)
    body = Object.keys(days).sort().map((day) => {
      const rows = days[day].sort((a, b) => cap0(b.symbol) - cap0(a.symbol))
      return (
        <div key={day} className="mb-3">
          <div className="text-[12px] font-semibold text-muted mb-1">{fmtDay(day)} · {rows.length} {rows.length === 1 ? 'company' : 'companies'}</div>
          <table className="w-full text-[13px]"><tbody>
            {rows.slice(0, more ? 999 : 8).map((e) => (
              <tr key={e.symbol} className="border-t border-line/60">
                <td className="py-1.5 pr-3 whitespace-nowrap"><Sym s={e.symbol} /></td>
                <td className="py-1.5 text-muted truncate max-w-0 w-full">{nameOf(e.symbol)}</td>
                <td className="py-1.5 text-right whitespace-nowrap num pl-2">{e.eps != null ? <>EPS {e.eps} <span className="text-faint">vs {e.epsEst ?? '—'}</span><BeatMiss a={e.eps} e={e.epsEst} /></> : <span className="text-muted">EPS est. {e.epsEst ?? '—'}</span>}</td>
                <td className="py-1.5 text-right whitespace-nowrap num pl-3 hidden md:table-cell">{e.rev != null ? <>Sales {money(e.rev)} <BeatMiss a={e.rev} e={e.revEst} /></> : <span className="text-muted">Sales est. {money(e.revEst)}</span>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )
    })
  } else if (tab === 'economy') {
    const days = {}
    for (const e of cal.economy) (days[e.at.slice(0, 10)] ||= []).push(e)
    body = Object.keys(days).sort().filter((day) => more || days[day].some((e) => e.impact === 'High')).map((day) => (
      <div key={day} className="mb-3">
        <div className="text-[12px] font-semibold text-muted mb-1">{fmtDay(day)}</div>
        <table className="w-full text-[13px]"><thead><tr className="text-[11px] text-faint"><th className="text-left font-normal">Your time</th><th className="text-left font-normal">Release</th><th className="text-right font-normal">Actual</th><th className="text-right font-normal">Expected</th><th className="text-right font-normal hidden sm:table-cell">Previous</th></tr></thead><tbody>
          {days[day].filter((e) => more || e.impact === 'High').map((e, i) => (
            <tr key={i} className="border-t border-line/60">
              <td className="py-1.5 whitespace-nowrap text-muted pr-2">{new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</td>
              <td className="py-1.5"><span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${e.impact === 'High' ? 'bg-loss' : 'bg-warn'}`} />{e.event}</td>
              <td className="py-1.5 text-right num font-semibold">{e.actual ?? '—'}{e.actual != null ? e.unit : ''}</td>
              <td className="py-1.5 text-right num text-muted">{e.estimate ?? '—'}{e.estimate != null ? e.unit : ''}</td>
              <td className="py-1.5 text-right num text-muted hidden sm:table-cell">{e.previous ?? '—'}{e.previous != null ? e.unit : ''}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    ))
  } else if (tab === 'ratings') {
    body = (
      <table className="w-full text-[13px]"><tbody>
        {cal.ratings.slice(0, more ? 999 : 20).map((r, i) => (
          <tr key={i} className="border-t border-line/60">
            <td className="py-1.5 whitespace-nowrap text-muted pr-2">{fmtDay(r.at)}</td>
            <td className="py-1.5 pr-3 whitespace-nowrap"><Sym s={r.symbol} /></td>
            <td className="py-1.5"><span className={`rounded px-1.5 py-px text-[10.5px] font-semibold mr-1.5 ${r.action === 'up' ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss'}`}>{r.action === 'up' ? 'Upgrade' : 'Downgrade'}</span>{r.firm}: {r.from} → <b>{r.to}</b></td>
          </tr>
        ))}
      </tbody></table>
    )
  } else {
    const rows = cal.insiders.filter((x) => side === 'all' || x.kind === side)
    body = (<>
      <div className="inline-flex rounded-full bg-surface-2 p-0.5 text-[12.5px] mb-2">
        {[['all', 'All'], ['buy', 'Buys'], ['sell', 'Sells']].map(([k, l]) => <button key={k} onClick={() => setSide(k)} className={`rounded-full px-2.5 py-0.5 ${side === k ? 'bg-surface shadow-sm font-semibold' : 'text-muted'}`}>{l}</button>)}
      </div>
      <table className="w-full text-[13px]"><tbody>
        {rows.slice(0, more ? 999 : 20).map((x, i) => (
          <tr key={i} className="border-t border-line/60">
            <td className="py-1.5 whitespace-nowrap text-muted pr-2">{fmtDay(x.filed)}</td>
            <td className="py-1.5 pr-3 whitespace-nowrap"><Sym s={x.symbol} /></td>
            <td className="py-1.5 max-w-0 w-full"><div className="truncate">{x.who}</div><div className="text-[11px] text-faint truncate">{x.role}</div></td>
            <td className="py-1.5 pl-2"><span className={`rounded px-1.5 py-px text-[10.5px] font-semibold ${x.kind === 'buy' ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss'}`}>{x.kind === 'buy' ? 'Bought' : 'Sold'}</span></td>
            <td className="py-1.5 text-right num pl-2 whitespace-nowrap">{money(x.value)}</td>
          </tr>
        ))}
      </tbody></table>
    </>)
  }
  const counts = { earnings: cal.earnings.length, economy: cal.economy.filter((e) => e.impact === 'High').length, ratings: cal.ratings.length, insiders: cal.insiders.length }
  return (
    <Panel title="This week" subtitle={`Last few days and the week ahead · updated ${ago(cal.updatedAt)} (hourly) · stocks over $500M only`}>
      <div className="flex flex-wrap gap-2 mb-3">
        {CAL_TABS.map(([k, label, term]) => (
          <button key={k} onClick={() => { setTab(k); setMore(false) }} className={`rounded-full px-3 py-1 text-[13px] border inline-flex items-center gap-1 ${tab === k ? 'bg-fg text-bg border-fg' : 'border-line hover:border-fg/30'}`}>
            {label} <span className="num text-[11px] opacity-70">{counts[k]}</span>{tab === k && <Info id={term} />}
          </button>
        ))}
      </div>
      <div className="max-h-[520px] overflow-y-auto pr-1">{body}</div>
      <button className="btn mt-3" onClick={() => setMore(!more)}>{more ? 'Show less' : tab === 'economy' ? 'Include medium-impact releases' : 'Show all'}</button>
    </Panel>
  )
}

function News({ items }) {
  const [shown, setShown] = useState(8)
  if (!items?.length) return null
  return (
    <Panel title="Top news" subtitle="Latest market headlines. Links open the publisher's site.">
      <ul className="grid gap-4 md:grid-cols-2">
        {items.slice(0, shown).map((n) => (
          <li key={n.url} className="flex gap-3">
            {n.image && <img src={n.image} alt="" loading="lazy" className="w-20 h-14 rounded-lg object-cover shrink-0 bg-surface-2" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
            <div className="min-w-0">
              <a href={n.url} target="_blank" rel="noreferrer" className="font-semibold text-[14px] leading-snug hover:text-accent">{n.title} <ExternalLink size={11} className="inline opacity-50" /></a>
              <div className="text-[12px] text-muted mt-0.5">{n.publisher}{n.at ? ` · ${ago(n.at)}` : ''}</div>
              {n.text && <p className="text-[12.5px] text-muted mt-1 line-clamp-2">{n.text}</p>}
            </div>
          </li>
        ))}
      </ul>
      {shown < items.length && <button className="btn mt-4" onClick={() => setShown(items.length)}>Show {items.length - shown} more</button>}
    </Panel>
  )
}

export default function MarketToday() {
  const d = useData()
  const navigate = useNavigate()
  const { loading, data, calendar, error } = useMarket()
  const [list, setListRaw] = useState('all')
  const [zoom, setZoom] = useState(null)   // { type: 'sector' | 'industry', name }
  const setList = (id) => { setListRaw(id); setZoom(null) }
  const [view, setView] = useState('tiles')
  const [selected, setSelected] = useState({ type: 'quote', sym: '^GSPC' })
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t) }, [])   // keeps "in 1h 10m" fresh

  const moves = data?.moves || { stocks: {}, etfs: {} }
  const allItems = useMemo(() => buildList(list, d, moves, zoom), [list, d, moves, zoom])
  const items = zoom?.type === 'sector' ? allItems.filter((x) => x.group === zoom.name) : allItems
  const pick = (symbol) => {
    if (list === 'industries' && zoom?.type !== 'industry') { setZoom({ type: 'industry', name: symbol }); return }
    if (isWide()) setSelected({ type: 'stock', sym: symbol }); else navigate(`/stock/${symbol}`)
  }
  const pickSector = (name) => setZoom({ type: 'sector', name })

  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Market today</h1>
      <p className="text-[13.5px] text-muted mt-1 max-w-3xl">Indexes, futures, the fear gauge and commodities on the right; pick a list for a market map. <Term id="market-today">How this page works</Term></p>
    </div>
  )
  if (loading) return <div className="grid gap-5">{header}<div className="text-muted py-10">Loading…</div></div>
  if (!data) return <div className="grid gap-5">{header}<Empty title={DEMO ? 'Live market data needs sign-in' : 'No market snapshot yet'}>{error || (DEMO ? 'This page reads a snapshot refreshed every 10 minutes; it isn\'t available in demo mode.' : 'The first snapshot is on its way; check back in a few minutes.')}</Empty></div>

  const quote = Object.fromEntries(data.quotes.map((x) => [x.sym, x]))
  const stale = Date.now() - Date.parse(data.updatedAt) > 30 * 60_000
  const meta = LISTS.find((l) => l.id === list)
  const selStock = selected.type === 'stock' ? d.bySymbol[selected.sym] : null
  const selMove = selStock ? (selStock.kind === 'etf' ? moves.etfs : moves.stocks)[selected.sym] : null

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="grid gap-5 min-w-0">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {header}
            <div className={`text-[12.5px] inline-flex items-center gap-1.5 ${stale ? 'text-warn' : 'text-faint'}`}><RefreshCw size={12} /> Updated {ago(data.updatedAt)} · every 10 minutes</div>
          </div>
          <Status s={data.status} session={data.session} />
        </div>

        <section className="card p-4 grid gap-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            {LISTS.map((l) => (
              <button key={l.id} onClick={() => setList(l.id)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium border ${list === l.id ? 'bg-fg text-bg border-fg' : 'border-line hover:border-fg/30'}`}>{l.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px]">
              {zoom && <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent px-2.5 py-0.5 mr-2 font-semibold">{zoom.name}<button title="Back to the whole list" onClick={() => setZoom(null)}><X size={13} /></button></span>}
              <b>{zoom?.type === 'industry' ? `Every company in ${zoom.name}` : meta.note}</b> <span className="text-muted">· {items.length} shown · tile size = {list === 'etfs' ? 'fund size' : 'company value'}, colour = today's move<Info id="sector-map" /></span></div>
            <div className="flex flex-wrap items-center gap-3">
              <Legend />
              <div className="inline-flex rounded-full bg-surface-2 p-0.5">
                {[['tiles', LayoutGrid, 'Tiles'], ['list', List, 'List']].map(([k, Icon, label]) => (
                  <button key={k} onClick={() => setView(k)} title={label} className={`rounded-full px-2.5 py-1 inline-flex items-center gap-1 text-[12.5px] ${view === k ? 'bg-surface shadow-sm font-semibold' : 'text-muted'}`}><Icon size={13} />{label}</button>
                ))}
              </div>
            </div>
          </div>
          {items.length === 0 ? <Empty title="Nothing in this list right now">{list === 'active' ? 'Trading volume shows once the market has traded today.' : 'Check back after the next update.'}</Empty>
            : view === 'tiles' ? <MarketMap items={items} selected={selected.sym} onPick={pick} onGroup={zoom ? null : pickSector} /> : <ListView items={items} onPick={pick} />}
          <p className="text-[12px] text-faint">{list === 'industries' && !zoom ? 'Click an industry to see its companies, or a sector name to zoom in.' : 'Click a tile for the company\'s figures on the right (on a phone it opens the full page); click a sector name to zoom into it.'} Grouped by sector{list === 'etfs' ? ' (ETFs by kind)' : ''}; each group's move is weighted by size.</p>
        </section>

        <ThisWeek cal={calendar} d={d} onPick={(s) => (isWide() ? setSelected({ type: 'stock', sym: s }) : navigate(`/stock/${s}`))} />
        <div className="hidden lg:block"><News items={data.news} /></div>
        <p className="text-[12.5px] text-faint px-1">Data from Financial Modeling Prep, snapshot every 10 minutes (may lag the live market by a few minutes). Not investment advice.</p>
      </div>

      <aside className="grid grid-cols-[minmax(0,1fr)] gap-4 content-start min-w-0 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pb-2">
        {/* A picked company shows above the watchlist so it's in view straight away; a picked quote shows below its row list. */}
        {selStock && <div className="hidden lg:block relative">
          <button className="absolute right-3 top-3 z-10 text-muted hover:text-fg" title="Close" onClick={() => setSelected({ type: 'quote', sym: '^GSPC' })}><X size={16} /></button>
          <StockDetail s={selStock} m={selMove} cal={calendar} />
        </div>}
        <Watchlist quotes={data.quotes} selected={selected.type === 'quote' ? selected : null} onSelect={setSelected} />
        {selected.type === 'quote' && quote[selected.sym] && <div className="hidden lg:block"><QuoteDetail q={quote[selected.sym]} /></div>}
      </aside>
      <div className="lg:hidden"><News items={data.news} /></div>
    </div>
  )
}
