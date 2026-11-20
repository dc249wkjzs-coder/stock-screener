import PriceChart from './PriceChart'
import { Panel } from './ui'
import Term from './Term'
import { fp, fn, usd } from './pillarUi'
import { date as fdate } from '@/lib/format'

// The price chart with moving averages and the Fibonacci levels table (stocks and ETFs).
export default function FibPanel({ s, prices }) {
  const f = s.fib
  const hi = f?.swingHigh.price, lo = f?.swingLow.price
  const ma = (v) => { if (v == null || !s.price) return ''; const g = s.price / v - 1; return ` · price is ${fp(Math.abs(g), 1)} ${g >= 0 ? 'above' : 'below'}` }
  return (
    <Panel title="Chart, moving averages and Fibonacci entry levels"
      subtitle={f ? `Swing low ${usd(lo)} on ${fdate(f.swingLow.date)} → swing high ${usd(hi)} on ${fdate(f.swingHigh.date)}, daily closes. The highlighted dashed line is the next support below the price.` : 'Not enough price history yet for Fibonacci levels.'}>
      <PriceChart prices={prices} fib={f} symbol={s.symbol} />
      {f && (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] mt-5 pt-4 border-t border-line">
          <table className="w-full text-[13px]">
            <thead><tr className="text-muted text-[11px] uppercase tracking-wider"><th className="text-left pb-1">Level</th><th className="text-left pb-1 hidden sm:table-cell">Calculation</th><th className="text-right pb-1">Price</th><th className="text-right pb-1">vs now</th></tr></thead>
            <tbody>
              {f.levels.map((l) => (
                <tr key={l.ratio} className={`border-t border-line/60 ${f.nextSupport?.ratio === l.ratio ? 'font-semibold text-accent' : ''}`}>
                  <td className="py-1.5 num">{(l.ratio * 100).toFixed(1)}%{l.ratio === 1 ? ' (swing low)' : ''}</td>
                  <td className="py-1.5 num text-muted text-[12px] hidden sm:table-cell">{hi.toFixed(2)} − {l.ratio} × {f.range.toFixed(2)}</td>
                  <td className="py-1.5 num text-right">{usd(l.price)}</td>
                  <td className="py-1.5 num text-right">{fp(l.price / s.price - 1, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[13px] grid gap-1.5 content-start">
            <div><span className="text-muted"><Term id="fibonacci">Next support</Term>:</span> {f.nextSupport ? `${(f.nextSupport.ratio * 100).toFixed(1)}% at ${usd(f.nextSupport.price)} (${fp(f.nextSupport.price / s.price - 1, 1)})` : f.belowSwing ? `none, the price is below the swing low (${usd(lo)})` : 'none'}</div>
            <div><span className="text-muted">Retraced:</span> {fp(f.retraced, 0)} of the swing</div>
            <div><span className="text-muted"><Term id="sma-50">50-day average</Term>:</span> {usd(s.sma50)}{ma(s.sma50)}</div>
            <div><span className="text-muted"><Term id="sma-200">200-day average</Term>:</span> {usd(s.sma200)}{ma(s.sma200)}</div>
            <div><span className="text-muted"><Term id="rsi">RSI (14)</Term>:</span> {fn(s.rsi14)}{s.rsi14 < 30 ? ' · oversold' : s.rsi14 > 70 ? ' · overbought' : ''}</div>
            {f.widened && <div className="text-[12.5px] text-muted">The 52-week swing was broken, so the swing low is the lowest close in the last ~2 years.</div>}
            <div className="text-[12px] text-faint">Formula: level = swing high − ratio × (swing high − swing low).</div>
          </div>
        </div>
      )}
    </Panel>
  )
}
