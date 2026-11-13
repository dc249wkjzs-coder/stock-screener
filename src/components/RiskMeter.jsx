import Term from './Term'

const TONE = {
  gain: { text: 'text-gain', bg: 'bg-gain' },
  accent: { text: 'text-accent', bg: 'bg-accent' },
  warn: { text: 'text-warn', bg: 'bg-warn' },
  loss: { text: 'text-loss', bg: 'bg-loss' },
}
const SEGMENTS = ['gain', 'accent', 'warn', 'loss']

// Four-step bar with the level name and, unless compact, what drives it.
export default function RiskMeter({ risk, compact }) {
  if (!risk) return <div className="text-muted text-[13px]">No stocks match, so there's nothing to measure.</div>
  const t = TONE[risk.level.tone]
  const pos = Math.min(99, (risk.score / 4) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className={`text-lg font-semibold ${t.text}`}><Term id="risk-level">{risk.level.label}</Term></div>
        <div className="text-[12px] text-muted num">{risk.score.toFixed(1)} / 4</div>
      </div>
      <div className="relative mt-2">
        <div className="grid grid-cols-4 gap-1">
          {SEGMENTS.map((s) => <div key={s} className={`h-2 rounded-full ${TONE[s].bg} opacity-30`} />)}
        </div>
        <div className="absolute -top-1 h-4 w-1 rounded bg-fg" style={{ left: `calc(${pos}% - 2px)` }} />
      </div>
      <div className="grid grid-cols-4 text-[10.5px] text-faint mt-1"><span>Lower</span><span>Moderate</span><span>High</span><span className="text-right">Very high</span></div>
      {!compact && (
        <ul className="mt-3 grid gap-1 text-[12.5px]">
          {risk.drivers.map((f) => (
            <li key={f.key} className="flex gap-2">
              <span className={`shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full ${TONE[SEGMENTS[Math.min(3, f.score)]].bg}`} />
              <span><span className="font-semibold">{f.label}:</span> <span className="text-muted">{f.text}</span></span>
            </li>
          ))}
          {risk.concentrated && <li className="text-warn">Only {risk.n} stock{risk.n === 1 ? '' : 's'}: a small group carries more single-company risk.</li>}
        </ul>
      )}
    </div>
  )
}
