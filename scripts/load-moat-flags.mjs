// Prints SQL that replaces scr_moat_flags with data/moat-flags.json (run it with the Supabase connector).
import { readFileSync } from 'node:fs';
const { reviewed_at, flags } = JSON.parse(readFileSync(new URL('../data/moat-flags.json', import.meta.url), 'utf8'));
const K = ['single_product', 'patent_cliff', 'mlm', 'fashion', 'market_making', 'fragmented', 'big_customer'];
const q = (s) => `$q$${s}$q$`;
const rows = Object.entries(flags).map(([s, f]) => `(${q(s)},${K.map((k) => (f[k] ? 'true' : 'false')).join(',')},${q(f.note || '')},${q(reviewed_at)}::date)`);
console.log(`delete from public.scr_moat_flags;
insert into public.scr_moat_flags (symbol, ${K.join(', ')}, note, reviewed_at) values
${rows.join(',\n')};`);
