import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squarify, groupedTreemap } from '../shared/treemap.js';

const area = (r) => r.w * r.h;
test('squarify: areas proportional to value, inside the box, no overlaps', () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ id: i, value }));
  const box = { x: 0, y: 0, w: 600, h: 400 };
  const r = squarify(items, box);
  assert.equal(r.length, 7);
  const total = 24;
  for (const t of r) {
    assert.ok(Math.abs(area(t) - (t.value / total) * 240000) < 1e-6);
    assert.ok(t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= 600 + 1e-6 && t.y + t.h <= 400 + 1e-6);
  }
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert.ok(ox <= 1e-6 || oy <= 1e-6, `tiles ${i} and ${j} overlap`);
  }
  // squarified: the biggest tile is not a sliver
  const big = r.find((t) => t.id === 0);
  assert.ok(Math.max(big.w / big.h, big.h / big.w) < 3);
});

test('grouped: groups sized by their total, weighted move, zero values dropped', () => {
  const items = [
    { s: 'A', g: 'Tech', value: 300, chg: 0.02 }, { s: 'B', g: 'Tech', value: 100, chg: -0.02 },
    { s: 'C', g: 'Energy', value: 100, chg: 0.01 }, { s: 'D', g: 'Energy', value: 0, chg: 0.5 },
  ];
  const { groups, tiles } = groupedTreemap(items, (x) => x.g, { x: 0, y: 0, w: 500, h: 300 });
  assert.equal(tiles.length, 3);
  const tech = groups.find((g) => g.name === 'Tech');
  assert.ok(Math.abs(area(tech) - 0.8 * 150000) < 1e-6);
  assert.ok(Math.abs(tech.chg - 0.01) < 1e-12);
});
