import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moatScore } from '../shared/crossSection.js'

const ctx = { industryMedianOpMargin: { X: 0.10 }, industryMedianGrossMargin: { X: 0.40 }, industrySize: { X: 50 } }
const base = { symbol: 'T', industry: 'X', incomeYears: 5, grossMargin: 0.65, operatingMargin: 0.35,
  grossMarginYears: [0.65, 0.65, 0.64, 0.65, 0.66], opMarginYears: [0.35, 0.34, 0.33, 0.35, 0.34],
  roicYears: [0.45, 0.42, 0.40, 0.44, 0.41], roicMedian: 0.42 }

test('A steady high-return, high-margin business gets the calculated maximum of 8', () => {
  const r = moatScore(base, ctx)
  assert.equal(r.score, 8)
  assert.equal(r.raw, 10)
  assert.equal(r.capped, true)
})

test('One bad year is allowed; two are not', () => {
  const one = moatScore({ ...base, roicYears: [0.45, 0.42, -0.05, 0.44, 0.41] }, ctx).raw
  const two = moatScore({ ...base, roicYears: [0.45, -0.02, -0.05, 0.44, 0.41] }, ctx).raw
  assert.ok(one >= 9)
  assert.ok(two <= one - 2)
})

test('Falling gross margins (pricing pressure) cost points', () => {
  const eroding = moatScore({ ...base, grossMarginYears: [0.58, 0.60, 0.63, 0.65, 0.66] }, ctx)
  assert.equal(eroding.parts.find((p) => p.label === 'Erosion').pts, -1)
})

test('Recent losses cost a full point each, older ones half', () => {
  const r = moatScore({ ...base, opMarginYears: [0.2, -0.05, 0.1, -0.1, -0.1] }, ctx)
  assert.equal(r.parts.find((p) => p.label === 'Loss years').pts, -2)
})

test('No calculated score for short histories and banks', () => {
  assert.equal(moatScore({ ...base, incomeYears: 3, roicYears: [0.3, 0.3, 0.3] }, ctx).score, null)
  assert.equal(moatScore({ ...base, industry: 'Banks - Regional' }, ctx).score, null)
  assert.notEqual(moatScore({ ...base, industry: 'Financial - Credit Services' }, { ...ctx, industryMedianGrossMargin: { 'Financial - Credit Services': 0.5 } }).score, null)
})

test('A reported gross margin of ~100% (no cost of revenue) scores as industry level', () => {
  const r = moatScore({ ...base, grossMargin: 1, grossMarginYears: [1, 1, 1, 1, 1] }, ctx)
  assert.equal(r.parts.find((p) => p.label === 'Pricing power').pts, 1)
})

import { moatInputs, blendMoat } from '../shared/crossSection.js'

test('Stock-based pay is added back before judging losses and returns', () => {
  const yr = (y, op, sbc) => ({ date: `${y}-12-31`, revenue: 100, grossProfit: 60, operatingIncome: op, ebit: op, incomeBeforeTax: op, incomeTaxExpense: 0,
    totalAssets: 200, cashAndShortTermInvestments: 50, totalCurrentLiabilities: 20, stockBasedCompensation: sbc })
  const mi = moatInputs([yr(2025, -2, 20), yr(2024, 5, 18), yr(2023, 10, 15), yr(2022, 12, 12)])
  assert.equal(mi.lossYears, 0)
  assert.ok(Math.abs(mi.opMarginYears[0] - 0.18) < 1e-9)
  assert.equal(mi.incomeYears, 4)
})

test('Blend: 60% written assessment, 40% numbers, capped at 9', () => {
  assert.equal(blendMoat(8, null), 8)
  assert.equal(blendMoat(8, { rating: 10 }), 9)
  assert.equal(blendMoat(1, { rating: 7 }), 5)
  assert.equal(blendMoat(null, { rating: 10 }), 9)
})
