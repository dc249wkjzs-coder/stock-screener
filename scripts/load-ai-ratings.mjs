// Prints SQL that upserts data/ai-ratings.json into scr_ai (run it with the Supabase connector).
// Usage: node scripts/load-ai-ratings.mjs [SYMBOL ...] > out.sql
import { readFileSync } from 'node:fs';
const { rated_at, ratings } = JSON.parse(readFileSync(new URL('../data/ai-ratings.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
const q = (s) => `$q$${s}$q$`;
const arr = (xs) => `array[${xs.map(q).join(',')}]::text[]`;
const rows = Object.entries(ratings).filter(([s]) => !only.length || only.includes(s)).map(([s, r]) =>
  `(${q(s)}, ${r.risk}, ${r.benefit}, ${arr(r.risk_reasons)}, ${arr(r.benefit_reasons)}, ${q(r.summary)}, ${q(r.rated_at || rated_at)}::timestamptz)`);
console.log(`insert into public.scr_ai (symbol, risk, benefit, risk_reasons, benefit_reasons, summary, rated_at) values
${rows.join(',\n')}
on conflict (symbol) do update set risk = excluded.risk, benefit = excluded.benefit, risk_reasons = excluded.risk_reasons,
  benefit_reasons = excluded.benefit_reasons, summary = excluded.summary, rated_at = excluded.rated_at, rated_by = 'Claude (in chat)';`);
