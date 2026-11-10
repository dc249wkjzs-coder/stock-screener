import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rsi, fibonacci } from '../shared/indicators.js'
import { evaluate } from '../shared/pillars.js'
import { classifyProspectusText } from '../shared/fmp.js'
import { forwardEps } from '../shared/metrics.js'

const series = (vals) => vals.map((v, i) => [new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10), v])

test('RSI is 100 for a series that only rises and near 0 for one that only falls', () => {
  assert.equal(rsi(series(Array.from({ length: 40 }, (_, i) => 10 + i))), 100)
  assert.ok(rsi(series(Array.from({ length: 40 }, (_, i) => 100 - i))) < 1)
})

test('Fibonacci levels come from the 52-week high and the low before it', () => {
  const up = Array.from({ length: 100 }, (_, i) => 100 + i)          // 100 → 199
  const pull = Array.from({ length: 20 }, (_, i) => 199 - i * 2)     // pulls back to 161
  const f = fibonacci(series([...up, ...pull]))
  assert.equal(f.swingHigh.price, 199)
  assert.equal(f.swingLow.price, 100)
  assert.equal(f.levels.find((l) => l.ratio === 0.618).price.toFixed(2), (199 - 0.618 * 99).toFixed(2))
  // Price 161 is just under the 38.2% level (161.18), so the next support is the 50% level (149.5).
  assert.equal(f.nextSupport.ratio, 0.5)
})

test('A broken leg widens to the older low', () => {
  const old = Array.from({ length: 300 }, (_, i) => 50 + i * 0.1)    // older base: 50 → 79.9
  const up = Array.from({ length: 150 }, (_, i) => 80 + i)            // 80 → 229; the 52-week leg low is ~69.7
  const crash = Array.from({ length: 60 }, (_, i) => 229 - i * 2.75)  // falls to ~66.8, below that low
  const f = fibonacci(series([...old, ...up, ...crash]))
  assert.equal(f.widened, true)
  assert.equal(f.swingLow.price, 50)
})

test('Mandate calibration: OKTA-like fails value, NVDA-like passes, debt breaker holds', () => {
  const base = { moat: { score: 8 }, ebitdaMargin: 0.3, netDebtToEbitda: 1, epsGrowth: 0.2, gaapLossTtm: false, recentRaises: [], recentShelves: [] }
  const okta = evaluate({ ...base, forwardPE: 54, peg: 5.4, epsGrowth: 0.10 })
  assert.equal(okta.pillars.value.status, 'fail')
  const nvda = evaluate({ ...base, moat: { score: 9 }, forwardPE: 29, peg: 0.5, ebitdaMargin: 0.6 })
  assert.equal(nvda.overall, 'pass')
  const ftntLike = evaluate({ ...base, forwardPE: 52, peg: 2.6, ebitdaMargin: 0.38, moat: { score: 9 } })
  assert.equal(ftntLike.pillars.value.status, 'pass') // 2-3 band allowed by moat >= 8
  const tdg = evaluate({ ...base, moat: { score: 9 }, netDebtToEbitda: 4.8, forwardPE: 25, peg: 1.5 })
  assert.equal(tdg.pillars.debt.status, 'warn')
  assert.equal(evaluate({ ...base, netDebtToEbitda: 7.5 }).pillars.debt.status, 'fail')
  assert.equal(evaluate({ ...base, gaapLossTtm: true, epsTtm: -1, forwardPE: 150, peg: 4.8 }).pillars.eps.status, 'fail')
})

test('Moat 6 passes only with elite value (AN at 8x)', () => {
  const base = { ebitdaMargin: 0.06, netDebtToEbitda: 2, epsGrowth: 0.12, gaapLossTtm: false, recentRaises: [], recentShelves: [] }
  assert.equal(evaluate({ ...base, moat: { score: 6 }, forwardPE: 8, peg: 0.7 }).pillars.moat.status, 'pass')
  assert.equal(evaluate({ ...base, moat: { score: 6 }, forwardPE: 25, peg: 1.8 }).pillars.moat.status, 'fail')
  assert.equal(evaluate({ ...base, moat: { score: 6 }, moatOverride: 8, forwardPE: 25, peg: 1.8 }).pillars.moat.status, 'pass')
})

test('Financing: bonds pass, stock sales and converts fail', () => {
  const base = { moat: { score: 8 }, forwardPE: 20, peg: 1, ebitdaMargin: 0.3, netDebtToEbitda: 1, epsGrowth: 0.2, gaapLossTtm: false, recentShelves: [] }
  assert.equal(evaluate({ ...base, recentRaises: [{ kind: 'debt', date: '2026-11-01', form: '424B2' }] }).pillars.financing.status, 'pass')
  assert.equal(evaluate({ ...base, recentRaises: [{ kind: 'convert', date: '2026-11-01', form: '424B5' }] }).pillars.financing.status, 'fail')
  assert.equal(evaluate({ ...base, recentRaises: [{ kind: 'unread', date: '2026-11-01', form: '424B5' }] }).pillars.financing.status, 'warn')
})

test('Prospectus covers are classified', () => {
  assert.equal(classifyProspectusText('Prospectus Supplement $1,500,000,000 4.250% Notes due 2036').kind, 'debt')
  assert.equal(classifyProspectusText('$750,000,000 0.50% Convertible Senior Notes due 2031').kind, 'convert')
  assert.equal(classifyProspectusText('Up to $300,000,000 Common Stock. We have entered into an equity distribution agreement').kind, 'atm')
  assert.equal(classifyProspectusText('12,500,000 Shares of Common Stock offered by us at $41.00 per share').kind, 'equity')
})

test('Forward EPS blends the next two fiscal years by time', () => {
  const est = [{ date: '2026-01-31', epsAvg: 4 }, { date: '2027-01-31', epsAvg: 5 }, { date: '2028-01-31', epsAvg: 6.25 }]
  const f = forwardEps(est, new Date('2026-07-31T00:00:00Z'))
  // Half a year to FY2027 end: NTM ≈ 0.5 × 5 + 0.5 × 6.25
  assert.ok(Math.abs(f.ntmEps - 5.625) < 0.02)
  assert.ok(Math.abs(f.growth - 0.25) < 1e-9) // sqrt(6.25 / 4) − 1
})
