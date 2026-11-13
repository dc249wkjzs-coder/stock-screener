import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compactFy, toWeekly, snapshotDates, stockSnapshots, finishDate, rowsOf } from '../shared/replay.js'
import { runBacktest, replayable } from '../shared/backtest.js'
import { BLANK } from '../shared/criteria.js'

// Weekly series helper: n weeks of closes starting at a Friday.
const weeksFrom = (start, n) => Array.from({ length: n }, (_, k) => new Date(Date.parse(start) + k * 7 * 864e5).toISOString().slice(0, 10))

test('toWeekly keeps the last close of each week', () => {
  const w = toWeekly([['2024-01-02', 10], ['2024-01-05', 11], ['2024-01-08', 12], ['2024-01-12', 13]])
  assert.deepEqual(w, [['2024-01-05', 11], ['2024-01-12', 13]])
})

test('snapshotDates steps back 13 weeks from the latest week', () => {
  const weeks = weeksFrom('2021-01-01', 300)
  const d = snapshotDates(weeks, 4)
  assert.equal(d.length, 5)
  assert.equal(d[4], weeks[299]); assert.equal(d[3], weeks[286])
})

test('Only reports published by the snapshot date are used', () => {
  const fy = (year, filed, eps) => ({ date: `${year}-12-31`, filingDate: filed, revenue: 100, grossProfit: 60, operatingIncome: 30, ebit: 30, ebitda: 35,
    incomeBeforeTax: 30, incomeTaxExpense: 6, netIncome: 24, epsDiluted: eps, weightedAverageShsOutDil: 10, totalAssets: 200, cashAndShortTermInvestments: 20,
    totalCurrentLiabilities: 30, shortTermDebt: 5, totalDebt: 50, freeCashFlow: 20, commonDividendsPaid: -5 })
  const h = { fy: compactFy([fy(2023, '2024-02-20', 3), fy(2022, '2023-02-20', 2), fy(2021, '2022-02-20', 1.5)], [], []), weeks: weeksFrom('2022-01-07', 120), close: [], tr: [] }
  h.fy = [fy(2023, '2024-02-20', 3), fy(2022, '2023-02-20', 2), fy(2021, '2022-02-20', 1.5)]
  h.close = h.weeks.map(() => 60); h.tr = h.weeks.map(() => 60)
  const bench = { weeks: h.weeks, close: h.weeks.map((_, k) => 100 + k) }
  const s = stockSnapshots(h, bench, ['2024-01-05', '2024-03-01'], { price: 60, marketCap: 600 })
  assert.equal(s['2024-01-05'].fy, '2022-12-31')        // FY2023 not yet filed
  assert.equal(s['2024-01-05'].forwardPE, 30)           // 60 / EPS 2
  assert.equal(s['2024-03-01'].fy, '2023-12-31')
  assert.equal(s['2024-03-01'].forwardPE, 20)           // 60 / EPS 3
  assert.ok(Math.abs(s['2024-03-01'].epsGrowth - (Math.sqrt(3 / 1.5) - 1)) < 1e-9)
  assert.ok(Math.abs(s['2024-03-01'].dividendYield - 0.5 / 60) < 1e-9)
})

test('Backtest: equal weight, compounding, cash when nothing matches', () => {
  const col = (trs, moats) => ({ symbol: ['A', 'B'], sector: ['Technology', 'Energy'], industry: ['Software', 'Oil'], price: trs, tr: trs, marketCap: [1e10, 1e10],
    beta: [1, 1], forwardPE: [20, 10], epsGrowth: [0.2, 0.05], peg: [1, 2], ebitdaMargin: [0.3, 0.2], netDebtToEbitda: [0, 1], gaapLossTtm: [0, 0], dilution: [0, 0],
    revenueGrowth: [0.1, 0], fcfYield: [0.03, 0.08], dividendYield: [0, 0.04], offHigh: [-0.1, -0.3], pullbackMax: [-0.2, -0.4], moat: moats })
  const snaps = [
    { asof: '2024-01-05', col: col([100, 100], [8, 3]), benchTr: 100 },
    { asof: '2024-04-05', col: col([120, 90], [8, 3]), benchTr: 110 },
    { asof: '2024-07-05', col: col([120, 99], [2, 3]), benchTr: 121 },
    { asof: '2024-10-04', col: col([150, 99], [2, 3]), benchTr: 121 },
  ]
  const r = runBacktest(snaps, { ...BLANK, moatMin: 7 })
  assert.deepEqual(r.periods.map((p) => p.n), [1, 1, 0])
  assert.ok(Math.abs(r.series[3].screen - 10000 * 1.2 * 1.0 * 1.0) < 1e-6)   // A +20%, A flat, then cash
  assert.ok(Math.abs(r.series[3].spy - 12100) < 1e-6)
  assert.ok(Math.abs(r.series[1].all - 10000 * (1 + (0.2 - 0.1) / 2)) < 1e-6)
  assert.equal(r.stats.emptyQuarters, 1)
})

test('Boxes that cannot be replayed are dropped with a note', () => {
  const { criteria, notes } = replayable({ ...BLANK, aiRiskMax: 3, entry: 'zone' })
  assert.equal(criteria.aiRiskMax, null); assert.equal(criteria.entry, 'any'); assert.equal(notes.length, 2)
})

test('finishDate scores moat with the industry medians of that date', () => {
  const s = (gm, om) => ({ mi: { roicYears: [0.4, 0.4, 0.4, 0.4, 0.4], roicMedian: 0.4, incomeYears: 5, lossYears: 0, grossMarginYears: [gm, gm, gm, gm, gm], opMarginYears: [om, om, om, om, om], grossMargin: gm, operatingMargin: om }, tr: 1, price: 1 })
  const col = finishDate([{ symbol: 'A', sector: 'X', industry: 'I', s: s(0.8, 0.5) }, { symbol: 'B', sector: 'X', industry: 'I', s: s(0.4, 0.1) }, { symbol: 'C', sector: 'X', industry: 'I', s: s(0.5, 0.2) }])
  const rows = rowsOf(col)
  assert.ok(rows[0].moatUsed > rows[1].moatUsed)
})
