import { Plus, Minus, Check } from 'lucide-react'
import { useData } from '@/lib/data'

// Adds a stock to the stock cart (My portfolio) or takes it out again.
// Not in the cart: blue-tinted "+ Add". In the cart: solid blue "✓ Added", which turns into a red "− Remove" on hover.
export default function PortfolioButton({ symbol, full = false }) {
  const d = useData()
  const inside = d.inPortfolio(symbol)
  const click = (e) => { e.stopPropagation(); e.preventDefault(); inside ? d.removeFromPortfolio(symbol) : d.addToPortfolio(symbol) }
  const title = inside ? `Remove ${symbol} from the stock cart` : `Add ${symbol} to the stock cart`
  const base = 'group inline-flex items-center justify-center gap-1 rounded-full font-semibold whitespace-nowrap transition-colors shrink-0 border'
  const look = inside
    ? 'bg-accent border-accent text-accent-fg hover:bg-loss hover:border-loss'
    : 'bg-accent-soft border-accent/40 text-accent hover:bg-accent hover:text-accent-fg hover:border-accent'
  const size = full ? 'px-4 py-2 text-[13.5px]' : 'w-[84px] py-1 text-[12.5px]'
  return (
    <button onClick={click} title={title} aria-label={title} aria-pressed={inside} className={`${base} ${look} ${size}`}>
      {inside ? (
        <>
          <span className="inline-flex items-center gap-1 group-hover:hidden"><Check size={full ? 15 : 13} strokeWidth={2.6} /> {full ? 'In your cart' : 'Added'}</span>
          <span className="hidden items-center gap-1 group-hover:inline-flex"><Minus size={full ? 15 : 13} strokeWidth={2.6} /> Remove</span>
        </>
      ) : (
        <><Plus size={full ? 15 : 13} strokeWidth={2.6} /> {full ? 'Add to stock cart' : 'Add'}</>
      )}
    </button>
  )
}
