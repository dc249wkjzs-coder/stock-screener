export function money(value, currency = 'USD', opts = {}) {
  if (value === null || value === undefined || isNaN(value)) return '—'
  const { compact = false, decimals, sign = false } = opts
  const abs = Math.abs(value)
  const d = decimals ?? (compact ? (abs >= 1e6 ? 2 : abs >= 1e3 ? 1 : 0) : abs < 10 && abs !== 0 ? 2 : 0)
  const s = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: compact && abs >= 1e3 ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : d,
    maximumFractionDigits: d,
    currencyDisplay: currency === 'USD' ? 'narrowSymbol' : 'code',
  }).format(value)
  return sign && value > 0 ? '+' + s : s
}

export function price(value, currency = 'USD') {
  if (value === null || value === undefined || isNaN(value)) return '—'
  const abs = Math.abs(value)
  const d = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d,
    currencyDisplay: currency === 'USD' ? 'narrowSymbol' : 'code',
  }).format(value)
}

export function pct(value, { sign = true, decimals = 1 } = {}) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—'
  const s = (value * 100).toFixed(decimals) + '%'
  return sign && value > 0 ? '+' + s : s
}

export function num(value, decimals) {
  if (value === null || value === undefined || value === '' || isNaN(value)) return '—'
  const v = Number(value)
  const d = decimals ?? (Number.isInteger(v) ? 0 : Math.abs(v) < 1 ? 6 : 4)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(v)
}

export function date(d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!d) return '—'
  const x = typeof d === 'string' && d.length <= 10 ? new Date(d + 'T00:00:00') : new Date(d)
  if (isNaN(x)) return '—'
  return x.toLocaleDateString('en-US', opts)
}

export function ago(d) {
  if (!d) return 'never'
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const days = Math.round(s / 86400)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const tone = (v) => (v == null || isNaN(v) || v === 0 ? 'text-muted' : v > 0 ? 'text-gain' : 'text-loss')
