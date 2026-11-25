import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useData } from '@/lib/data'
import { DEMO, supabase } from '@/lib/supabase'
import { Panel, Empty } from '@/components/ui'
import { usd } from '@/components/pillarUi'
import { pct, ago, tone } from '@/lib/format'
import PortfolioButton from '@/components/PortfolioButton'
import Term, { Info } from '@/components/Term'
import { VIX_ZONES, vixZone, topMovers, breadth, sectorMoves } from '@shared/market.js'

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
const fmtPrice = (q) => (q.price == null ? '—' : (q.sym.startsWith('^') || q.sym === 'ESUSD') ? q.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : usd(q.price))

// One snapshot row (scr_market 'today'), written every 10 minutes by the market-today Edge Function.
function useMarket() {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  useEffect(() => {
    if (DEMO) {   // demo mode: a saved snapshot if one is bundled (public/market-sample.json), otherwise nothing
      fetch('/market-sample.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((data) => setState({ loading: false, data, error: null }))
      return
    }
    let alive = true
    const load = () => supabase.from('scr_market').select('data').eq('id', 'today').maybeSingle()
      .then(({ data, error }) => alive && setState({ loading: false, data: data?.data || null, error: error?.message || null }))
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return state
}

function Status({ s, session }) {
  const map = {
    open: ['bg-gain', `US market open · closes ${nyTime(s.closesAt)} New York (${localTime(s.closesAt)} your time), in ${until(s.closesAt)}${s.earlyClose ? ' · early close today' : ''}`],
    pre: ['bg-warn', `Pre-market · opens ${localTime(s.nextOpen)} your time (9:30am New York), in ${until(s.nextOpen)}`],
    after: ['bg-warn', `After hours · the market closed at ${s.earlyClose ? '1:00pm' : '4:00pm'} New York · opens ${localTime(s.nextOpen, true)} your time`],
    closed: ['bg-faint', `${s.holiday ? `Closed for ${s.holiday}` : s.weekend ? 'Closed for the weekend' : 'Closed overnight'} · opens ${localTime(s.nextOpen, true)} your time${s.nextOpenEarlyClose ? ` (early close at 1:00pm New York that day)` : ''}`],
  }
  const [dot, text] = map[s.state] || map.closed
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
      <span className="inline-flex items-center gap-2 rounded-full bg-surface border border-line px-3 py-1.5 font-medium"><span className={`w-2 h-2 rounded-full ${dot} ${s.state === 'open' ? 'animate-pulse' : ''}`} />{text}</span>
      {s.state !== 'open' && <span className="text-muted">Moves below are for the last session, {dayName(session)}.</span>}
      <span className="text-faint"><Term id="market-hours">Market hours</Term></span>
    </div>
  )
}

// Small intraday chart with the previous close as a dashed line, coloured against that close.
function Spark({ data, base, w = 120, h = 34 }) {
  if (!data || data.length < 2) return null
  const vals = base != null ? [...data, base] : data
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1
  const y = (v) => h - 2 - ((v - min) / span) * (h - 4)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const color = data[data.length - 1] >= (base ?? data[0]) ? 'var(--gain)' : 'var(--loss)'
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block mt-2">
      {base != null && <line x1="0" x2={w} y1={y(base)} y2={y(base)} stroke="var(--faint)" strokeDasharray="3 3" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Tile({ q }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="text-[12.5px] text-muted flex items-center gap-1 truncate">{q.label}<Info id={q.term} /></div>
      {q.ok ? (<>
        <div className="num text-[19px] font-semibold mt-0.5">{fmtPrice(q)}</div>
        <div className={`num text-[13px] font-medium ${tone(q.chg)}`}>{q.change != null && !q.via ? `${q.change > 0 ? '+' : ''}${q.change.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ` : ''}{pct(q.chg, { decimals: 2 })}</div>
        <Spark data={q.spark} base={q.prevClose} />
        <div className="text-[11px] text-faint mt-1">{q.via ? `via ${q.via}` : q.unit || (q.sym === 'ESUSD' ? 'last 24 hours' : q.spark ? 'today vs previous close' : '')}</div>
      </>) : <div className="text-[13px] text-muted mt-1">Not available right now</div>}
    </div>
  )
}

function VixCard({ q }) {
  if (!q?.ok) return null
  const z = vixZone(q.price)
  const pos = Math.min(100, (q.price / 45) * 100)
  const stops = [15, 20, 30].map((v) => (v / 45) * 100)
  return (
    <Panel title={<>VIX: the fear gauge<Info id="vix" /></>} className="h-full">
      <div className="flex items-end gap-3">
        <div className="num text-4xl font-semibold">{q.price.toFixed(2)}</div>
        <div className={`num text-[14px] font-semibold pb-1 ${q.chg > 0 ? 'text-loss' : q.chg < 0 ? 'text-gain' : 'text-muted'}`}>{pct(q.chg, { decimals: 1 })} today</div>
        <div className="ml-auto pb-1 font-semibold">{z.label}</div>
      </div>
      <div className="relative mt-4 h-2.5 rounded-full overflow-hidden flex">
        <div className="h-full bg-gain/70" style={{ width: `${stops[0]}%` }} />
        <div className="h-full bg-accent/60" style={{ width: `${stops[1] - stops[0]}%` }} />
        <div className="h-full bg-warn/70" style={{ width: `${stops[2] - stops[1]}%` }} />
        <div className="h-full bg-loss/70 flex-1" />
      </div>
      <div className="relative h-4"><div className="absolute -top-3.5 w-0.5 h-4 bg-fg rounded" style={{ left: `calc(${pos}% - 1px)` }} /></div>
      <div className="grid grid-cols-4 text-[11px] text-muted -mt-1">
        {VIX_ZONES.map((v, i) => <div key={v.label} className={i === 3 ? 'text-right' : ''}>{v.label}{i < 3 ? ` <${v.max}` : ' 30+'}</div>)}
      </div>
      <p className="text-[13px] mt-3">{z.note} {q.chg > 0.005 ? 'Up today: investors are paying more for protection, expecting bigger swings.' : q.chg < -0.005 ? 'Down today: worries are easing.' : 'About unchanged today.'}</p>
      <p className="text-[12px] text-faint mt-1">It measures how bumpy the next 30 days are expected to be, not which way the market goes. Long-run average about 19–20.</p>
    </Panel>
  )
}

function Breadth({ label, b }) {
  if (!b.n) return null
  const upW = (b.up / b.n) * 100, downW = (b.down / b.n) * 100
  return (
    <div>
      <div className="flex justify-between text-[13px]"><span>{label}</span><span className="text-muted">median move <span className={`num font-semibold ${tone(b.median)}`}>{pct(b.median, { decimals: 2 })}</span></span></div>
      <div className="flex h-2.5 rounded-full overflow-hidden mt-1.5 bg-surface-2">
        <div className="bg-gain" style={{ width: `${upW}%` }} /><div className="flex-1" /><div className="bg-loss" style={{ width: `${downW}%` }} />
      </div>
      <div className="flex justify-between text-[12px] mt-1"><span className="text-gain num">{b.up.toLocaleString()} up</span><span className="text-faint num">{b.flat ? `${b.flat} flat` : ''}</span><span className="text-loss num">{b.down.toLocaleString()} down</span></div>
    </div>
  )
}

const heat = (chg) => {
  const a = Math.min(1, Math.abs(chg) / 0.03)
  const c = chg >= 0 ? 'var(--gain)' : 'var(--loss)'
  return { background: `color-mix(in srgb, ${c} ${Math.round(10 + a * 55)}%, var(--surface))`, color: a > 0.55 ? 'white' : undefined }
}

function SectorMap({ sectors }) {
  const [open, setOpen] = useState(null)
  const sel = sectors.find((s) => s.name === open)
  return (
    <Panel title={<>Sectors<Info id="sector-map" /></>} subtitle="Weighted by company size. Click a sector to see its industries.">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sectors.map((s) => (
          <button key={s.name} onClick={() => setOpen(open === s.name ? null : s.name)} style={heat(s.chg)}
            className={`rounded-xl px-3 py-2.5 text-left transition ${open === s.name ? 'ring-2 ring-accent' : ''}`}>
            <div className="text-[13px] font-semibold truncate">{s.name}</div>
            <div className="num text-[17px] font-semibold">{pct(s.chg, { decimals: 2 })}</div>
            <div className="text-[11.5px] opacity-80">{s.up} of {s.n} up</div>
          </button>
        ))}
      </div>
      {sel && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="font-semibold text-[14px] mb-2">{sel.name}: industries</div>
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead><tr><th className="text-left!">Industry</th><th>Move</th><th>Up</th><th className="text-left!">Best</th><th className="text-left!">Worst</th></tr></thead>
              <tbody>
                {sel.industries.map((i) => (
                  <tr key={i.name}>
                    <td className="text-left!">{i.name}</td>
                    <td className={`num font-semibold ${tone(i.chg)}`}>{pct(i.chg, { decimals: 2 })}</td>
                    <td className="num text-muted">{i.up}/{i.n}</td>
                    <td className="text-left! whitespace-nowrap"><Link className="text-accent font-semibold" to={`/stock/${i.best.symbol}`}>{i.best.symbol}</Link> <span className={`num ${tone(i.best.chg)}`}>{pct(i.best.chg)}</span></td>
                    <td className="text-left! whitespace-nowrap"><Link className="text-accent font-semibold" to={`/stock/${i.worst.symbol}`}>{i.worst.symbol}</Link> <span className={`num ${tone(i.worst.chg)}`}>{pct(i.worst.chg)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  )
}

function MoverList({ title, rows, kind }) {
  return (
    <div className="min-w-0">
      <div className={`font-semibold text-[14px] mb-1 ${kind === 'up' ? 'text-gain' : 'text-loss'}`}>{title}</div>
      {rows.length === 0 ? <p className="text-[13px] text-muted py-2">None.</p> : (
        <table className="w-full text-[13px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="border-t border-line/60">
                <td className="py-1.5 w-8"><PortfolioButton symbol={r.symbol} /></td>
                <td className="py-1.5 pl-2 max-w-0 w-full">
                  <Link to={`/stock/${r.symbol}`} className="font-semibold text-accent hover:underline">{r.symbol}</Link>
                  <div className="text-[11.5px] text-muted truncate">{r.name}</div>
                </td>
                <td className="py-1.5 num text-right whitespace-nowrap pl-2">{usd(r.now)}</td>
                <td className={`py-1.5 num text-right font-semibold whitespace-nowrap pl-3 ${tone(r.chg)}`}>{pct(r.chg, { decimals: 1 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Movers({ stocks, etfs, moves }) {
  const [kind, setKind] = useState('stocks')
  const [lev, setLev] = useState(false)
  const list = kind === 'stocks' ? stocks : etfs.filter((e) => lev || !e.leveraged)
  const m = useMemo(() => topMovers(list, kind === 'stocks' ? moves.stocks : moves.etfs, 10), [list, kind, moves])
  return (
    <Panel title="Biggest movers" subtitle="Stocks and ETFs over $500M, change since the previous close."
      action={<div className="inline-flex rounded-full bg-surface-2 p-0.5 text-[13px]">
        {['stocks', 'etfs'].map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 ${kind === k ? 'bg-surface shadow-sm font-semibold' : 'text-muted'}`}>{k === 'stocks' ? 'Stocks' : 'ETFs'}</button>)}
      </div>}>
      {kind === 'etfs' && <label className="inline-flex items-center gap-2 text-[12.5px] text-muted mb-3 cursor-pointer"><input type="checkbox" checked={lev} onChange={(e) => setLev(e.target.checked)} /> Include leveraged and inverse funds<Info id="leveraged-etf" /></label>}
      <div className="grid gap-6 md:grid-cols-2">
        <MoverList title="Top gainers" rows={m.up} kind="up" />
        <MoverList title="Top losers" rows={m.down} kind="down" />
      </div>
    </Panel>
  )
}

function News({ items }) {
  const [shown, setShown] = useState(8)
  if (!items?.length) return null
  return (
    <Panel title="Top news" subtitle="Latest market headlines. Links open the publisher's site.">
      <ul className="grid gap-4">
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
  const { loading, data, error } = useMarket()
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t) }, [])   // keeps "in 1h 10m" fresh

  const moves = data?.moves || { stocks: {}, etfs: {} }
  const sectors = useMemo(() => sectorMoves(d.stocks, moves.stocks), [d.stocks, moves.stocks])
  const bStocks = useMemo(() => breadth(d.stocks, moves.stocks), [d.stocks, moves.stocks])
  const bEtfs = useMemo(() => breadth(d.etfs.filter((e) => !e.leveraged), moves.etfs), [d.etfs, moves.etfs])

  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Market today</h1>
      <p className="text-[13.5px] text-muted mt-1 max-w-3xl">A quick read of the US market: indexes, futures, the fear gauge, commodities, sectors, the biggest movers and the headlines. <Term id="market-today">How this page works</Term></p>
    </div>
  )
  if (loading) return <div className="grid gap-5">{header}<div className="text-muted py-10">Loading…</div></div>
  if (!data) return <div className="grid gap-5">{header}<Empty title={DEMO ? 'Live market data needs sign-in' : 'No market snapshot yet'}>{error || (DEMO ? 'This page reads a snapshot refreshed every 10 minutes; it isn\'t available in demo mode.' : 'The first snapshot is on its way; check back in a few minutes.')}</Empty></div>

  const q = Object.fromEntries(data.quotes.map((x) => [x.sym, x]))
  const group = (g) => data.quotes.filter((x) => x.group === g)
  const stale = Date.now() - Date.parse(data.updatedAt) > 30 * 60_000

  return (
    <div className="grid gap-5 grid-cols-[minmax(0,1fr)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {header}
        <div className={`text-[12.5px] inline-flex items-center gap-1.5 ${stale ? 'text-warn' : 'text-faint'}`}><RefreshCw size={12} /> Updated {ago(data.updatedAt)} · refreshes every 10 minutes</div>
      </div>
      <Status s={data.status} session={data.session} />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        {[...group('Indexes'), ...group('Futures')].map((x) => <Tile key={x.sym} q={x} />)}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-stretch">
        <VixCard q={q['^VIX']} />
        <Panel title={<>Up vs down<Info id="breadth" /></>} subtitle={`How many rose and fell since the previous close (${bStocks.n.toLocaleString()} stocks, ${bEtfs.n.toLocaleString()} ETFs, leveraged funds left out).`}>
          <div className="grid gap-5">
            <Breadth label="Stocks over $500M" b={bStocks} />
            <Breadth label="ETFs over $500M" b={bEtfs} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-2">
        <div className="label">Commodities, bonds, dollar and crypto</div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          {[...group('Commodities'), ...group('Bonds, dollar, crypto')].map((x) => <Tile key={x.sym} q={x} />)}
        </div>
        <p className="text-[12px] text-faint">Tiles marked "via … ETF" show an ETF that follows that market (your data plan doesn't quote it directly): read the % change, not the price.</p>
      </div>

      <SectorMap sectors={sectors} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <Movers stocks={d.stocks} etfs={d.etfs} moves={moves} />
        <News items={data.news} />
      </div>
      <p className="text-[12.5px] text-faint px-1">Data from Financial Modeling Prep, snapshot every 10 minutes (quotes may lag the live market by a few minutes). Not investment advice.</p>
    </div>
  )
}
