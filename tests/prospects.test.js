import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prospects, qualifies } from '../shared/prospects.js'
import { peerStats } from '../shared/peers.js'

const base = (o) => ({ symbol: 'X', name: 'X', sector: 'Tech', industry: 'Chips', price: 100, gaapLossTtm: false, moatUsed: 7, netDebtToEbitda: 1,
  forwardPE: 25, peTtm: 30, peVs5y: 0, epsGrowth: 0.15, revenueGrowth: 0.1, ebitdaMargin: 0.3,
  fair: { vsMid: -0.2, mid: 125, agreement: 'moderate' }, setup: { status: 'wait', detail: 'Next entry level is 50.0%, 5% below the price.', title: 'Wait for $95.00', ladder: [] }, ...o })

test('Prospects: needs profit, moat 5+, debt ≤4x, a discount, and no Sell call', () => {
  assert.equal(qualifies(base({}), null).ok, true)
  assert.equal(qualifies(base({ gaapLossTtm: true }), null).ok, false)
  assert.equal(qualifies(base({ moatUsed: 4 }), null).ok, false)
  assert.equal(qualifies(base({ netDebtToEbitda: 5 }), null).ok, false)
  assert.equal(qualifies(base({ fair: { vsMid: 0.05, mid: 95, agreement: 'tight' } }), null).ok, false)
  assert.equal(qualifies(base({ fair: { vsMid: 0.4, mid: 70, agreement: 'tight' }, peVs5y: -0.3 }), null).ok, false)
  assert.equal(qualifies(base({ fair: null, peVs5y: -0.25 }), null).ok, true)
})

test('Prospects: ranked by score, every sector listed with scanned counts', () => {
  const stocks = [
    base({ symbol: 'A', fair: { vsMid: -0.4, mid: 160, agreement: 'tight' }, moatUsed: 9, setup: { status: 'zone-confirmed', detail: 'x', ladder: [] } }),
    base({ symbol: 'B' }),
    base({ symbol: 'C', sector: 'Energy', moatUsed: 3 }),
  ]
  const r = prospects(stocks, peerStats(stocks))
  assert.deepEqual(r.list.map((p) => p.symbol), ['A', 'B'])
  assert.equal(r.list[0].rank, 1)
  assert.ok(r.list[0].score > r.list[1].score)
  assert.deepEqual(r.sectors.map((x) => [x.sector, x.scanned, x.picks.length]), [['Tech', 2, 2], ['Energy', 1, 0]])
})
