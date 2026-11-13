import { Check, X } from 'lucide-react'
import { Panel } from './ui'
import { SETUP, fp, usd } from './pillarUi'
import { downside } from '@shared/valuation.js'
import Term from './Term'

const METHOD_TERM = { dcf: 'dcf', histPE: 'pe-5y', pegPE: 'mandate-pe', analyst: 'analyst-target' }

const TONE = {
  'zone-confirmed': 'border-gain/50 bg-gain-soft', zone: 'border-warn/50 bg-accent-soft', wait: 'border-line bg-surface-2',
  extended: 'border-line bg-surface-2', below: 'border-loss/40 bg-loss-soft', incomplete: 'border-line bg-surface-2', fail: 'border-loss/40 bg-loss-soft',
}

export default function PlanPanel({ s, guide = null }) {
  const st = s.setup
  const fair = s.fair
  const down = downside(s)
  return (
    <Panel title="Valuation and entry plan" subtitle="Fixed rules applied to the data: a reading of the numbers, not a forecast or advice.">
      <div className={`rounded-lg border px-4 py-3 mb-5 ${TONE[st.status]}`}>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted"><Term id={st.status.startsWith('zone') ? 'confirmation' : st.status === 'fail' ? 'pillars' : 'buy-zone'}>{SETUP[st.status].label}</Term></div>
        <div className="text-lg font-semibold mt-0.5">{st.title}</div>
        <div className="text-[13.5px] text-muted mt-0.5">{st.detail}</div>
        {['zone', 'zone-confirmed', 'wait', 'extended'].includes(st.status) && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[13px]">
            {st.checks.map((c) => (
              <span key={c.label} className={`inline-flex items-center gap-1 ${c.ok ? 'text-gain' : 'text-muted'}`}>
                {c.ok ? <Check size={14} /> : <X size={14} />}{c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <div className="label mb-2"><Term id="fair-value">Fair value</Term></div>
          {fair ? (
            <>
              <RangeBar low={fair.low} mid={fair.mid} high={fair.high} price={s.price} />
              <div className="text-[13.5px] mt-3">
                Range {usd(fair.low)} – {usd(fair.high)}, middle <b>{usd(fair.mid)}</b>.
                The price is <b className={fair.vsMid < 0 ? 'text-gain' : 'text-loss'}>{fp(Math.abs(fair.vsMid), 0)} {fair.vsMid < 0 ? 'below' : 'above'}</b> the middle.
              </div>
              <table className="w-full text-[12.5px] mt-3">
                <tbody>
                  {fair.methods.map((m) => (
                    <tr key={m.key} className="border-t border-line/60">
                      <td className="py-1.5 pr-2"><Term id={METHOD_TERM[m.key]}>{m.label}</Term><div className="text-faint text-[11.5px]">{m.how}</div></td>
                      <td className="py-1.5 num text-right align-top">{usd(m.value)}</td>
                      <td className={`py-1.5 num text-right align-top pl-2 ${m.value > s.price ? 'text-gain' : 'text-loss'}`}>{fp(m.value / s.price - 1, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <div className="text-muted text-[13px]">Not enough data for a fair value (needs earnings estimates, a DCF or analyst targets).</div>}
        </div>

        <div>
          <div className="label mb-2"><Term id="buy-ladder">Buy levels</Term> (<Term id="fibonacci">Fibonacci</Term> only)</div>
          {st.ladder.length ? (
            <>
              <table className="w-full text-[13px]">
                <thead><tr className="text-muted text-[11px] uppercase tracking-wider"><th className="text-left pb-1">Level</th><th className="text-right pb-1">Price</th><th className="text-right pb-1">vs now</th>{guide > 0 && <th className="text-right pb-1">Amount</th>}</tr></thead>
                <tbody>
                  {st.ladder.map((l) => (
                    <tr key={l.ratio} className={`border-t border-line/60 ${st.zoneLevel?.ratio === l.ratio ? 'font-semibold text-accent' : ''}`}>
                      <td className="py-1.5 num">{(l.ratio * 100).toFixed(l.ratio === 1 ? 0 : 1)}%{l.ratio === 1 ? ' swing low' : ''}</td>
                      <td className="py-1.5 num text-right">{usd(l.price)}</td>
                      <td className="py-1.5 num text-right">{fp(l.pct, 1)}</td>
                      {guide > 0 && <td className="py-1.5 num text-right">{usd(l.amount)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[12px] text-faint mt-2">
                                Levels from the 38.2% retracement down to the swing low.{fair && st.ladder.some((l) => l.price < fair.mid) ? ` Every level shown is ${st.ladder.every((l) => l.price < fair.low) ? 'below the whole fair value range' : 'below the fair value middle'} ${usd(fair.mid)}` : ''}.
              </div>
            </>
          ) : <div className="text-muted text-[13px]">No Fibonacci levels at or below the price.</div>}
        </div>

        <div>
          <div className="label mb-2"><Term id="pullback">How far it could fall</Term> (reference levels)</div>
          {down ? (
            <>
              <table className="w-full text-[13px]">
                <tbody>
                  {down.rows.slice(0, 6).map((r) => (
                    <tr key={r.label} className="border-t border-line/60 first:border-0">
                      <td className="py-1.5">{r.label}</td>
                      <td className="py-1.5 num text-right">{usd(r.price)}</td>
                      <td className="py-1.5 num text-right text-loss">{fp(r.pct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[12.5px] text-muted mt-3 grid gap-1">
                {down.typicalFloor && (down.typicalFloor.price >= s.price
                  ? <div>Typical pullback: {fp(Math.abs(down.typicalFloor.depth), 0)} from a high (median of its {s.pullbackCount} drops of 5%+ in ~2 years). Today it is already {fp(Math.abs(s.price / s.high52 - 1), 0)} below its 52-week high, deeper than usual.</div>
                  : <div>Typical pullback: {fp(Math.abs(down.typicalFloor.depth), 0)} from a high (median of its {s.pullbackCount} drops of 5%+ in ~2 years), which would be <span className="num">{usd(down.typicalFloor.price)}</span> ({fp(down.typicalFloor.pct, 1)} from here).</div>)}
                {down.worstFloor && (down.worstFloor.price >= s.price
                  ? <div>Deepest pullback in ~2 years: {fp(Math.abs(down.worstFloor.depth), 0)}. Today's drop is at least as deep.</div>
                  : <div>Deepest pullback in ~2 years: {fp(Math.abs(down.worstFloor.depth), 0)}, which would be <span className="num">{usd(down.worstFloor.price)}</span> ({fp(down.worstFloor.pct, 1)} from here).</div>)}
                {down.crash != null && <div>Crash test (QQQ −25% × beta {s.beta?.toFixed(2)}): {fp(down.crash, 0)}.</div>}
              </div>
            </>
          ) : <div className="text-muted text-[13px]">No price history yet.</div>}
        </div>
      </div>
    </Panel>
  )
}

// Horizontal bar: fair value range with the middle and the current price marked.
function RangeBar({ low, mid, high, price }) {
  const lo = Math.min(low, price) * 0.97, hi = Math.max(high, price) * 1.03
  const x = (v) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div className="relative h-10">
      <div className="absolute top-4 h-2 rounded-full bg-surface-2 inset-x-0" />
      <div className="absolute top-4 h-2 rounded-full bg-gain/30" style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})` }} />
      <div className="absolute top-3 h-4 w-0.5 bg-gain" style={{ left: x(mid) }} title={`Middle ${usd(mid)}`} />
      <div className="absolute top-2 -translate-x-1/2 flex flex-col items-center" style={{ left: x(price) }}>
        <div className="w-3 h-3 rounded-full bg-fg border-2 border-surface" />
        <div className="text-[10.5px] num font-semibold mt-1 whitespace-nowrap">now {usd(price)}</div>
      </div>
    </div>
  )
}
