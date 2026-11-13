import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moatScore, moatInputs, finalMoat } from '../shared/crossSection.js'

const ctx = { industryMedianOpMargin: { X: 0.10 }, industryMedianGrossMargin: { X: 0.40 }, industrySize: { X: 50 }, industryShare: { T: 0.35 } }
const base = { symbol: 'T', industry: 'X', incomeYears: 6, grossMargin: 0.65, operatingMargin: 0.35,
  grossMarginYears: [0.65, 0.65, 0.64, 0.65, 0.66, 0.65], opMarginYears: [0.35, 0.34, 0.33, 0.35, 0.34, 0.35],
  roicYears: [0.45, 0.42, 0.40, 0.44, 0.41, 0.43], roicMedian: 0.42 }
const part = (r, key) => r.parts.find((p) => p.key === key)

test('A steady high-return, high-margin market leader gets the calculated maximum of 8', () => {
  const r = moatScore(base, ctx)
  assert.equal(r.score, 8)
  assert.equal(r.raw, 12)
  assert.equal(part(r, 'position').pts, 2)
})

test('Market position: share of industry revenue, market value as fallback', () => {
  assert.equal(part(moatScore(base, { ...ctx, industryShare: { T: 0.16 } }), 'position').pts, 1.5)
  assert.equal(part(moatScore(base, { ...ctx, industryShare: { T: 0.05 } }), 'position').pts, 0)
  assert.equal(part(moatScore(base, { ...ctx, industryShare: {}, industryCapShare: { T: 0.09 } }), 'position').pts, 1)
})

test('Erosion: a fall of more than 2 points in gross margin and/or return costs 1 point each', () => {
  const g = moatScore({ ...base, grossMarginYears: [0.60, 0.61, 0.62, 0.66, 0.66, 0.66] }, ctx)
  assert.equal(part(g, 'erosion').pts, -1)
  const both = moatScore({ ...base, grossMarginYears: [0.60, 0.61, 0.62, 0.66, 0.66, 0.66], roicYears: [0.30, 0.31, 0.32, 0.44, 0.45, 0.46] }, ctx)
  assert.equal(part(both, 'erosion').pts, -2)
  assert.equal(part(moatScore(base, ctx), 'erosion').pts, 0)
})

test('Recent losses cost a full point each, older ones half (older at most 1)', () => {
  const r = moatScore({ ...base, opMarginYears: [0.2, -0.05, 0.1, -0.1, -0.1, -0.1] }, ctx)
  assert.equal(part(r, 'losses').pts, -2)
})

test('No calculated score below 5 years of history, or for banks', () => {
  assert.equal(moatScore({ ...base, incomeYears: 4, roicYears: [0.3, 0.3, 0.3, 0.3] }, ctx).score, null)
  assert.equal(moatScore({ ...base, industry: 'Banks - Regional' }, ctx).score, null)
})

test('A reported gross margin of ~100% (no cost of revenue) scores as industry level', () => {
  const r = moatScore({ ...base, grossMargin: 1, grossMarginYears: [1, 1, 1, 1, 1, 1] }, ctx)
  assert.equal(part(r, 'pricing').pts, 1)
})

test('Stock-based pay is added back before judging losses and returns', () => {
  const yr = (y, op, sbc) => ({ date: `${y}-12-31`, revenue: 100, grossProfit: 60, operatingIncome: op, ebit: op, incomeBeforeTax: op, incomeTaxExpense: 0,
    totalAssets: 200, cashAndShortTermInvestments: 50, totalCurrentLiabilities: 20, stockBasedCompensation: sbc })
  const mi = moatInputs([yr(2025, -2, 20), yr(2024, 5, 18), yr(2023, 10, 15), yr(2022, 12, 12)])
  assert.equal(mi.lossYears, 0)
  assert.ok(Math.abs(mi.opMarginYears[0] - 0.18) < 1e-9)
})

// The spec's worked example: IRWD parts 3 + 2 + 1 + 1 + 2 + 0 − 0.5 − 1 = 7.5 → 8 → single-product cap → 4; W = 3 → final 3.
const P = (...pts) => pts.map((p, i) => ({ key: `p${i}`, pts: p }))
test('Spec worked example (IRWD): cap then blend gives 3', () => {
  const r = finalMoat({ parts: P(3, 2, 1, 1, 2, 0, -0.5, -1), flags: { single_product: true }, review: { rating: 3 } })
  assert.equal(r.calcBeforeCaps, 8); assert.equal(r.calc, 4); assert.equal(r.final, 3)
  assert.equal(r.needsReview, false)
})

test('Blend: written rating is the anchor (lift at most 1, pull down freely, max 9)', () => {
  assert.equal(finalMoat({ parts: P(8), review: { rating: 9 } }).final, 9)   // ASML
  assert.equal(finalMoat({ parts: P(1), review: { rating: 7 } }).final, 5)   // numbers contradict the thesis
  assert.equal(finalMoat({ parts: P(8), review: { rating: 4 } }).final, 5)
  assert.equal(finalMoat({ parts: [], review: { rating: 6 } }).final, 6)
})

test('No written assessment: numbers only, at most 6, marked unverified; owner overrides all', () => {
  const r = finalMoat({ parts: P(8) })
  assert.equal(r.final, 6); assert.equal(r.unverified, true)
  const o = finalMoat({ parts: P(8), override: 9 })
  assert.equal(o.final, 9); assert.equal(o.unverified, false)
})

test('Caps never lower the written rating; a cap below it is flagged for review', () => {
  const r = finalMoat({ parts: P(8), flags: { single_product: true }, review: { rating: 7 } })
  assert.equal(r.calc, 4); assert.equal(r.needsReview, true)
  assert.equal(r.final, 6)   // round(0.6×7 + 0.4×4) = 6; the review itself stays 7
})

test('Customer concentration: −1 before rounding, and a cap of 6', () => {
  const r = finalMoat({ parts: P(7.4), flags: { big_customer: true } })
  assert.equal(r.calcBeforeCaps, 6); assert.equal(r.calc, 6)
})
