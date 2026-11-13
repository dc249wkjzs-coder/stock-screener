import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Segmented } from './ui'
import { date as fdate } from '@/lib/format'
import { DEMO, supabase } from '@/lib/supabase'

const RANGES = [['126', '6M'], ['252', '1Y'], ['520', '2Y'], ['5y', '5Y']]
const MAS = [
  { key: 'ma20', n: 20, label: '20-day', color: 'var(--c-crypto)' },
  { key: 'ma50', n: 50, label: '50-day', color: 'var(--c-collect)' },
  { key: 'ma200', n: 200, label: '200-day', color: 'var(--c-realestate)' },
]
const money = (v) => (v == null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
// Short form for the labels at the right edge of the chart.
const short = (v) => `$${v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2)}`

// Adds moving averages, RSI(14) and the stochastic oscillator to every bar, using the full history loaded so
// the long average exists from the first bar shown. weekly = true for the 5-year view: 20/50/200-day averages
// become 4/10/40-week ones (the same length of time) and RSI/stochastic are read on weekly bars.
function enrich(prices, weekly = false) {
  const out = prices.map((p) => ({ ...p }))
  for (const { key, n: days } of MAS) {
    const n = weekly ? Math.round(days / 5) : days
    let sum = 0
    out.forEach((p, i) => {
      sum += p.close
      if (i >= n) sum -= out[i - n].close
      p[key] = i >= n - 1 ? sum / n : null
    })
  }
  let gain = 0, loss = 0
  out.forEach((p, i) => {
    if (i === 0) return
    const d = p.close - out[i - 1].close
    if (i <= 14) {
      gain += Math.max(d, 0); loss += Math.max(-d, 0)
      if (i === 14) { gain /= 14; loss /= 14; p.rsi = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) }
      return
    }
    gain = (gain * 13 + Math.max(d, 0)) / 14
    loss = (loss * 13 + Math.max(-d, 0)) / 14
    p.rsi = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  })
  // Slow stochastic (14, 3, 3): where the close sits in the range of the last 14 bars (0 = at the low, 100 = at
  // the high), smoothed over 3 bars (%K), and %D = 3-bar average of %K. Uses closing prices only (the site stores
  // closes, not intraday highs and lows), so it moves a little less than a stochastic drawn from highs and lows.
  const raw = out.map((p, i) => {
    if (i < 13) return null
    let hi = -Infinity, lo = Infinity
    for (let k = i - 13; k <= i; k++) { hi = Math.max(hi, out[k].close); lo = Math.min(lo, out[k].close) }
    return hi > lo ? ((p.close - lo) / (hi - lo)) * 100 : 50
  })
  const avg3 = (xs, i) => (i >= 2 && xs[i] != null && xs[i - 1] != null && xs[i - 2] != null ? (xs[i] + xs[i - 1] + xs[i - 2]) / 3 : null)
  const k = raw.map((_, i) => avg3(raw, i))
  out.forEach((p, i) => { p.stochK = k[i]; p.stochD = avg3(k, i) })
  return out
}

export default function PriceChart({ prices, fib, symbol }) {
  const [range, setRange] = useState('252')
  const [show, setShow] = useState({ ma20: false, ma50: true, ma200: true, fib: true, stoch: true })
  const [weeklyPx, setWeeklyPx] = useState(null)   // 5-year view: weekly closes, loaded on first use
  const [weeklyErr, setWeeklyErr] = useState(null)
  const five = range === '5y'
  useEffect(() => {
    if (!five || weeklyPx || !symbol) return
    if (DEMO) { setWeeklyErr('The 5-year view uses stored weekly prices, so it only works on the live site.'); return }
    supabase.rpc('scr_past_prices', { symbols: [symbol] }).then(({ data, error }) => {
      const h = (data || []).find((x) => x.symbol === symbol)
      if (error || !h) { setWeeklyErr(error?.message || 'No 5-year price history stored for this stock yet.'); return }
      setWeeklyPx(h.weeks.map((d, i) => ({ date: d, close: Number(h.close[i]) })).filter((p) => p.close > 0))
    })
  }, [five, weeklyPx, symbol])
  const all = useMemo(() => (five ? enrich(weeklyPx || [], true) : enrich(prices || [])), [prices, weeklyPx, five])
  const data = useMemo(() => {
    if (!five) return all.slice(-Number(range))
    const cut = all.length ? new Date(Date.parse(all[all.length - 1].date) - 5 * 365.25 * 864e5).toISOString().slice(0, 10) : ''
    return all.filter((p) => p.date >= cut)
  }, [all, range, five])

  if (!prices) return <div className="h-80 grid place-items-center text-muted text-[13px]">Loading chart…</div>
  if (five && !data.length) return (
    <div>
      <div className="mb-3"><Segmented value={range} onChange={setRange} options={RANGES} /></div>
      <div className="h-80 grid place-items-center text-muted text-[13px]">{weeklyErr || 'Loading 5 years of weekly prices…'}</div>
    </div>
  )
  if (!prices.length) return <div className="h-80 grid place-items-center text-muted text-[13px]">Price history for this stock is still loading. Check back within the hour.</div>

  const fibLevels = fib ? [{ ratio: 0, price: fib.swingHigh.price }, ...fib.levels] : []
  // Keep every Fib level visible even if the chosen range doesn't reach it.
  const lo = Math.min(...data.map((d) => d.close), ...(show.fib && !five ? fibLevels.map((l) => l.price) : []))
  const hi = Math.max(...data.map((d) => d.close), ...(show.fib && !five ? fibLevels.map((l) => l.price) : []))
  const pad = (hi - lo) * 0.04
  const inView = (d) => data.some((x) => x.date === d)
  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented value={range} onChange={setRange} options={RANGES} />
        {MAS.map((m) => (
          <button key={m.key} onClick={() => toggle(m.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${show[m.key] ? 'border-line text-fg' : 'border-line text-faint line-through'}`}>
            <span className="w-3 h-0.5 rounded" style={{ background: m.color }} />{five ? `${Math.round(m.n / 5)}-week` : m.label} avg
          </button>
        ))}
        <button onClick={() => toggle('stoch')}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${show.stoch ? 'border-line text-fg' : 'border-line text-faint line-through'}`}>
          <span className="w-3 h-0.5 rounded" style={{ background: 'var(--cat-7)' }} />Stochastic
        </button>
        {fib && (
          <button onClick={() => toggle('fib')}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${show.fib ? 'border-line text-fg' : 'border-line text-faint line-through'}`}>
            <span className="w-3 border-t border-dashed" style={{ borderColor: 'var(--accent)' }} />Fibonacci
          </button>
        )}
      </div>

      <div className="h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} syncId="px" margin={{ top: 8, right: 84, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis domain={[lo - pad, hi + pad]} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={60} tickFormatter={(v) => `$${v >= 1000 ? v.toFixed(0) : v.toFixed(v >= 100 ? 0 : 2)}`} />
            <Tooltip content={<Tip />} />
            {show.fib && !five && fibLevels.map((l) => (
              <ReferenceLine key={l.ratio} y={l.price}
                stroke={fib.nextSupport?.ratio === l.ratio ? 'var(--accent)' : 'var(--faint)'}
                strokeWidth={fib.nextSupport?.ratio === l.ratio ? 1.6 : 1} strokeDasharray="5 4"
                label={{ value: `${(l.ratio * 100).toFixed(l.ratio === 0 || l.ratio === 1 ? 0 : 1)}% ${short(l.price)}`, position: 'right', fontSize: 10, fill: fib.nextSupport?.ratio === l.ratio ? 'var(--accent)' : 'var(--muted)' }} />
            ))}
            {MAS.filter((m) => show[m.key]).map((m) => (
              <Line key={m.key} dataKey={m.key} dot={false} stroke={m.color} strokeWidth={1.3} isAnimationActive={false} connectNulls />
            ))}
            <Line dataKey="close" dot={false} stroke="var(--fg)" strokeWidth={1.6} isAnimationActive={false} />
            {show.fib && !five && fib && inView(fib.swingHigh.date) && <ReferenceDot x={fib.swingHigh.date} y={fib.swingHigh.price} r={4} fill="var(--accent)" stroke="none" />}
            {show.fib && !five && fib && inView(fib.swingLow.date) && <ReferenceDot x={fib.swingLow.date} y={fib.swingLow.price} r={4} fill="var(--accent)" stroke="none" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {five && <div className="text-[11.5px] text-faint mt-1">5-year view uses weekly closes: the averages are 4, 10 and 40 weeks (about 20, 50 and 200 trading days), and RSI and stochastic are read on weekly bars. Fibonacci levels belong to the last year and are shown on the shorter views.</div>}
      <div className="h-[110px] mt-1">
        <div className="text-[11px] font-semibold text-muted tracking-wider uppercase">RSI (14{five ? ' weeks' : ''})</div>
        <ResponsiveContainer width="100%" height="88%">
          <LineChart data={data} syncId="px" margin={{ top: 4, right: 84, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fdate(v, { month: 'short', year: '2-digit' })} minTickGap={50} />
            <YAxis domain={[0, 100]} ticks={[30, 70]} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={60} />
            <ReferenceLine y={70} stroke="var(--loss)" strokeDasharray="3 3" strokeOpacity={0.6} />
            <ReferenceLine y={30} stroke="var(--gain)" strokeDasharray="3 3" strokeOpacity={0.6} />
            <Tooltip content={() => null} />
            <Line dataKey="rsi" dot={false} stroke="var(--c-stocks)" strokeWidth={1.3} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {show.stoch && (
        <div className="h-[110px] mt-2">
          <div className="text-[11px] font-semibold text-muted tracking-wider uppercase flex flex-wrap gap-x-3">
            <span>Stochastic (14, 3, 3{five ? ', weekly' : ''})</span>
            <span className="normal-case tracking-normal font-normal"><span style={{ color: 'var(--cat-7)' }}>— %K</span> <span className="text-faint">- - %D</span> · above 80 = near the top of its recent range, below 20 = near the bottom</span>
          </div>
          <ResponsiveContainer width="100%" height="82%">
            <LineChart data={data} syncId="px" margin={{ top: 4, right: 84, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} ticks={[20, 80]} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={60} />
              <ReferenceLine y={80} stroke="var(--loss)" strokeDasharray="3 3" strokeOpacity={0.6} />
              <ReferenceLine y={20} stroke="var(--gain)" strokeDasharray="3 3" strokeOpacity={0.6} />
              <Tooltip content={() => null} />
              <Line dataKey="stochK" dot={false} stroke="var(--cat-7)" strokeWidth={1.3} isAnimationActive={false} />
              <Line dataKey="stochD" dot={false} stroke="var(--faint)" strokeWidth={1.1} strokeDasharray="4 3" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="card px-3 py-2 text-[12px] grid gap-0.5">
      <div className="font-semibold">{fdate(label)}</div>
      <div className="num">Close {money(p.close)}</div>
      {MAS.map((m) => p[m.key] != null && <div key={m.key} className="num" style={{ color: m.color }}>{m.label} avg {money(p[m.key])}</div>)}
      {p.rsi != null && <div className="num text-muted">RSI {p.rsi.toFixed(0)}</div>}
      {p.stochK != null && <div className="num text-muted">Stochastic %K {p.stochK.toFixed(0)}{p.stochD != null ? ` · %D ${p.stochD.toFixed(0)}` : ''}</div>}
    </div>
  )
}
