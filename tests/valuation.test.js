import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fairValue, downside, entrySetup } from '../shared/valuation.js'
import { evaluate } from '../shared/pillars.js'
import { pullbacks } from '../shared/indicators.js'

const passing = { moat: { score: 9 }, forwardPE: 20, peg: 1, ebitdaMargin: 0.4, netDebtToEbitda: 0.5, epsGrowth: 0.2, gaapLossTtm: false, recentRaises: [], recentShelves: [] }
const fib = (hi, lo, last) => {
  const range = hi - lo
  const levels = [0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({ ratio: r, price: hi - r * range }))
  return { swingHigh: { date: '2026-10-01', price: hi }, swingLow: { date: '2026-02-01', price: lo }, range, levels, retraced: (hi - last) / range, belowSwing: last < lo }
}

test('Fair value: four methods, median as the middle', () => {
  const s = { price: 100, dcf: 150, ntmEps: 5, pe5yAvg: 24, epsGrowth: 0.15, targetConsensus: 130 }
  const f = fairValue(s)
  assert.equal(f.methods.length, 4)
  // DCF 150, own P/E 5×24 = 120, mandate P/E 5×(2×15) = 150, analysts 130 → median 140
  assert.equal(f.mid, 140)
  assert.equal(f.low, 120)
  assert.ok(Math.abs(f.vsMid - (100 / 140 - 1)) < 1e-9)
})

test('Entry: within 3% of the 50% level is the buy zone; confirmation needs both checks', () => {
  const s = { ...passing, price: 151, fib: fib(200, 100, 151), sma20: 148, rsi14: 41 }
  const e = evaluate(s)
  const st = entrySetup(s, e, undefined, 9000)
  assert.equal(st.status, 'zone-confirmed')
  assert.equal(st.zoneLevel.ratio, 0.5)
  assert.equal(st.ladder.length, 3)                 // 50%, 61.8%, 78.6%
  assert.equal(st.ladder[0].amount, 3000)
  const falling = entrySetup({ ...s, sma20: 160 }, e)
  assert.equal(falling.status, 'zone')
})

test('Entry: above the zone says what level to wait for; failing stocks say why', () => {
  const s = { ...passing, price: 175, fib: fib(200, 100, 175), sma20: 170, rsi14: 55 }
  const st = entrySetup(s, evaluate(s))
  assert.equal(st.status, 'wait')
  assert.match(st.title, /161\.80/)                 // 38.2% level = 200 − 0.382 × 100
  const fail = { ...s, peg: 4 }
  assert.equal(entrySetup(fail, evaluate(fail)).status, 'fail')
})

test('Downside rows sit below the price, nearest first', () => {
  const s = { price: 150, fib: fib(200, 100, 150), sma200: 140, low52: 95, high52: 200, pullbackMedian: -0.12, pullbackMax: -0.4, beta: 1.2 }
  const d = downside(s)
  assert.ok(d.rows.every((r) => r.price < 150))
  assert.ok(d.rows[0].price >= d.rows[1].price)
  assert.equal(Math.round(d.worstFloor.price), 120)  // 200 × (1 − 0.40)
  assert.equal(d.crash, -0.3)
})

test('Pullbacks: deepest and typical drop from a running high', () => {
  const p = [100, 110, 99, 120, 108, 130, 78, 90].map((c, i) => [`2026-01-${String(i + 1).padStart(2, '0')}`, c])
  const r = pullbacks(p)
  assert.equal(r.count, 3)                          // 110→99 (−10%), 120→108 (−10%), 130→78 (−40%)
  assert.equal(r.max.toFixed(2), '-0.40')
  assert.equal(r.median.toFixed(2), '-0.10')
})

import { fairValue as fv2 } from '../shared/valuation.js';
test('fair value: sanity rules and agreement (IRWD, NVDA, KO from live data 2026-11-13)', () => {
  const irwd = fv2({ price: 4.85, dcf: 5.78, pe5yAvg: 210.6, ntmEps: 1.304, epsGrowth: 2.36, targetConsensus: 6.68 });
  assert.deepEqual(irwd.methods.map((m) => m.key).sort(), ['analyst', 'dcf']);
  assert.equal(irwd.agreement, 'tight'); assert.ok(irwd.vsMid > -0.3 && irwd.vsMid < 0);
  const nvda = fv2({ price: 166, dcf: 232, pe5yAvg: 59.7, ntmEps: 14.45, epsGrowth: 0.835, targetConsensus: 337 });
  assert.ok(nvda.skipped.some((m) => m.key === 'histPE'));
  assert.equal(nvda.agreement, 'wide'); assert.equal(nvda.vsMid, null);
  const ko = fv2({ price: 97.4, dcf: 81, pe5yAvg: 25.4, ntmEps: 3.5, epsGrowth: 0.086, targetConsensus: 98 });
  assert.equal(ko.methods.length, 4); assert.ok(ko.vsMid != null);
});
