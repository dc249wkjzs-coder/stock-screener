import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moatScore } from '../shared/crossSection.js'

const ctx = { industryMedianOpMargin: { X: 0.10 }, industryMedianGrossMargin: { X: 0.40 }, industrySize: { X: 50 } }
const base = { symbol: 'T', industry: 'X', incomeYears: 5, grossMargin: 0.65, operatingMargin: 0.35,
  grossMarginYears: [0.65, 0.65, 0.64, 0.65, 0.66], opMarginYears: [0.35, 0.34, 0.33, 0.35, 0.34],
  roicYears: [0.45, 0.42, 0.40, 0.44, 0.41], roicMedian: 0.42 }

test('A steady high-return, high-margin business scores 10', () => {
  assert.equal(moatScore(base, ctx).score, 10)
})

test('One bad year is allowed; two are not', () => {
  const one = moatScore({ ...base, roicYears: [0.45, 0.42, -0.05, 0.44, 0.41] }, ctx).score
  const two = moatScore({ ...base, roicYears: [0.45, -0.02, -0.05, 0.44, 0.41] }, ctx).score
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
