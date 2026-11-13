// fairtest: one-off accuracy check of the P/E-based fair value methods on the stored history (scr_history).
// At quarterly dates it rebuilds, from reports public at the time, the two estimates that can be replayed:
//   own 5-year average P/E × last annual EPS, and P/E of 2 × growth × last annual EPS (growth = actual 2-year EPS growth)
// under the old rules (no limits) and the new rules (skip avg P/E > 40, growth capped 25%, skip growth > 100%,
// verdict only when both exist and agree within 80%), then checks the next 12 months.
// DCF and analyst targets can't be replayed (no history). Auth: x-job-token = Vault screener_job_token.
import { createClient } from 'npm:@supabase/supabase-js@2';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const day = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const published = (r: any) => r.filingDate || iso(Date.parse(r.date) + 90 * day);
function at(weeks: string[], d: string) { let lo = 0, hi = weeks.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (weeks[m] <= d) { a = m; lo = m + 1; } else hi = m - 1; } return a; }
const median = (xs: number[]) => { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

function estimates(fy: any[], weeks: string[], close: number[], d: string, rule: 'old' | 'new') {
  const avail = fy.filter((r) => published(r) <= d && r.epsDiluted != null);
  if (avail.length < 3) return null;
  const L = avail[0], P2 = avail[2];
  const eps = L.epsDiluted;
  if (!(eps > 0)) return null;
  // own 5-year average P/E: fiscal-year-end price ÷ that year's EPS, positive years only
  const pes: number[] = [];
  for (const r of avail.slice(0, 5)) { const i = at(weeks, r.date); if (i >= 0 && r.epsDiluted > 0) pes.push(close[i] / r.epsDiluted); }
  const avgPE = pes.length >= 3 ? pes.reduce((a, b) => a + b, 0) / pes.length : null;
  const g = P2.epsDiluted > 0 ? Math.sqrt(eps / P2.epsDiluted) - 1 : null;
  const m: number[] = [];
  if (avgPE) { if (rule === 'old' || avgPE <= 40) m.push(eps * avgPE); }
  if (g != null && g > 0) {
    if (rule === 'old') m.push(eps * Math.min(2 * g * 100, 60));
    else if (g <= 1) m.push(eps * 2 * Math.min(g, 0.25) * 100);
  }
  if (!m.length) return null;
  const mid = m.length === 1 ? m[0] : (m[0] + m[1]) / 2;
  const spread = m.length === 2 ? (Math.max(...m) - Math.min(...m)) / mid : null;
  const verdict = rule === 'old' ? true : m.length === 2 && spread! <= 0.8;
  return { mid, verdict };
}

Deno.serve(async (req) => {
  const { data: tok } = await db.rpc('scr_secret', { secret_name: 'screener_job_token' });
  if (req.headers.get('x-job-token') !== tok) return new Response('forbidden', { status: 403 });
  const { data: spy } = await db.from('scr_history').select('weeks').eq('symbol', 'SPY').single();
  const bw: string[] = spy!.weeks;
  const dates: string[] = [];
  for (let i = bw.length - 1 - 52; i >= 0 && bw[i] >= '2019-06-01'; i -= 13) dates.unshift(bw[i]);
  const rows: Record<string, any[]> = { old: [], new: [] };
  let stocks = 0;
  for (let from = 0; ; from += 100) {
    const { data, error } = await db.from('scr_history').select('symbol,fy,weeks,close,tr').neq('symbol', 'SPY').not('fy', 'is', null).order('symbol').range(from, from + 99);
    if (error) throw error;
    for (const h of data) {
      if (!h.fy?.length || !h.weeks?.length || (h.fy[0].reportedCurrency && h.fy[0].reportedCurrency !== 'USD')) continue;
      stocks++;
      const w: string[] = h.weeks, c: number[] = h.close.map(Number), tr: (number | null)[] = (h.tr || []).map((x: any) => (x == null ? null : Number(x)));
      for (const d of dates) {
        const i = at(w, d); if (i < 0 || w[i] < iso(Date.parse(d) - 21 * day)) continue;
        const j = at(w, iso(Date.parse(d) + 364 * day)); if (j <= i || w[j] < iso(Date.parse(d) + 340 * day)) continue;
        const p0 = c[i], p1 = c[j];
        const r12 = tr[i] && tr[j] ? tr[j]! / tr[i]! - 1 : p1 / p0 - 1;
        for (const rule of ['old', 'new'] as const) {
          const e = estimates(h.fy, w, c, d, rule);
          if (!e || !(e.mid > 0)) continue;
          rows[rule].push({ d, gap: p0 / e.mid - 1, r12, err0: Math.abs(p0 / e.mid - 1), err1: Math.abs(p1 / e.mid - 1), verdict: e.verdict });
        }
      }
    }
    if (data.length < 100) break;
  }
  // Excess return = return minus the median return of all stocks tested on the same date (removes good/bad years).
  const mkt: Record<string, number> = {};
  for (const d of dates) mkt[d] = median(rows.old.filter((r) => r.d === d).map((r) => r.r12)) ?? 0;
  const BUCKETS: [string, number, number][] = [['30%+ below', -Infinity, -0.3], ['10–30% below', -0.3, -0.1], ['within 10%', -0.1, 0.1], ['10–30% above', 0.1, 0.3], ['30%+ above', 0.3, Infinity]];
  const summarise = (list: any[]) => ({
    n: list.length,
    buckets: BUCKETS.map(([label, lo, hi]) => {
      const b = list.filter((r) => r.gap >= lo && r.gap < hi);
      return { label, n: b.length, medianReturn: median(b.map((r) => r.r12)), medianExcess: median(b.map((r) => r.r12 - mkt[r.d])), beatShare: b.length ? b.filter((r) => r.r12 > mkt[r.d]).length / b.length : null };
    }),
    medianMissNow: median(list.map((r) => r.err0)), medianMissAfter1y: median(list.map((r) => r.err1)),
    closerAfter1y: list.length ? list.filter((r) => r.err1 < r.err0).length / list.length : null,
  });
  const out = { stocks, dates: [dates[0], dates[dates.length - 1], dates.length], old: summarise(rows.old), newVerdict: summarise(rows.new.filter((r) => r.verdict)), newNoVerdict: rows.new.filter((r) => !r.verdict).length };
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
});
