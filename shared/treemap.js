// Market map: tiles sized by value (company size), laid out as a "squarified" treemap so tiles stay close to square.
// Bruls, Huizing & van Wijk (2000). Pure geometry: items in, rectangles out.

// items: [{ value, ...anything }] → same items with { x, y, w, h } inside rect. Items with value ≤ 0 are left out.
export function squarify(items, rect) {
  const list = items.filter((it) => it.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, it) => s + it.value, 0);
  if (!total || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const nodes = list.map((it) => ({ it, a: it.value * scale }));
  let { x, y, w, h } = rect;
  const out = [];
  const worst = (row, side) => {
    const s = row.reduce((t, n) => t + n.a, 0);
    let max = 0, min = Infinity;
    for (const n of row) { if (n.a > max) max = n.a; if (n.a < min) min = n.a; }
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const place = (row) => {
    const s = row.reduce((t, n) => t + n.a, 0);
    if (w >= h) {                       // a column down the left side
      const cw = h > 0 ? s / h : 0;
      let yy = y;
      for (const n of row) { const nh = cw > 0 ? n.a / cw : 0; out.push({ ...n.it, x, y: yy, w: cw, h: nh }); yy += nh; }
      x += cw; w -= cw;
    } else {                            // a row along the top
      const rh = w > 0 ? s / w : 0;
      let xx = x;
      for (const n of row) { const nw = rh > 0 ? n.a / rh : 0; out.push({ ...n.it, x: xx, y, w: nw, h: rh }); xx += nw; }
      y += rh; h -= rh;
    }
  };
  let row = [];
  for (let i = 0; i < nodes.length;) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, nodes[i]], side) <= worst(row, side)) { row.push(nodes[i]); i++; }
    else { place(row); row = []; }
  }
  if (row.length) place(row);
  return out;
}

// Two levels: groups (sectors) first, then the items inside each group, with a header strip for the group name
// when the group is big enough to show one. Returns { groups: [{ name, x, y, w, h, value, chg }], tiles: [...] }.
export function groupedTreemap(items, groupOf, rect, { header = 18, pad = 1, minHeader = 60 } = {}) {
  const byGroup = new Map();
  for (const it of items) {
    if (!(it.value > 0)) continue;
    const g = groupOf(it) || 'Other';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(it);
  }
  const groups = squarify([...byGroup.entries()].map(([name, list]) => {
    const value = list.reduce((s, it) => s + it.value, 0);
    const withChg = list.filter((it) => it.chg != null);
    const wv = withChg.reduce((s, it) => s + it.value, 0);
    return { name, value, list, chg: wv ? withChg.reduce((s, it) => s + it.value * it.chg, 0) / wv : null };
  }), rect);
  const tiles = [];
  for (const g of groups) {
    const showHeader = g.w >= minHeader && g.h >= header * 2.5;
    const inner = { x: g.x + pad, y: g.y + (showHeader ? header : pad), w: g.w - 2 * pad, h: g.h - (showHeader ? header : pad) - pad };
    g.showHeader = showHeader;
    for (const t of squarify(g.list, inner)) tiles.push({ ...t, group: g.name });
    delete g.list;
  }
  return { groups, tiles };
}
