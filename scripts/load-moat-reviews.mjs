// Prints SQL that upserts data/moat-reviews.json into scr_moat_review (run it with the Supabase connector).
// Usage: node scripts/load-moat-reviews.mjs [SYMBOL ...] > out.sql
// Spec rule: an assessment is only published with its source (why), durability and invalidation.
import { readFileSync } from 'node:fs';
const { rated_at, reviews } = JSON.parse(readFileSync(new URL('../data/moat-reviews.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
const q = (s) => `$q$${s}$q$`;
const rows = Object.entries(reviews).filter(([s]) => !only.length || only.includes(s)).map(([s, r]) => {
  if (!(r.rating >= 1 && r.rating <= 9)) throw new Error(`${s}: rating must be 1-9`);
  if (!r.why || !r.durability || !r.invalidation) throw new Error(`${s}: needs why, durability and invalidation`);
  return `(${q(s)},${r.rating},${q(Object.values(r.sources).join(''))},${q(r.why)},${q(r.durability)},${q(r.invalidation)})`;
});
console.log(`insert into public.scr_moat_review (symbol, rating, sources, why, durability, invalidation, rated_at, rated_by)
select s, r, jsonb_build_object('intangibles',substr(x,1,1)::int,'switching',substr(x,2,1)::int,'network',substr(x,3,1)::int,'cost',substr(x,4,1)::int,'scale',substr(x,5,1)::int),
  w, du, inv, ${q(rated_at)}::timestamptz, 'Claude (in chat)' from (values
${rows.join(',\n')}
) v(s,r,x,w,du,inv)
on conflict (symbol) do update set rating = excluded.rating, sources = excluded.sources, why = excluded.why, durability = excluded.durability,
  invalidation = excluded.invalidation, rated_at = excluded.rated_at, rated_by = excluded.rated_by;`);
