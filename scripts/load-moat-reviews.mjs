// Prints SQL that upserts data/moat-reviews.json into scr_moat_review (run it with the Supabase connector).
// Usage: node scripts/load-moat-reviews.mjs [SYMBOL ...] > out.sql
import { readFileSync } from 'node:fs';
const { rated_at, reviews } = JSON.parse(readFileSync(new URL('../data/moat-reviews.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
const q = (s) => `$q$${s}$q$`;
const rows = Object.entries(reviews).filter(([s]) => !only.length || only.includes(s)).map(([s, r]) => {
  if (!(r.rating >= 1 && r.rating <= 9)) throw new Error(`${s}: rating must be 1-9`);
  return `(${q(s)}, ${r.rating}, ${q(JSON.stringify(r.sources))}::jsonb, ${q(r.why)}, ${q(r.rated_at || rated_at)}::timestamptz, 'Claude (in chat)')`;
});
console.log(`insert into public.scr_moat_review (symbol, rating, sources, why, rated_at, rated_by) values
${rows.join(',\n')}
on conflict (symbol) do update set rating = excluded.rating, sources = excluded.sources, why = excluded.why,
  rated_at = excluded.rated_at, rated_by = excluded.rated_by;`);
