import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastPerformance } from '../shared/pastPerformance.js';

const weeks = (n, from = '2020-01-03') => Array.from({ length: n }, (_, i) => new Date(Date.parse(from) + i * 7 * 864e5).toISOString().slice(0, 10));
test('buy-and-hold at weights; late listing waits in cash', () => {
  const W = weeks(300);
  const SPY = { weeks: W, close: W.map((_, i) => 100 + i), tr: W.map((_, i) => 100 + i) };
  const A = { weeks: W, close: W.map(() => 50), tr: W.map((_, i) => 50 * (1 + i / 299)) };        // doubles
  const lateW = W.slice(200);
  const B = { weeks: lateW, close: lateW.map(() => 10), tr: lateW.map(() => 10) };                 // flat, listed late
  const r = pastPerformance([{ symbol: 'A', w: 0.5 }, { symbol: 'B', w: 0.5 }], { SPY, A, B }, { years: 5 });
  const a = r.stocks.find((s) => s.symbol === 'A'), b = r.stocks.find((s) => s.symbol === 'B');
  assert.ok(a.ret > 0.5 && !a.late);
  assert.ok(b.late); assert.equal(Math.round(b.value), 5000);
  assert.equal(Math.round(r.series[0].mine), 10000);
  assert.ok(r.mine.end > 10000 && r.spy.end > 10000);
});
