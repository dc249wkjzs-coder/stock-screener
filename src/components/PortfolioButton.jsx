import { Plus, Minus, Check } from 'lucide-react'
import { useData } from '@/lib/data'

// + adds a stock to the stock cart (My portfolio); once it's in, the button shows a tick and − takes it out again.
export default function PortfolioButton({ symbol, full = false }) {
  const d = useData()
  const inside = d.inPortfolio(symbol)
  const click = (e) => { e.stopPropagation(); e.preventDefault(); inside ? d.removeFromPortfolio(symbol) : d.addToPortfolio(symbol) }
  if (full) {
    return (
      <button className={`btn ${inside ? '' : 'btn-primary'}`} onClick={click}>
        {inside ? <><Check size={14} /> In your cart · <Minus size={13} /> Remove</> : <><Plus size={14} /> Add to stock cart</>}
      </button>
    )
  }
  return (
    <button onClick={click} title={inside ? `Remove ${symbol} from the stock cart` : `Add ${symbol} to the stock cart`}
      className={`group inline-grid place-items-center w-6 h-6 rounded-md border text-[12px] shrink-0 ${inside ? 'bg-accent border-accent text-accent-fg' : 'border-line text-muted hover:border-accent hover:text-accent'}`}>
      {inside ? <><Check size={13} className="group-hover:hidden" /><Minus size={13} className="hidden group-hover:block" /></> : <Plus size={13} />}
    </button>
  )
}
