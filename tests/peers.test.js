import { test } from 'node:test'
import assert from 'node:assert/strict'
import { peerStats, compare } from '../shared/peers.js'

const mk = (symbol, industry, forwardPE, fcfYield) => ({ symbol, industry, sector: 'Tech', forwardPE, fcfYield })
const stocks = [
  ...[10, 20, 30, 40, 50].map((pe, i) => mk(`A${i}`, 'Chips', pe, 0.04)),
  ...[5, 6, 7].map((pe, i) => mk(`B${i}`, 'Tiny', pe, 0.02)),
  mk('LOSS', 'Chips', -12, 0.01),
]
const st = peerStats(stocks)

test('Peers: medians skip negative multiples; small industries fall back to the sector', () => {
  assert.equal(st.industry.Chips.forwardPE.median, 30)
  assert.equal(st.industry.Chips.forwardPE.n, 5)
  const c = compare(stocks.find((s) => s.symbol === 'B0'), 'forwardPE', st)
  assert.equal(c.group.label, 'sector')
})

test('Peers: below both medians on a lower-is-better figure counts as better; loss-makers get no verdict', () => {
  const c = compare({ industry: 'Chips', sector: 'Tech', forwardPE: 8 }, 'forwardPE', st)
  assert.equal(c.verdict, 'below'); assert.equal(c.better, true)
  const y = compare({ industry: 'Chips', sector: 'Tech', fcfYield: 0.01 }, 'fcfYield', st)
  assert.equal(y.verdict, 'below'); assert.equal(y.better, false)
  assert.equal(compare({ industry: 'Chips', sector: 'Tech', forwardPE: -5 }, 'forwardPE', st).verdict, null)
})
