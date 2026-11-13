import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useData } from '@/lib/data'
import { DEMO, supabase } from '@/lib/supabase'
import { Panel, Empty } from '@/components/ui'
import { fp } from '@/components/pillarUi'
import Term from '@/components/Term'
import { BLANK, THEMES, checks, fromParams, toParams } from '@shared/criteria.js'

const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`
const LINES = [
  { key: 'screen', name: 'Your screen', color: 'var(--accent)' },
  { key: 'spy', name: 'S&P 500 (SPY)', color: 'var(--c-stocks, #3b82f6)' },
  { key: 'all', name: 'All screener stocks', color: 'var(--faint)' },
]
const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function Backtest() {
  const d = useData()
  const [params] = useSearchParams()
  const c = useMemo(() => ([...params.keys()].length ? fromParams(params) : { ...BLANK, ...d.screen }), [params]) // eslint-disable-line
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (DEMO) { setErr('The backtest runs on the live site (it needs the stored past data).'); return }
    setRes(null); setErr(null)
    supabase.functions.invoke('backtest', { body: { criteria: c } }).then(async ({ data, error }) => {
      if (error) {
        let msg = error.message
        try { msg = (await error.context.json()).error || msg } catch { /* keep the generic message */ }
        setErr(msg)
      } else setRes(data)
    })
  }, [c])

  const summary = checks({}, c).map((k) => (k.label === 'Industry' ? THEMES.filter((t) => c.themes.includes(t.id)).map((t) => t.label).join(', ') : k.label))
  const st = res?.stats

  return (
    <div className="grid gap-5">
      <div>
        <Link to={`/results?${toParams(c)}`} className="text-[13px] text-muted hover:text-fg inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Results</Link>
        <h1 className="text-2xl font-semibold tracking-tight">How has this screen done?</h1>
        <p className="text-[13.5px] text-muted mt-1 max-w-3xl">
          Every 3 months for the last 5 years, the screen is run on the numbers that were public at the time, the matching stocks are bought in equal amounts and held for 3 months. <Term id="backtest">How this works</Term>
        </p>
        <div className="text-[13px] text-muted mt-1">{summary.length ? `Screened on: ${summary.join(' · ')}` : 'No boxes set: every stock.'}</div>
      </div>

      {err && <Empty title="Not available">{err}</Empty>}
      {!err && !res && <div className="card p-6 text-muted text-[14px]">Replaying 5 years of data… this takes a few seconds.</div>}

      {st && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {LINES.map((l) => {
              const s = st[l.key]
              return (
                <div key={l.key} className={`card p-4 ${l.key === 'screen' ? 'ring-1 ring-accent/50' : ''}`}>
                  <div className="text-[12.5px] font-semibold flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.name}</div>
                  <div className="num text-2xl font-semibold mt-1">{money(10000 * (1 + s.total))}</div>
                  <div className="text-[12.5px] text-muted">from $10,000 · <span className={s.total >= 0 ? 'text-gain' : 'text-loss'}>{fp(s.total, 0)}</span> total</div>
                  <div className="text-[12.5px] text-muted mt-1.5 grid gap-0.5">
                    <span>{fp(s.cagr, 1)} a year</span>
                    <span>Worst drop {fp(s.maxDrawdown, 0)} · worst quarter {fp(s.worstQuarter, 0)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <Panel title="Growth of $10,000" subtitle={`${fmtDate(res.series[0].asof)} to ${fmtDate(res.series[res.series.length - 1].asof)} · dividends reinvested · no trading costs or taxes`}>
            <div className="h-72 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={res.series} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="asof" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={40} />
                  <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={44} domain={['auto', 'auto']} />
                  <Tooltip formatter={(v, n) => [money(v), n]} labelFormatter={fmtDate} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {LINES.map((l) => <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={l.key === 'screen' ? 2.5 : 1.75} dot={false} strokeDasharray={l.key === 'all' ? '4 3' : undefined} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-1 sm:grid-cols-3 text-[13px] mt-3">
              <div>Beat the S&P 500 in <b>{st.beatSpy} of {st.quarters}</b> quarters</div>
              <div>Held <b>{st.avgPicks.toFixed(1)}</b> stocks on average</div>
              <div>{st.emptyQuarters ? <span className="text-warn">{st.emptyQuarters} quarter{st.emptyQuarters === 1 ? '' : 's'} with no matches (held cash)</span> : 'Always had matches'}</div>
            </div>
          </Panel>

          <Panel title="What it would have held, quarter by quarter" pad={false}>
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead><tr><th className="text-left!">Quarter</th><th>Stocks</th><th>Screen</th><th>S&P 500</th><th>All stocks</th><th className="text-left!">Biggest holdings (return that quarter)</th></tr></thead>
                <tbody>
                  {[...res.periods].reverse().map((p) => (
                    <tr key={p.from}>
                      <td className="text-left! whitespace-nowrap">{fmtDate(p.from)} → {fmtDate(p.to)}</td>
                      <td className="num">{p.n}</td>
                      <td className={`num font-semibold ${p.rScreen >= 0 ? 'text-gain' : 'text-loss'}`}>{fp(p.rScreen, 1)}</td>
                      <td className="num">{fp(p.rSpy, 1)}</td>
                      <td className="num text-muted">{fp(p.rAll, 1)}</td>
                      <td className="text-left! text-[12.5px] min-w-[260px]">
                        {(open === p.from ? p.picks : p.picks.slice(0, 6)).map((x) => (
                          <Link key={x.symbol} to={`/stock/${x.symbol}`} className="inline-block mr-2"><span className="font-semibold text-accent">{x.symbol}</span> <span className={x.ret >= 0 ? 'text-gain' : 'text-loss'}>{fp(x.ret, 0)}</span></Link>
                        ))}
                        {p.picks.length > 6 && open !== p.from && <button className="text-muted underline" onClick={() => setOpen(p.from)}>+{p.n - 6} more</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="card p-4 grid gap-2 text-[13px] max-w-4xl">
            <div className="font-semibold flex items-center gap-2"><TriangleAlert size={15} className="text-warn" /> Read this before trusting the numbers</div>
            <ul className="grid gap-1.5 list-disc pl-5 text-muted">
              {res.notes.map((n) => <li key={n}>{n}</li>)}
              <li>Only companies that still trade today are included. Ones that went bust or were bought out are missing, which makes results look better than they would have been. "All screener stocks" has the same flaw, so beating it is the fairer test.</li>
              <li>Five years is a short period that includes one big market drop (2022) and a strong AI-led rally. A screen that fits this period may not fit the next one.</li>
              <li>Equal amounts in every match, rebalanced every 3 months. Dividends reinvested. No trading costs or taxes. Not investment advice.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
