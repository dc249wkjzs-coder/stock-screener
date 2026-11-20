import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etfInfoFields, etfCategory, makeEtfCard, sectorName, mergeSectors } from '../shared/etf.js';

test('info fields: percent to fraction, sector names mapped and merged, fund AUM kept', () => {
  const f = etfInfoFields(
    { name: 'X', expenseRatio: 0.03, holdingsCount: 500, assetsUnderManagement: 1.5e9, assetClass: 'Equity',
      sectorsList: [{ industry: 'Information Technology', exposure: 30 }, { industry: 'Technology', exposure: 5 }, { industry: 'Health Care', exposure: 12 }] },
    [{ country: 'United States', weightPercentage: '99.5%' }]);
  assert.equal(f.expense_ratio, 0.0003);
  assert.equal(f.aum_info, 1.5e9);
  assert.deepEqual(f.sectors.map((x) => x.s), ['Technology', 'Healthcare']);
  assert.ok(Math.abs(f.sectors[0].w - 0.35) < 1e-9);
  assert.equal(f.countries[0].w, 0.995);
});

test('sector names', () => {
  assert.equal(sectorName('Consumer Discretionary'), 'Consumer Cyclical');
  assert.equal(sectorName('Government'), 'Government');
  assert.equal(mergeSectors([{ s: 'Financials', w: 0.1 }, { s: 'Financial Services', w: 0.2 }])[0].w.toFixed(2), '0.30');
});

test('categories', () => {
  const us = [{ c: 'United States', w: 1 }];
  assert.equal(etfCategory({ name: 'ProShares UltraPro QQQ', countries: us }), 'Leveraged / inverse');
  assert.equal(etfCategory({ name: 'Direxion Daily Semiconductor Bull 3X', countries: us }), 'Leveraged / inverse');
  assert.equal(etfCategory({ name: 'Vanguard Total Bond Market', asset_class: 'Core Investment Grade Bond', countries: us }), 'Bonds');
  assert.equal(etfCategory({ name: 'JPMorgan Equity Premium Income ETF', asset_class: 'Equity', countries: us, sectors: [{ s: 'Technology', w: 0.2 }] }), 'Broad market');
  assert.equal(etfCategory({ name: 'SPDR Gold Shares', asset_class: 'Commodity', countries: [] }), 'Commodities & crypto');
  assert.equal(etfCategory({ name: 'Vanguard FTSE Developed', countries: [{ c: 'Japan', w: 0.2 }, { c: 'United States', w: 0.01 }] }), 'International');
  assert.equal(etfCategory({ name: 'Technology Select Sector SPDR', countries: us, sectors: [{ s: 'Technology', w: 0.98 }] }), 'Sector');
  assert.equal(etfCategory({ name: 'Invesco BulletShares 2030 Corporate Bond', asset_class: 'Fixed Income', countries: us }), 'Bonds');
});

test('card: dividend yield from last annual dividend, prefers fund AUM, merges sectors', () => {
  const c = makeEtfCard({ symbol: 'IVV', name: 'iShares Core S&P 500', aum: 9e11, aum_info: 7e11, price: 100, last_dividend: 1.2,
    sectors: [{ s: 'Information Technology', w: 0.36 }, { s: 'Financials', w: 0.13 }], countries: [{ c: 'United States', w: 0.99 }] }, { lastClose: 120, lastDate: '2026-11-19' });
  assert.equal(c.aum, 7e11);
  assert.equal(c.price, 120);
  assert.equal(c.dividendYield, 0.01);
  assert.equal(c.topSector, 'Technology');
  assert.equal(c.category, 'Broad market');
  assert.equal(c.kind, 'etf');
});

import { ETF_BLANK, ETF_PRESETS, etfChecks, etfMatches, etfScreen, etfToParams, etfFromParams } from '../shared/etfScreen.js';
const voo = { symbol: 'VOO', name: 'Vanguard S&P 500', issuer: 'Vanguard', category: 'Broad market', expenseRatio: 0.0003, aum: 7e11, dividendYield: 0.012, chg1y: 0.15, beta: 1, pullbackMax: -0.19, usShare: 1, sectors: [{ s: 'Technology', w: 0.34 }], offHigh: -0.02, setup: { status: 'extended' } };
const xlk = { ...voo, symbol: 'XLK', category: 'Sector', expenseRatio: 0.0009, aum: 7e10, sectors: [{ s: 'Technology', w: 0.98 }], chg1y: 0.25, setup: { status: 'zone' } };
const tqqq = { ...voo, symbol: 'TQQQ', category: 'Leveraged / inverse', leveraged: true, expenseRatio: 0.0084, aum: 2e10 };
const bnd = { ...voo, symbol: 'BND', category: 'Bonds', aum: 1.3e11, dividendYield: 0.037, sectors: [{ s: 'Government', w: 0.5 }], setup: { status: 'wait' } };
const all = [voo, xlk, tqqq, bnd];

test('blank screen hides leveraged funds only', () => {
  assert.deepEqual(etfScreen(all, ETF_BLANK).map((e) => e.symbol), ['VOO', 'BND', 'XLK']);
  assert.ok(etfMatches(tqqq, { ...ETF_BLANK, showLev: true }));
});

test('presets', () => {
  const run = (id) => etfScreen(all, { ...ETF_BLANK, ...ETF_PRESETS.find((p) => p.id === id).set }).map((e) => e.symbol);
  assert.deepEqual(run('broad-cheap'), ['VOO']);
  assert.deepEqual(run('growth-tech'), ['XLK']);
  assert.deepEqual(run('bonds'), ['BND']);
  assert.deepEqual(run('pullback'), ['XLK']);
});

test('checks list each box', () => {
  const k = etfChecks(voo, { ...ETF_BLANK, costMax: 0.0002 });
  assert.equal(k.find((x) => x.label.startsWith('Cost')).ok, false);
});

test('URL round trip', () => {
  const c = { ...ETF_BLANK, cats: ['Sector', 'Bonds'], costMax: 0.004, sector: 'Technology', entry: 'bouncing', showLev: true, sort: 'div' };
  assert.deepEqual(etfFromParams(etfToParams(c)), c);
  assert.equal(etfToParams(ETF_BLANK).toString(), '');
});
