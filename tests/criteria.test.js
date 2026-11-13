import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLANK, checks, matches, riskProfile, toParams, fromParams, PRESETS, activeCount } from '../shared/criteria.js'

const nvda = { symbol: 'NVDA', sector: 'Technology', industry: 'Semiconductors', moatUsed: 8, netDebtToEbitda: -0.3, forwardPE: 25, peg: 0.6,
  epsGrowth: 0.4, ebitdaMargin: 0.6, gaapLossTtm: false, recentRaises: [], marketCap: 4e12, beta: 2.1, pullbackMax: -0.37, setup: { status: 'wait' }, offHigh: -0.1 }
const lossy = { symbol: 'LOSS', sector: 'Technology', industry: 'Software - Application', moatUsed: 2, netDebtToEbitda: 6, forwardPE: null, peg: null,
  epsGrowth: null, ebitdaMargin: -0.1, gaapLossTtm: true, recentRaises: [{ kind: 'atm', date: '2026-10-01' }], marketCap: 1e9, beta: 2.5, pullbackMax: -0.7 }

test('No boxes set: every stock matches', () => {
  assert.equal(activeCount(BLANK), 0)
  assert.ok(matches(lossy, BLANK))
})

test('Quality compounder preset keeps NVDA and drops a loss-maker selling stock', () => {
  const c = { ...BLANK, ...PRESETS.find((p) => p.id === 'quality').c }
  assert.ok(matches(nvda, c))
  const failed = checks(lossy, c).filter((k) => !k.ok).map((k) => k.key)
  assert.deepEqual(failed.sort(), ['debtMax', 'growthMin', 'moatMin', 'noDilution', 'pegMax', 'profitable'].sort())
})

test('Industry and net-cash-only debt boxes', () => {
  assert.ok(matches(nvda, { ...BLANK, themes: ['semis'] }))
  assert.ok(!matches(nvda, { ...BLANK, themes: ['health'] }))
  assert.ok(matches(nvda, { ...BLANK, debtMax: 0 }))
  assert.ok(!matches({ ...nvda, netDebtToEbitda: 0.5 }, { ...BLANK, debtMax: 0 }))
})

test('Missing data never matches an active box', () => {
  assert.ok(!matches({ ...nvda, beta: null }, { ...BLANK, betaMax: 1.5 }))
  assert.ok(!matches({ ...nvda, aiRisk: null }, { ...BLANK, aiRiskMax: 5 }))
})

test('Risk meter: steady profitable group is lower than a volatile loss-making one', () => {
  const steady = Array.from({ length: 10 }, (_, i) => ({ beta: 0.7, gaapLossTtm: false, netDebtToEbitda: 0.5, forwardPE: 14, pullbackMax: -0.12, moatUsed: 8, i }))
  const wild = Array.from({ length: 10 }, (_, i) => ({ beta: 2.2, gaapLossTtm: i < 5, netDebtToEbitda: 5, forwardPE: 80, pullbackMax: -0.6, moatUsed: 2, i }))
  assert.equal(riskProfile(steady).level.label, 'Lower risk')
  assert.equal(riskProfile(wild).level.label, 'Very high risk')
  assert.equal(riskProfile([]), null)
  assert.ok(riskProfile(steady.slice(0, 3)).concentrated)
})

test('Screen survives a round trip through the link', () => {
  const c = { ...BLANK, themes: ['tech', 'defense'], moatMin: 7, debtMax: 0, pegMax: 1.5, profitable: true, entry: 'zone' }
  assert.deepEqual(fromParams(toParams(c)), c)
})

import { STRATEGIES, checks as checks2, matches as matches2, toParams as toP, fromParams as fromP } from '../shared/criteria.js';
test('investor strategies: new boxes check the right fields and round-trip in the URL', () => {
  const s = { symbol: 'X', moatUsed: 8, roic: 0.22, netDebtToEbitda: -0.2, forwardPE: 20, gaapLossTtm: false, magicRank: 30, magicOf: 1000,
    dividendYield: 0.025, payoutRatio: 0.5, piotroski: 8, altmanZ: 4, interestCoverage: null, chg1y: 0.3, pullbackMax: -0.2, beta: 0.7, marketCap: 3e9, epsGrowth: 0.25, aiBenefit: 8, aiRisk: 2 };
  for (const id of ['magic', 'buffett', 'strong', 'momentum', 'lowvol', 'smallgrowth', 'ai']) {
    const st = STRATEGIES.find((x) => x.id === id);
    assert.ok(matches2(s, st.c), `${id}: ${JSON.stringify(checks2(s, st.c).filter((k) => !k.ok))}`);
  }
  assert.ok(!matches2({ ...s, payoutRatio: 0.9 }, { payoutMax: 0.6 }));
  assert.ok(!matches2({ ...s, netDebtToEbitda: 1, interestCoverage: 4 }, { coverMin: 10 }));
  const c = STRATEGIES.find((x) => x.id === 'lynch').c;
  const back = fromP(toP(c));
  assert.equal(back.capMax, 50e9); assert.equal(back.pegMax, 1);
});
