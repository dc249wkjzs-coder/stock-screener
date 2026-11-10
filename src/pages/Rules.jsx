import { useState } from 'react'
import { useData } from '@/lib/data'
import { Panel, Field } from '@/components/ui'
import { DEFAULT_RULES } from '@shared/pillars.js'

// [key, label, kind] — kind 'pct' shows/edits as a percentage, 'x' as a multiple, 'n' as a plain number.
const GROUPS = [
  ['1 · Moat', [
    ['moatPass', 'Pass at moat score', 'n'],
    ['moatException', 'Exception: moat score allowed with elite value', 'n'],
    ['eliteValueForwardPE', 'Elite value = forward P/E at or below', 'x'],
    ['eliteValuePEG', '…or PEG below', 'x'],
  ]],
  ['2 · Value', [
    ['pegPass', 'PEG below this passes', 'x'],
    ['pegFail', 'PEG above this fails', 'x'],
    ['eliteEbitdaMargin', 'In between, pass with EBITDA margin of', 'pct'],
    ['pegMoatException', '…or moat score of', 'n'],
    ['valueSignalVs5y', 'Value signal: P/E vs own 5-yr average at or below', 'pct'],
  ]],
  ['3 · EPS', [['epsGrowthMin', 'Minimum expected EPS growth per year', 'pct']]],
  ['4 · EBITDA', [['ebitdaThin', 'Flag margins below', 'pct']]],
  ['5 · Debt', [
    ['debtPass', 'Net debt / EBITDA at or below passes', 'x'],
    ['debtYellow', 'Up to this needs a strong moat', 'x'],
    ['debtMoatException', 'Strong moat = score of', 'n'],
    ['strongCoverage', 'Above that, pass with interest coverage of', 'x'],
    ['debtBreaker', 'Always fails above (breaker)', 'x'],
  ]],
  ['8 · New companies', [['newCompanyYears', 'Listed within this many years', 'n']]],
]

const toInput = (v, kind) => (kind === 'pct' ? String(Math.round(v * 1000) / 10) : String(v))
const fromInput = (s, kind) => (s === '' || isNaN(Number(s)) ? null : kind === 'pct' ? Number(s) / 100 : Number(s))

export default function Rules() {
  const d = useData()
  const [form, setForm] = useState(() => Object.fromEntries(GROUPS.flatMap(([, f]) => f).map(([k, , kind]) => [k, toInput(d.rules[k], kind)])))
  const kinds = Object.fromEntries(GROUPS.flatMap(([, f]) => f).map(([k, , kind]) => [k, kind]))
  const save = () => {
    const next = { ...d.rules }
    for (const [k, v] of Object.entries(form)) { const n = fromInput(v, kinds[k]); if (n != null) next[k] = n }
    d.saveRules(next)
  }
  const reset = () => { setForm(Object.fromEntries(Object.entries(kinds).map(([k, kind]) => [k, toInput(DEFAULT_RULES[k], kind)]))); d.saveRules({ ...DEFAULT_RULES }) }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr] items-start">
      <Panel title="Thresholds" subtitle="Defaults follow your written mandate. Changes apply to the screener immediately after saving."
        action={<><button className="btn" onClick={reset}>Reset to mandate</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        <div className="grid gap-6">
          {GROUPS.map(([title, fields]) => (
            <div key={title}>
              <div className="label mb-2">{title}</div>
              <div className="grid sm:grid-cols-2 gap-3">
                {fields.map(([k, label, kind]) => (
                  <Field key={k} label={label} hint={`Mandate default: ${toInput(DEFAULT_RULES[k], kind)}${kind === 'pct' ? '%' : kind === 'x' ? 'x' : ''}`}>
                    <div className="relative">
                      <input className="input num pr-8" inputMode="decimal" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint text-[12px]">{kind === 'pct' ? '%' : kind === 'x' ? 'x' : ''}</span>
                    </div>
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5">
        <Panel title="How the moat score is calculated">
          <ul className="text-[13.5px] grid gap-1.5">
            <li><b>Return on tangible capital</b>, 5-yr average (3 pts): 25%+ = 3, 15–25% = 2, 10–15% = 1. After-tax operating profit ÷ (debt + equity − cash − goodwill & intangibles), so acquisition goodwill doesn't drag it down.</li>
            <li><b>Consistency</b> (2 pts): how many of the 5 years stayed above 10%.</li>
            <li><b>Gross margin level</b> (2 pts): 60%+ = 2, 40–60% = 1.5, 25–40% = 1, 15–25% = 0.5.</li>
            <li><b>Gross margin stability</b> (1 pt): yearly margins moving ±2 points or less = 1, ±4 = 0.5.</li>
            <li><b>Margin premium over peers</b> (2 pts): operating margin at least 2× its industry's median = 2, above the median = 1.</li>
          </ul>
          <p className="text-[12.5px] text-muted mt-3">Total rounded to a whole number (minimum 1). Override any stock's score on its page.</p>
        </Panel>
        <Panel title="How the other numbers are defined">
          <ul className="text-[13px] grid gap-1.5 text-muted">
            <li><b className="text-fg">Forward P/E</b>: latest close ÷ next-12-month consensus EPS (time-weighted blend of the next two fiscal years).</li>
            <li><b className="text-fg">PEG</b>: forward P/E ÷ expected EPS growth, where growth is the annualised change in consensus EPS from the last completed year to two years out.</li>
            <li><b className="text-fg">5-yr P/E average</b>: Starter has no history of forward P/E, so the value signal compares trailing P/E with its own 5-year average.</li>
            <li><b className="text-fg">Financing</b>: SEC prospectus filings (424B, S-1) in the last 90 days. Shelf registrations (S-3) are a caution, not a fail.</li>
            <li><b className="text-fg">Fibonacci</b>: swing high = highest close in 52 weeks; swing low = lowest close in the 52 weeks before it.</li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}
