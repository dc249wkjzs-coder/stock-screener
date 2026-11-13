import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useData } from '@/lib/data'
import { BLANK, PRESETS, STRATEGIES, THEMES, OPTIONS, optionLabel, matches, activeCount, riskProfile, toParams } from '@shared/criteria.js'
import RiskMeter from '@/components/RiskMeter'
import { Info } from '@/components/Term'

// The boxes on the landing page, in order. Each one sets one part of the screen.
const BOXES = [
  { key: 'moatMin', title: 'Moat', q: 'How strong a competitive advantage? (minimum, 1–10)', term: 'moat' },
  { key: 'roicMin', title: 'Return on capital', q: 'Profit made on the money invested in the business (5-year median), at least', term: 'roic' },
  { key: 'debtMax', title: 'Debt', q: 'How much debt is OK? (net debt ÷ EBITDA)', term: 'net-debt-ebitda' },
  { key: 'health', title: 'Financial health', q: 'Scores that flag weak or strong finances', term: 'piotroski' },
  { key: 'pe', title: 'P/E', q: 'Forward P/E: the price you pay for each $1 of next year\'s earnings', term: 'forward-pe' },
  { key: 'pegMax', title: 'PEG', q: 'P/E compared with growth (lower = cheaper for its growth)', term: 'peg' },
  { key: 'magicTop', title: 'Magic Formula', q: 'Rank on profit for the price plus return on capital', term: 'magic-formula' },
  { key: 'growthMin', title: 'Earnings growth', q: 'Expected EPS growth a year, at least', term: 'eps-growth' },
  { key: 'revGrowthMin', title: 'Sales growth', q: 'Revenue growth last year, at least', term: 'revenue-growth' },
  { key: 'marginMin', title: 'Profit margin', q: 'EBITDA margin, at least', term: 'ebitda-margin' },
  { key: 'fcfYieldMin', title: 'Free cash flow', q: 'Real cash left over, compared with the share price', term: 'fcf-yield' },
  { key: 'dividend', title: 'Dividend', q: 'Cash paid to shareholders each year', term: 'dividend-yield' },
  { key: 'cap', title: 'Company size', q: 'Market value', term: 'market-cap' },
  { key: 'betaMax', title: 'Volatility', q: 'Beta, at most (1 = moves like the market)', term: 'beta' },
  { key: 'dropMax', title: 'Past drops', q: 'Deepest fall from a high in ~2 years, no worse than', term: 'pullback' },
  { key: 'chg1yMin', title: 'Price momentum', q: 'Share price change over the last 12 months, at least', term: 'momentum' },
  { key: 'quality', title: 'Quality checks', q: 'Rule out loss-makers and companies selling new shares', term: 'gaap-adjusted' },
  { key: 'ai', title: 'AI', q: 'Exposure to AI disruption, and how much AI helps', term: 'ai-risk' },
  { key: 'entry', title: 'Entry timing', q: 'Only show stocks at a good moment to buy', term: 'buy-zone' },
]

export default function Build() {
  const d = useData()
  const navigate = useNavigate()
  const c = d.screen
  const set = (patch) => d.setScreen({ ...c, ...patch })
  const [name, setName] = useState('')

  const hits = useMemo(() => d.stocks.filter((s) => matches(s, c)), [d.stocks, c])
  const risk = useMemo(() => riskProfile(hits), [hits])
  const n = activeCount(c)
  const go = () => navigate(`/results?${toParams(c)}`)
  const same = (a) => JSON.stringify({ ...BLANK, ...a }) === JSON.stringify({ ...BLANK, ...c })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start pb-24 lg:pb-0">
      <div className="grid gap-6 min-w-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock finder</h1>
          <p className="text-muted text-[14px] mt-1 max-w-2xl">Pick what matters to you in each box, or start from a preset. The risk meter reads the stocks that match as you go. Then press Continue to see them.</p>
        </div>

        <section className="grid gap-4">
          {d.presets.length > 0 && (
            <div className="grid gap-2">
              <div className="label">Your presets</div>
              <div className="flex flex-wrap gap-2">
                {d.presets.map((p) => (
                  <span key={p.id} className={`inline-flex items-center rounded-full border ${same(p.criteria) ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>
                    <button className="pl-3 pr-1.5 py-1.5 text-[13px] font-semibold" onClick={() => d.setScreen({ ...BLANK, ...p.criteria })} title="Your saved preset">★ {p.name}</button>
                    <button className="pr-2.5 pl-1 py-1.5 text-faint hover:text-loss" title={`Delete "${p.name}"`} aria-label={`Delete ${p.name}`}
                      onClick={() => { if (confirm(`Delete the preset "${p.name}"?`)) d.deletePreset(p) }}><Trash2 size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <div className="flex items-baseline gap-2"><div className="label">Quick start</div><span className="text-[12px] text-faint">simple starting points</span></div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.id} title={p.blurb} onClick={() => d.setScreen({ ...BLANK, ...p.c })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${same(p.c) ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:border-fg/30'}`}>{p.label}</button>
              ))}
              <button className="rounded-full px-3 py-1.5 text-[13px] text-muted hover:text-fg inline-flex items-center gap-1" onClick={() => d.setScreen({ ...BLANK })}><RotateCcw size={13} /> Clear all</button>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-baseline gap-2"><div className="label">Investor strategies</div><span className="text-[12px] text-faint">well-known approaches, each a fixed set of rules<Info id="investor-strategies" /></span></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {STRATEGIES.map((p) => {
                const on = same(p.c)
                return (
                  <button key={p.id} onClick={() => d.setScreen({ ...BLANK, ...p.c })} aria-pressed={on}
                    className={`text-left rounded-2xl border px-3.5 py-2.5 transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent/50'}`}>
                    <div className={`font-semibold text-[13.5px] ${on ? 'text-accent' : ''}`}>{p.label}{p.who && <span className="font-normal text-[12px] text-muted"> · {p.who}</span>}</div>
                    <div className="text-[12px] text-muted leading-snug mt-0.5">{p.blurb}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <div className="font-semibold">Industries</div>
            <div className="text-[12px] text-muted">{c.themes.length ? `${c.themes.length} chosen` : 'All industries'}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {THEMES.map((t) => {
              const on = c.themes.includes(t.id)
              return <Chip key={t.id} on={on} onClick={() => set({ themes: on ? c.themes.filter((x) => x !== t.id) : [...c.themes, t.id] })}>{t.label}</Chip>
            })}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {BOXES.map((b) => (
            <section key={b.key} className={`card p-4 grid gap-2 content-start ${isOn(b.key, c) ? 'ring-1 ring-accent/50' : ''}`}>
              <div>
                <div className="font-semibold flex items-center">{b.title}<Info id={b.term} /></div>
                <div className="text-[12.5px] text-muted">{b.q}</div>
              </div>
              <BoxBody k={b.key} c={c} set={set} />
            </section>
          ))}
        </div>
        <p className="text-[12px] text-faint">A stock missing the data a box needs doesn't match that box. AI scores only cover the stocks rated so far. Not investment advice.</p>
      </div>

      {/* Summary: sticky side panel on wide screens, bottom bar on phones. */}
      <aside className="hidden lg:grid gap-4 sticky top-6">
        <div className="card p-5 grid gap-4">
          <div>
            <div className="label">Matching stocks</div>
            <div className="num text-3xl font-semibold mt-1">{hits.length}</div>
            <div className="text-[12.5px] text-muted">of {d.stocks.length} · {n} {n === 1 ? 'box' : 'boxes'} set</div>
          </div>
          <RiskMeter risk={risk} />
          <button className="btn btn-primary justify-center" disabled={!hits.length} onClick={go}>Continue <ArrowRight size={15} /></button>
        </div>
        <div className="card p-4 grid gap-2">
          <div className="text-[12.5px] font-semibold text-muted">Save this screen as a preset</div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="e.g. My mandate" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={!name.trim() || !n} onClick={() => { d.savePreset(name, c); setName('') }}><Save size={14} /> Save</button>
          </div>
          <div className="text-[11.5px] text-faint">Saving with an existing name replaces it.</div>
        </div>
      </aside>

      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-line px-4 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px]"><b className="num">{hits.length}</b> <span className="text-muted">stocks match</span></div>
            <RiskMeter risk={risk} compact />
          </div>
          <button className="btn btn-primary shrink-0" disabled={!hits.length} onClick={go}>Continue <ArrowRight size={15} /></button>
        </div>
      </div>
      <div className="lg:hidden card p-4 grid gap-2">
        <div className="text-[12.5px] font-semibold text-muted">Save this screen as a preset</div>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="e.g. My mandate" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={!name.trim() || !n} onClick={() => { d.savePreset(name, c); setName('') }}><Save size={14} /> Save</button>
        </div>
      </div>
    </div>
  )
}

const GROUPS = {
  pe: [['peMin', 'At least'], ['peMax', 'At most']],
  dividend: [['dividendMin', 'Yield, at least'], ['payoutMax', 'Share of profit paid out, at most']],
  cap: [['capMin', 'At least'], ['capMax', 'At most']],
  health: [['piotroskiMin', 'Piotroski score (0–9), at least'], ['altmanMin', 'Altman Z-score, at least'], ['coverMin', 'Interest cover, at least (net cash always passes)']],
  ai: [['aiRiskMax', 'AI risk, at most'], ['aiBenefitMin', 'AI benefit, at least']],
}
const isOn = (k, c) => GROUPS[k] ? GROUPS[k].some(([x]) => c[x] != null) : k === 'quality' ? c.profitable || c.noDilution : k === 'entry' ? c.entry !== 'any' : c[k] != null

function Chip({ on, onClick, children }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg'}`}>{children}</button>
  )
}

function Choices({ k, c, set }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OPTIONS[k].map((v) => <Chip key={String(v)} on={c[k] === v} onClick={() => set({ [k]: v })}>{optionLabel(k, v)}</Chip>)}
    </div>
  )
}

function BoxBody({ k, c, set }) {
  if (k === 'moatMin') {
    return (
      <div className="grid gap-1">
        <div className="flex items-center gap-3">
          <input type="range" min="0" max="10" step="1" className="flex-1 accent-[var(--accent)]" value={c.moatMin ?? 0}
            onChange={(e) => set({ moatMin: Number(e.target.value) || null })} aria-label="Minimum moat" />
          <span className="num font-semibold w-14 text-right">{c.moatMin == null ? 'Any' : `${c.moatMin}+`}</span>
        </div>
        <div className="text-[11.5px] text-faint">Calculated scores stop at 8; 9 needs a written assessment, 10 only your own score on a stock's page.</div>
      </div>
    )
  }
  if (GROUPS[k]) {
    return (
      <div className="grid gap-2">
        {GROUPS[k].map(([x, label]) => <div key={x}><div className="text-[11.5px] text-faint mb-1">{label}</div><Choices k={x} c={c} set={set} /></div>)}
      </div>
    )
  }
  if (k === 'quality') {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Chip on={c.profitable} onClick={() => set({ profitable: !c.profitable })}>Profitable only</Chip>
        <Chip on={c.noDilution} onClick={() => set({ noDilution: !c.noDilution })}>No recent share sales</Chip>
      </div>
    )
  }
  return <Choices k={k} c={c} set={set} />
}
