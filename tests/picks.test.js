import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankWithin, bestMatches } from '../shared/picks.js';

test('rankWithin: best = 1, worst = 0, ties share, lower-is-better flips', () => {
  const S = [{ symbol: 'A', v: 1 }, { symbol: 'B', v: 2 }, { symbol: 'C', v: 2 }, { symbol: 'D', v: 3 }, { symbol: 'E', v: null }];
  const r = rankWithin(S, (s) => s.v);
  assert.equal(r.D, 1); assert.equal(r.A, 0); assert.equal(r.B, r.C); assert.equal(r.E, undefined);
  const lo = rankWithin(S, (s) => s.v, true);
  assert.equal(lo.A, 1); assert.equal(lo.D, 0);
});

test('bestMatches: strong cheap grower wins all-round; filters apply', () => {
  const mk = (symbol, o) => ({ symbol, marketCap: 1e10, moatUsed: 5, epsGrowth: 0.1, revenueGrowth: 0.1, peg: 2, fcfYield: 0.03, netDebtToEbitda: 1, gaapLossTtm: false, setup: { status: 'wait' }, fair: { vsMid: 0 }, ...o });
  const S = [
    mk('BEST', { moatUsed: 8, epsGrowth: 0.25, revenueGrowth: 0.2, peg: 1, fcfYield: 0.05, netDebtToEbitda: -0.5, setup: { status: 'zone-confirmed' }, fair: { vsMid: -0.2 } }),
    mk('MID', {}),
    mk('LOSS', { gaapLossTtm: true, moatUsed: 3, peg: 0.5 }),
    mk('DIV', { dividendYield: 0.03, payoutRatio: 0.5 }),
  ];
  const c = Object.fromEntries(bestMatches(S).map((x) => [x.id, x]));
  assert.equal(c.overall.picks[0].stock.symbol, 'BEST');
  assert.equal(c.entry.picks.length, 1);
  assert.ok(!c.value.picks.some((p) => p.stock.symbol === 'LOSS'));
  assert.deepEqual(c.income.picks.map((p) => p.stock.symbol), ['DIV']);
});
