import { useEffect, useState } from 'react'
import { useData } from '@/lib/data'
import { DEMO, supabase } from '@/lib/supabase'
import { Panel } from '@/components/ui'
import { ago } from '@/lib/format'

const TASKS = {
  universe: 'Stock list + closing prices (weekdays after the US close)',
  backfill: 'Price history for new stocks',
  fundamentals: 'Fundamentals, 20 stocks at a time (weekly refresh)',
  score: 'Scores and technicals (hourly)',
}

export default function Status() {
  const d = useData()
  const [info, setInfo] = useState(null)
  useEffect(() => {
    if (DEMO) { setInfo({ runs: [], counts: {} }); return }
    const count = (t, f) => f(supabase.from(t).select('symbol', { count: 'exact', head: true })).then((r) => r.count)
    Promise.all([
      supabase.from('scr_runs').select('*').order('id', { ascending: false }).limit(40),
      count('scr_stocks', (q) => q.eq('active', true)),
      count('scr_stocks', (q) => q.eq('active', true).not('fundamentals_at', 'is', null)),
      count('scr_prices', (q) => q.not('backfilled_at', 'is', null)),
      count('scr_stocks', (q) => q.eq('active', true).not('error', 'is', null)),
    ]).then(([runs, total, fund, prices, errs]) => setInfo({ runs: runs.data || [], counts: { total, fund, prices, errs } }))
  }, [])
  if (!info) return <div className="text-muted">Loading…</div>
  const c = info.counts
  const last = (t) => info.runs.find((r) => r.task === t)
  return (
    <div className="grid gap-5">
      <div className="card p-5 grid grid-cols-2 md:grid-cols-4 gap-5">
        <Stat label="Stocks tracked" v={c.total} />
        <Stat label="With fundamentals" v={`${c.fund ?? 0}`} sub={c.total ? `${Math.round((c.fund / c.total) * 100)}%` : ''} />
        <Stat label="With price history" v={`${c.prices ?? 0}`} sub={c.total ? `${Math.round((c.prices / c.total) * 100)}%` : ''} />
        <Stat label="Scored" v={d.stocks.length} sub={`updated ${ago(d.lastScored)}`} />
      </div>
      <Panel title="Jobs" subtitle="All run inside your Supabase project; nothing needs to stay open.">
        <table className="grid-table">
          <thead><tr><th>Job</th><th className="text-left!">Last run</th><th className="text-left!">Result</th><th>FMP calls</th></tr></thead>
          <tbody>
            {Object.entries(TASKS).map(([t, label]) => {
              const r = last(t)
              return (
                <tr key={t}>
                  <td>{label}</td>
                  <td className="text-left!">{r ? ago(r.started_at) : 'not yet'}</td>
                  <td className={`text-left! whitespace-normal ${r?.ok === false ? 'text-loss' : ''}`}>{r ? (r.ok == null ? 'running…' : summary(r)) : '—'}</td>
                  <td className="num">{r?.calls ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
      {c.errs > 0 && <p className="text-[13px] text-muted px-1">{c.errs} stocks have some missing FMP data (common for recent listings and some financials); they show "No data" on the affected pillars.</p>}
    </div>
  )
}

function summary(r) {
  const x = r.detail || {}
  if (x.error) return x.error
  if (r.task === 'universe') return `${x.stocks} stocks, ${x.appended} closes for ${x.date}`
  if (r.task === 'backfill') return `${x.done} loaded, ${x.remaining} to go`
  if (r.task === 'fundamentals') return `${x.done} stocks refreshed${x.failed?.length ? `, ${x.failed.length} failed` : ''}`
  if (r.task === 'score') return `${x.scored} stocks scored`
  return 'ok'
}

function Stat({ label, v, sub }) {
  return <div><div className="label">{label}</div><div className="num text-2xl font-semibold mt-1">{v ?? '—'}</div>{sub && <div className="text-[12.5px] text-muted">{sub}</div>}</div>
}
