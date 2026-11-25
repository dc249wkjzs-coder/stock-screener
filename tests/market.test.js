import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketStatus, sessionDate, prevClose, movesFrom, topMovers, breadth, sectorMoves, nyToUtc, vixZone, nextTradingDay } from '../shared/market.js';

const at = (date, hm) => nyToUtc(date, hm);

test('New York time to real time, winter and summer', () => {
  assert.equal(nyToUtc('2026-11-25', '09:30').toISOString(), '2026-11-25T14:30:00.000Z');
  assert.equal(nyToUtc('2026-07-01', '09:30').toISOString(), '2026-07-01T13:30:00.000Z');
});

test('market status: pre, open, after, holiday, early close, weekend', () => {
  assert.equal(marketStatus(at('2026-11-25', '08:00')).state, 'pre');
  const open = marketStatus(at('2026-11-25', '10:00'));
  assert.equal(open.state, 'open'); assert.equal(open.closesAt, '2026-11-25T21:00:00.000Z');
  assert.equal(marketStatus(at('2026-11-25', '17:00')).state, 'after');
  const tg = marketStatus(at('2026-11-26', '11:00'));
  assert.equal(tg.state, 'closed'); assert.equal(tg.holiday, 'Thanksgiving'); assert.equal(tg.nextOpenDay, '2026-11-27'); assert.equal(tg.nextOpenEarlyClose, '13:00');
  assert.equal(marketStatus(at('2026-11-27', '13:30')).state, 'after');
  const sat = marketStatus(at('2026-11-28', '12:00'));
  assert.equal(sat.weekend, true); assert.equal(sat.nextOpenDay, '2026-11-30');
  assert.equal(nextTradingDay('2026-12-24'), '2026-12-28');
});

test('session date and previous close', () => {
  assert.equal(sessionDate(at('2026-11-25', '08:00')), '2026-11-24');
  assert.equal(sessionDate(at('2026-11-25', '10:00')), '2026-11-25');
  assert.equal(sessionDate(at('2026-11-26', '10:00')), '2026-11-25');
  assert.equal(prevClose([['2026-11-23', 10], ['2026-11-24', 11]], '2026-11-25'), 11);   // during the day
  assert.equal(prevClose([['2026-11-24', 11], ['2026-11-25', 12]], '2026-11-25'), 11);   // after tonight's close is stored
});

test('moves, movers, breadth, sectors', () => {
  const m = movesFrom([{ symbol: 'A', price: 110 }, { symbol: 'B', price: 90 }, { symbol: 'C', price: 500 }, { symbol: 'D', price: 50 }], { A: 100, B: 100, C: 100, D: 50 });
  assert.deepEqual(m, { A: [0.1, 110], B: [-0.1, 90], D: [0, 50] });   // C (+400%) dropped as bad data
  const stocks = [{ symbol: 'A', sector: 'Tech', industry: 'Chips', marketCap: 300 }, { symbol: 'B', sector: 'Tech', industry: 'Software', marketCap: 100 }, { symbol: 'D', sector: 'Energy', industry: 'Oil', marketCap: 100 }];
  const t = topMovers(stocks, m);
  assert.deepEqual(t.up.map((x) => x.symbol), ['A']); assert.deepEqual(t.down.map((x) => x.symbol), ['B']);
  assert.deepEqual(breadth(stocks, m), { up: 1, down: 1, flat: 1, n: 3, median: 0 });
  const s = sectorMoves(stocks, m);
  assert.equal(s[0].name, 'Tech'); assert.ok(Math.abs(s[0].chg - 0.05) < 1e-9); assert.equal(s[0].industries[0].name, 'Chips');
  assert.equal(vixZone(31).label, 'Fear'); assert.equal(vixZone(14).label, 'Calm');
});
