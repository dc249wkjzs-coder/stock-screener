import { PILLARS } from '@shared/pillars.js'

// Status colours: pass = green, warn = amber, fail = red, info/nodata = grey.
export const STATUS = {
  pass: { dot: 'bg-gain', text: 'text-gain', soft: 'bg-gain-soft text-gain', label: 'Pass' },
  warn: { dot: 'bg-warn', text: 'text-warn', soft: 'bg-accent-soft text-warn', label: 'Caution' },
  fail: { dot: 'bg-loss', text: 'text-loss', soft: 'bg-loss-soft text-loss', label: 'Fail' },
  info: { dot: 'bg-faint', text: 'text-muted', soft: 'bg-surface-2 text-muted', label: 'Info' },
  nodata: { dot: 'border border-faint bg-transparent', text: 'text-faint', soft: 'bg-surface-2 text-faint', label: 'No data' },
}

export const VERDICT = {
  pass: { label: 'Passes', cls: 'bg-gain-soft text-gain' },
  'pass-warn': { label: 'Passes · caution', cls: 'bg-accent-soft text-warn' },
  fail: { label: 'Fails', cls: 'bg-loss-soft text-loss' },
  incomplete: { label: 'Incomplete', cls: 'bg-surface-2 text-muted' },
}

export function PillarDots({ pillars }) {
  return (
    <span className="inline-flex gap-1 align-middle">
      {PILLARS.slice(0, 6).map(([k, label]) => {
        const p = pillars[k]
        return <span key={k} title={`${label}: ${p.why}`} className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS[p.status].dot}`} />
      })}
    </span>
  )
}

export function Verdict({ e, short }) {
  const v = VERDICT[e.overall]
  const fail = e.firstFail ? PILLARS.find(([k]) => k === e.firstFail)[1].replace(/^\d · /, '') : null
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-px text-[11px] font-semibold ${v.cls}`}>
      {e.overall === 'fail' && short ? `Fails ${fail}` : e.overall === 'fail' ? `Fails at ${fail}` : v.label}
    </span>
  )
}

export const fx = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${v.toFixed(d)}x`)
const noNegZero = (s) => (/^-0(\.0+)?$/.test(s) ? s.slice(1) : s)
export const fp = (v, d = 0) => (v == null || !isFinite(v) ? '—' : `${noNegZero((v * 100).toFixed(d))}%`)
export const fn = (v, d = 0) => (v == null || !isFinite(v) ? '—' : noNegZero(v.toFixed(d)))
export const usd = (v) => (v == null || !isFinite(v) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v))
export const cap = (v) => (v == null ? '—' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`)
