import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWeights, scorePortfolio } from '../shared/portfolio.js';

test('resolveWeights: set weights kept, the rest share what is left, total 100%', () => {
  const w = resolveWeights([{ symbol: 'A', weight: 50 }, { symbol: 'B', weight: null }, { symbol: 'C', weight: null }]);
  assert.equal(w.A, 0.5); assert.equal(w.B, 0.25); assert.equal(w.C, 0.25);
  const over = resolveWeights([{ symbol: 'A', weight: 80 }, { symbol: 'B', weight: 80 }]);
  assert.equal(over.A, 0.5);
});

test('scorePortfolio: concentration and losses show up as weaknesses', () => {
  const mk = (symbol, o) => ({ symbol, sector: 'Technology', moatUsed: 5, epsGrowth: 0.1, revenueGrowth: 0.1, peg: 2, fcfYield: 0.03, netDebtToEbitda: 1, beta: 1, gaapLossTtm: false, setup: { status: 'wait' }, fair: { vsMid: 0 }, ...o });
  const uni = [mk('A', { moatUsed: 8 }), mk('B', { gaapLossTtm: true, beta: 1.8 }), mk('C', { sector: 'Utilities' }), mk('D', { sector: 'Energy' })];
  const r = scorePortfolio([{ symbol: 'A', weight: null }, { symbol: 'B', weight: null }], uni);
  assert.equal(r.n, 2);
  assert.ok(r.weaknesses.some((x) => x.area === 'Diversification'));
  assert.ok(r.weaknesses.some((x) => /lost money/.test(x.text)));
  assert.ok(r.overall > 0 && r.overall < 1);
  assert.equal(scorePortfolio([{ symbol: 'ZZZ' }], uni), null);
});
