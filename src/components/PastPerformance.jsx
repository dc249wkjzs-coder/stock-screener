import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { TriangleAlert } from 'lucide-react'
import { DEMO, supabase } from '@/lib/supabase'
import { Panel } from '@/components/ui'
import { fp } from '@/components/pillarUi'
import { pastPerformance } from '@shared/pastPerformance.js'

const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`
const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const fmtDay = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const sign = (v) => (v > 0 ? '+' : '')

async function loadHistories(symbols) {
  if (DEMO) {
    const r = await fetch('/past-demo.json')
    if (!r.ok) throw new Error('This check uses the stored price history, so it only runs on the live site.')
    return r.json()
  }
  const { data, error } = await supabase.rpc('scr_past_prices', { symbols })
  if (error) throw error
  return Object.fromEntries(data.map((h) => [h.symbol, h]))
}

function Stat({ label, mine, spy, fmt, better }) {
  const win = mine != null && spy != null && (better === 'low' ? mine < spy : mine > spy)
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`text-[22px] font-semibold num ${win ? 'text-gain' : ''}`}>{fmt(mine)}</div>
      <div className="text-[12px] text-muted num">S&P 500: {fmt(spy)}</div>
    </div>
  )
}

// holdings: [{ symbol, w }] with w as a fraction (adds up to 1).
export default function PastPerformance({ holdings }) {
  const [hist, setHist] = useState(null)
  const [err, setErr] = useState(null)
  const key = holdings.map((h) => h.symbol).sort().join(',')
  useEffect(() => {
    let live = true
    setErr(null)
    loadHistories(key.split(',')).then((h) => live && setHist(h)).catch((e) => live && setErr(e.message || String(e)))
    return () => { live = false }
  }, [key])
  const r = useMemo(() => (hist ? pastPerformance(holdings, hist) : null), [hist, holdings])

  if (err) return <Panel title="What if I bought these 5 years ago?"><p className="text-[13.5px] text-muted">{err}</p></Panel>
  if (!r) return <Panel title="What if I bought these 5 years ago?"><p className="text-[13.5px] text-muted">{hist ? 'Not enough price history to run this yet.' : 'Working it out…'}</p></Panel>

  const chart = r.series.filter((_, i) => i % 2 === 0 || i === r.series.length - 1)
  const late = r.stocks.filter((s) => s.late), none = r.stocks.filter((s) => s.noData)
  const diff = r.mine.end - r.spy.end

  return (
    <Panel title="What if I bought these 5 years ago?"
      subtitle={`$10,000 split at your shares on ${fmtDay(r.from)}, held until ${fmtDay(r.to)}. Dividends reinvested, never rebalanced, no costs or taxes. A look back, not a forecast.`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <Stat label="$10,000 became" mine={r.mine.end} spy={r.spy.end} fmt={(v) => money(v)} />
        <Stat label="Total return" mine={r.mine.total} spy={r.spy.total} fmt={(v) => `${sign(v)}${fp(v)}`} />
        <Stat label="Per year (average)" mine={r.mine.cagr} spy={r.spy.cagr} fmt={(v) => `${sign(v)}${fp(v, 1)}`} />
        <Stat label="Worst drop along the way" mine={r.mine.maxDrawdown} spy={r.spy.maxDrawdown} fmt={(v) => fp(v)} better="high" />
      </div>
      <p className="text-[14px] mb-4">
        Your picks ended <span className={`font-semibold ${diff >= 0 ? 'text-gain' : 'text-loss'}`}>{money(Math.abs(diff))} {diff >= 0 ? 'ahead of' : 'behind'}</span> the same $10,000 put into the S&P 500.
      </p>
      <div className="h-[280px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="asof" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={50} />
            <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={44} domain={['auto', 'auto']} />
            <Tooltip formatter={(v) => money(v)} labelFormatter={fmtDay} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="mine" name="Your picks" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
            <Line dataKey="spy" name="S&P 500 (SPY)" stroke="var(--faint)" strokeWidth={1.75} dot={false} strokeDasharray="4 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto mt-5 -mx-5">
        <table className="grid-table">
          <thead><tr><th>Stock</th><th>Share</th><th>Bought</th><th>Put in</th><th>Worth now</th><th>Return</th></tr></thead>
          <tbody>
            {r.stocks.map((s) => (
              <tr key={s.symbol}>
                <td><Link to={`/stock/${s.symbol}`} className="font-semibold text-accent hover:underline">{s.symbol}</Link></td>
                <td className="num">{fp(s.w)}</td>
                <td className="num">{s.noData ? <span className="text-muted">no history</span> : <>{fmtDay(s.bought)}{s.late && <div className="text-[11px] text-warn">listed later; cash until then</div>}</>}</td>
                <td className="num">{money(s.invested)}</td>
                <td className="num">{money(s.value)}</td>
                <td className={`num font-semibold ${s.ret > 0 ? 'text-gain' : s.ret < 0 ? 'text-loss' : ''}`}>{s.noData ? '—' : `${sign(s.ret)}${fp(s.ret)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-2 text-[12.5px] text-muted">
        <TriangleAlert size={15} className="shrink-0 mt-0.5 text-warn" />
        <div className="grid gap-1">
          <span>Hindsight: these are stocks you picked today, knowing how they did. Picking the same names 5 years ago would have meant knowing then what you know now, so past winners can make this look better than a real 5-year-old pick would have been.</span>
          {late.length > 0 && <span>{late.map((s) => s.symbol).join(', ')} started trading after {fmtDay(r.from)}; their share sat in cash (earning nothing) until their first week of trading.</span>}
          {none.length > 0 && <span>No stored price history for {none.map((s) => s.symbol).join(', ')}; their share is kept as cash.</span>}
        </div>
      </div>
    </Panel>
  )
}
