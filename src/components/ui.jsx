import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { pct, tone } from '@/lib/format'

export function Panel({ title, subtitle, action, children, className = '', pad = true }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex flex-wrap gap-2">{action}</div>}
        </header>
      )}
      <div className={pad ? 'px-5 pb-5' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, subTone, big }) {
  // Words (like a category name) wrap instead of being cut off; numbers stay on one line.
  const words = typeof value === 'string' && /[a-z]{3}/.test(value)
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={`num mt-1 font-semibold ${big ? 'text-2xl sm:text-3xl xl:text-4xl' : words ? 'text-lg leading-snug' : 'text-xl'} ${words ? 'break-words' : 'truncate'}`}>{value}</div>
      {sub != null && <div className={`text-[13px] mt-0.5 num ${subTone || 'text-muted'}`}>{sub}</div>}
    </div>
  )
}

export function StatRow({ children }) {
  return <div className="card grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-5 p-5">{children}</div>
}

export function Pct({ v, decimals = 1, className = '' }) {
  return <span className={`num ${tone(v)} ${className}`}>{pct(v, { decimals })}</span>
}

export function Badge({ children, tone = 'neutral', title }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    gain: 'bg-gain-soft text-gain',
    loss: 'bg-loss-soft text-loss',
  }
  return (
    <span title={title} className={`inline-flex items-center rounded px-1.5 py-px text-[10.5px] font-bold tracking-wider uppercase ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Sparkline({ data, width = 84, height = 26 }) {
  if (!data || data.length < 2) return <span className="text-faint">—</span>
  const min = Math.min(...data), max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)])
  const up = data[data.length - 1] >= data[0]
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const color = up ? 'var(--gain)' : 'var(--loss)'
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block align-middle">
      <path d={`${d} L${width} ${height} L0 ${height}Z`} fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  )
}

export function Modal({ open, title, onClose, children, wide, xl }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" onMouseDown={onClose}>
      <div
        className={`card w-full ${xl ? 'sm:max-w-4xl' : wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-auto rounded-b-none sm:rounded-b-xl`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 sticky top-0 bg-surface z-10">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn btn-ghost px-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-[12.5px] font-semibold text-muted mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-faint mt-1">{hint}</span>}
    </label>
  )
}

/** Simple controlled form: values held as strings, converted on submit. */
export function useForm(initial) {
  const [v, setV] = useState(initial)
  const bind = (k, type = 'text') => ({
    id: 'f-' + k,
    value: v[k] ?? '',
    onChange: (e) => setV((s) => ({ ...s, [k]: type === 'checkbox' ? e.target.checked : e.target.value })),
    ...(type === 'checkbox' ? { checked: !!v[k], type: 'checkbox' } : {}),
  })
  return { v, setV, bind }
}

export const n = (x) => (x === '' || x === null || x === undefined || isNaN(Number(x)) ? null : Number(x))
export const s = (x) => (x === '' || x === undefined ? null : x)

export function ConfirmDelete({ onConfirm, label = 'Delete' }) {
  const [ask, setAsk] = useState(false)
  if (!ask) return <button type="button" className="btn btn-ghost btn-danger" onClick={() => setAsk(true)}>{label}</button>
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[13px] text-muted">Sure?</span>
      <button type="button" className="btn btn-ghost btn-danger" onClick={onConfirm}>Yes, delete</button>
      <button type="button" className="btn btn-ghost" onClick={() => setAsk(false)}>Cancel</button>
    </span>
  )
}

export function FormActions({ onCancel, onDelete, saving, disabled, saveLabel = 'Save' }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-2 border-t border-line">
      <div>{onDelete && <ConfirmDelete onConfirm={onDelete} />}</div>
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving || disabled}>{saving ? 'Saving…' : saveLabel}</button>
      </div>
    </div>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="font-semibold">{title}</div>
      {children && <p className="text-muted text-[13px] mt-1 max-w-md mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Sort helper for tables. */
export function useSort(rows, initialKey, initialDir = 'desc') {
  const [key, setKey] = useState(initialKey)
  const [dir, setDir] = useState(initialDir)
  const sorted = useMemo(() => {
    const r = [...rows]
    r.sort((a, b) => {
      const x = a[key], y = b[key]
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y
      return dir === 'asc' ? c : -c
    })
    return r
  }, [rows, key, dir])
  const th = (k, label, extra = '') => (
    <th className={`sortable ${extra}`} onClick={() => { if (k === key) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setKey(k); setDir('desc') } }}>
      {label}{k === key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
  return { sorted, th }
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v} type="button" onClick={() => onChange(v)}
          className={`px-2.5 py-1 text-[12.5px] font-semibold rounded-md ${value === v ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'}`}
        >{label}</button>
      ))}
    </div>
  )
}

/** Horizontal stacked bar with legend. */
export function AllocationBar({ items, fmt, total }) {
  const sum = total ?? items.reduce((a, b) => a + Math.max(0, b.value), 0)
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        {items.filter((i) => i.value > 0).map((i) => (
          <div key={i.key} style={{ width: `${(i.value / sum) * 100}%`, background: i.color }} title={i.label} />
        ))}
      </div>
      <ul className="mt-4 grid gap-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: i.color }} />
              <span className="truncate">{i.label}</span>
            </span>
            <span className="flex items-baseline gap-3 shrink-0">
              <span className="num">{fmt(i.value)}</span>
              <span className="num text-muted w-12 text-right">{sum ? pct(i.value / sum, { sign: false }) : '—'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
