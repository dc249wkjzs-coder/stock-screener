import PortfolioButton from '@/components/PortfolioButton'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useData } from '@/lib/data'
import { cap, usd } from '@/components/pillarUi'

// A library search: type a ticker or company name, open its page.
export default function Lookup() {
  const d = useData()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const term = q.trim().toUpperCase()

  const found = useMemo(() => {
    if (!term) return []
    const score = (s) => (s.symbol === term ? 0 : s.symbol.startsWith(term) ? 1 : (s.name || '').toUpperCase().startsWith(term) ? 2 : 3)
    return d.stocks.filter((s) => s.symbol.includes(term) || (s.name || '').toUpperCase().includes(term))
      .sort((a, b) => score(a) - score(b) || (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 30)
  }, [d.stocks, term])
  const waiting = useMemo(() => (term ? (d.pending || []).filter((p) => p.symbol.includes(term) || (p.name || '').toUpperCase().includes(term)).slice(0, 10) : []), [d.pending, term])
  const biggest = useMemo(() => [...d.stocks].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 16), [d.stocks])

  return (
    <div className="grid gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Look up a stock</h1>
        <p className="text-muted text-[14px] mt-1">Any US-listed stock over $500M: its chart, buy levels, fair value, moat, AI impact and news.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (found[0]) navigate(`/stock/${found[0].symbol}`) }} className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input autoFocus className="input pl-11 py-3 text-[16px]" placeholder="Ticker or company, e.g. NVDA or Visa" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {term ? (
        <div className="card divide-y divide-line">
          {found.map((s) => (
            <Link key={s.symbol} to={`/stock/${s.symbol}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
              <span className="font-semibold text-accent w-16 shrink-0">{s.symbol}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{s.name}</span><span className="block text-[12px] text-muted truncate">{s.industry}</span></span>
              <span className="text-right shrink-0"><span className="block num text-[13.5px]">{usd(s.price)}</span><span className="block num text-[12px] text-muted">{cap(s.marketCap)}</span></span>
              <PortfolioButton symbol={s.symbol} />
            </Link>
          ))}
          {waiting.map((p) => (
            <Link key={p.symbol} to={`/stock/${p.symbol}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
              <span className="font-semibold w-16 shrink-0">{p.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{p.name}</span>
              <span className="text-[12px] text-muted shrink-0">data still loading</span>
            </Link>
          ))}
          {!found.length && !waiting.length && <div className="px-4 py-6 text-muted text-[14px]">Nothing found for "{q}". The screener covers US-listed stocks over $500M (no ETFs or funds).</div>}
        </div>
      ) : (
        <div>
          <div className="label mb-2">Largest companies</div>
          <div className="flex flex-wrap gap-2">
            {biggest.map((s) => <Link key={s.symbol} to={`/stock/${s.symbol}`} className="rounded-full border border-line px-3 py-1 text-[13px] font-semibold hover:border-accent hover:text-accent" title={s.name}>{s.symbol}</Link>)}
          </div>
        </div>
      )}
    </div>
  )
}
