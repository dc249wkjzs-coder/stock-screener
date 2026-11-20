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

test('scorePortfolio with ETFs: sector mix spread, stocks-only parts, cost line', () => {
  const stock = { symbol: 'A', sector: 'Energy', moatUsed: 6, epsGrowth: 0.1, revenueGrowth: 0.1, peg: 1.5, fcfYield: 0.05, netDebtToEbitda: 1, beta: 1, gaapLossTtm: false, setup: { status: 'wait' }, fair: { vsMid: 0 } };
  const voo = { symbol: 'VOO', kind: 'etf', category: 'Broad market', holdingsCount: 505, expenseRatio: 0.0003, beta: 1, dividendYield: 0.012,
    sectors: [{ s: 'Technology', w: 0.35 }, { s: 'Financial Services', w: 0.13 }, { s: 'Healthcare', w: 0.1 }, { s: 'Energy', w: 0.03 }, { s: 'Industrials', w: 0.39 }], setup: { status: 'extended' } };
  const bnd = { symbol: 'BND', kind: 'etf', category: 'Bonds', holdingsCount: 11000, expenseRatio: 0.0003, beta: 0.2, sectors: [{ s: 'Government', w: 0.5 }], setup: { status: 'wait' } };
  const r = scorePortfolio([{ symbol: 'A', weight: 20 }, { symbol: 'VOO', weight: 60 }, { symbol: 'BND', weight: 20 }], [stock], [voo, bnd]);
  assert.equal(r.n, 3); assert.equal(r.nEtf, 2);
  assert.ok(Math.abs(r.stockShare - 0.2) < 1e-9);
  assert.ok(r.effective > 10, `effective ${r.effective}`);
  assert.ok(r.sectors.find((x) => x.name === 'Bonds').share > 0.19);
  assert.ok(Math.abs(r.sectors.find((x) => x.name === 'Energy').share - (0.2 + 0.6 * 0.03)) < 1e-9);
  assert.ok(r.strengths.some((x) => x.area === 'Cost'));
  assert.ok(!r.weaknesses.some((x) => /on its own/.test(x.text)), 'a broad fund at 60% is not flagged');
  assert.ok(r.scores.quality != null);
  const etfOnly = scorePortfolio([{ symbol: 'VOO', weight: null }], [stock], [voo]);
  assert.equal(etfOnly.scores.quality, null);
  assert.ok(Math.abs(etfOnly.overall - etfOnly.scores.diversification) < 1e-9);
});
