import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ShoppingCart, Minus, Plus, X, ArrowRight } from 'lucide-react'
import { useData } from '@/lib/data'
import { usd } from '@/components/pillarUi'
import { resolveWeights } from '@shared/portfolio.js'

// The stock cart in the top-right corner: shows how many stocks are chosen, lets you add and remove them,
// and "Check out" opens My portfolio, where the chosen stocks are scored as a portfolio.
export default function StockCart({ dark = false }) {
  const d = useData()
  const navigate = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [bump, setBump] = useState(false)
  const box = useRef(null)
  const n = d.portfolio.length

  // Close on outside click, Escape, or page change.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => { setOpen(false) }, [loc.pathname])
  // A little bounce on the badge whenever the count changes.
  const prev = useRef(n)
  useEffect(() => { if (n !== prev.current) { setBump(true); const t = setTimeout(() => setBump(false), 350); prev.current = n; return () => clearTimeout(t) } }, [n])

  const weights = useMemo(() => resolveWeights(d.portfolio), [d.portfolio])
  const found = useMemo(() => {
    const t = q.trim().toUpperCase()
    if (!t) return []
    const starts = d.stocks.filter((s) => s.symbol.startsWith(t))
    const named = d.stocks.filter((s) => !s.symbol.startsWith(t) && s.name?.toUpperCase().includes(t))
    return [...starts.sort((a, b) => a.symbol.length - b.symbol.length || (b.marketCap || 0) - (a.marketCap || 0)), ...named.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))].slice(0, 6)
  }, [q, d.stocks])

  const checkout = () => { setOpen(false); navigate('/portfolio') }

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} title="Stock cart"
        className={`relative inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px] font-medium border ${dark ? 'border-white/20 text-white hover:bg-white/10' : 'border-line bg-surface hover:border-accent shadow-sm'}`}>
        <ShoppingCart size={17} />
        <span className="hidden sm:inline">Stock cart</span>
        <span className={`min-w-5 h-5 px-1 grid place-items-center rounded-full text-[11.5px] font-semibold num transition-transform ${n ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'} ${bump ? 'scale-125' : ''}`}>{n}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(360px,calc(100vw-24px))] z-50 card shadow-xl text-fg">
          <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b border-line">
            <div className="font-semibold">Stock cart <span className="text-muted font-normal">· {n} stock{n === 1 ? '' : 's'}</span></div>
            <button className="text-muted hover:text-fg" onClick={() => setOpen(false)} title="Close"><X size={16} /></button>
          </div>

          <div className="px-4 py-2.5 border-b border-line relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a stock: type a ticker or name"
              className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-[13.5px] outline-none focus:border-accent" />
            {found.length > 0 && (
              <div className="mt-1.5 grid">
                {found.map((s) => {
                  const inside = d.inPortfolio(s.symbol)
                  return (
                    <div key={s.symbol} className="flex items-center gap-2 py-1.5 text-[13px]">
                      <span className="font-semibold w-14 shrink-0">{s.symbol}</span>
                      <span className="flex-1 truncate text-muted">{s.name}</span>
                      <button className={`w-6 h-6 grid place-items-center rounded border ${inside ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:border-accent hover:text-accent'}`}
                        title={inside ? `Remove ${s.symbol}` : `Add ${s.symbol}`} onClick={() => (inside ? d.removeFromPortfolio(s.symbol) : d.addToPortfolio(s.symbol))}>
                        {inside ? <Minus size={12} /> : <Plus size={12} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="max-h-[45vh] overflow-y-auto">
            {n === 0 ? (
              <p className="px-4 py-5 text-[13px] text-muted">Your cart is empty. Press <Plus size={12} className="inline" /> next to any stock, or type one above.</p>
            ) : d.portfolio.map((p) => {
              const s = d.bySymbol[p.symbol]
              return (
                <div key={p.symbol} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2">
                  <Link to={`/stock/${p.symbol}`} className="min-w-0 flex-1" onClick={() => setOpen(false)}>
                    <div className="font-semibold text-accent text-[13.5px]">{p.symbol}</div>
                    <div className="text-[12px] text-muted truncate">{s?.name || 'not in the data right now'}</div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="num text-[13px]">{usd(s?.price)}</div>
                    <div className="num text-[11.5px] text-muted">{((weights[p.symbol] || 0) * 100).toFixed(0)}% share</div>
                  </div>
                  <button className="w-6 h-6 grid place-items-center rounded border border-line text-muted hover:border-loss hover:text-loss shrink-0" title={`Remove ${p.symbol}`} onClick={() => d.removeFromPortfolio(p.symbol)}><Minus size={12} /></button>
                </div>
              )
            })}
          </div>

          <div className="p-3 border-t border-line">
            <button className="btn btn-primary w-full justify-center" disabled={!n} onClick={checkout}>
              Check out · score my portfolio <ArrowRight size={14} />
            </button>
            {n > 0 && <button className="mt-2 w-full text-[12px] text-muted hover:text-loss" onClick={() => { if (window.confirm('Empty the stock cart?')) d.clearPortfolio() }}>Empty cart</button>}
          </div>
        </div>
      )}
    </div>
  )
}
