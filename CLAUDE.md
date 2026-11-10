# Stock screener: handover notes

Jameson's stock screener. It grades every US stock above $500M market cap against his written mandate
(8 pillars), with a calculated moat score, Fibonacci entry levels, RSI and portfolio fit.
Sister project of Life Ledger (same Supabase project and login). Last updated: 2026-11-10.
See the Life Ledger repo's CLAUDE.md for how to work with Jameson (simple steps, facts not opinions,
never commit secrets, English).

## How it fits together

```
FMP Starter API ──► Supabase Edge Function `screener-sync` (run by pg_cron) ──► tables scr_* in Life Ledger DB
                                                                                    │
                          Vite/React site on Vercel (this repo) ◄── reads scr_*, positions, quotes
```

- **Data provider:** Financial Modeling Prep, Starter plan ($29/mo monthly; US only, annual + TTM
  fundamentals, 5 yrs history, 300 calls/min, no batch quotes, no bulk). Key is in **Supabase Vault**
  as `fmp_api_key`. Never put it in code or Vercel.
- **Supabase project:** `life- ledger` (`vwgckbpdtqwkxnogbjtq`), org on the **Pro** plan.
- **Jobs** (`supabase/jobs.sql`, pg_cron, times UTC): `universe` 22:15 weekdays (1 call: the full list +
  closes), `fundamentals` every 3 min (20 stocks × 11 calls, refreshes anything older than 7 days),
  `backfill` every 3 min offset 1 (price history for new listings), `score` hourly at :50 (no FMP calls).
  Each run is logged in `scr_runs`. Start one by hand: `select public.scr_run('score');`
- **SEC filing reader (pillar 6):** reads 424B/S-1 covers to tell bond issues from stock sales,
  converts and ATMs. SEC blocks requests without a real contact email in the User-Agent, so it only runs
  when Vault has `sec_user_agent` (e.g. `LifeLedgerScreener name@domain.com`). Until then those filings
  show as "type not confirmed" (a caution, not a fail).

## Code map

- `shared/` – plain JS used by both the function and the site:
  `fmp.js` (API calls, rate limiter, prospectus classifier), `metrics.js` (raw FMP → numbers),
  `crossSection.js` (moat score, industry medians, Magic Formula), `indicators.js` (RSI, SMA,
  Fibonacci), `card.js` (compact row), `pillars.js` (**the mandate**: `DEFAULT_RULES` + `evaluate()`).
- `supabase/functions/screener-sync/` – the function; `lib/` is a copy of `shared/`
  (`bash scripts/sync-function-lib.sh`). Deploy with the Supabase connector (`deploy_edge_function`,
  `verify_jwt: false`, it checks the `x-job-token` header against Vault `screener_job_token`).
- `supabase/schema.sql` – tables, RLS, helper functions. `supabase/jobs.sql` – schedules.
- `src/` – the site. Pillars are evaluated in the browser so rule changes (Mandate rules page,
  saved per user in `scr_user_settings`) apply instantly. Moat overrides: `scr_overrides`.
  "Add to watchlist" inserts a Life Ledger `positions` row (`status = 'prospect'`, target = next Fib level).
- `scripts/calibrate.mjs` – pulls live FMP data for given tickers and prints the verdicts
  (`FMP_API_KEY=... NODE_USE_ENV_PROXY=1 node scripts/calibrate.mjs NVDA FTNT ...`);
  with `SAMPLE_OUT=public/sample.json` it rebuilds the demo data.
- `tests/` – `npm test` (RSI, Fibonacci, calibration rules, prospectus classifier, forward EPS).

## Definitions (also shown on the Mandate rules page)

- Forward P/E = latest close ÷ next-12-month consensus EPS (time-weighted FY1/FY2).
- PEG = forward P/E ÷ expected EPS growth (annualised consensus FY0 → FY2).
- Value signal = trailing P/E ≥20% below its own 5-yr average (Starter has no forward-P/E history).
- Moat (1–10) = return on tangible capital 5-yr avg (3) + consistency (2) + gross margin level (2)
  + gross margin stability (1) + operating margin premium over industry median (2).
- Fibonacci = 52-week high and the lowest close in the 52 weeks before it; if price breaks below
  that low, the swing low widens to the lowest close in ~2 years of stored history. Levels include 100%.

## Gotchas

- Node's built-in fetch ignores the workspace proxy: run scripts with `NODE_USE_ENV_PROXY=1`.
- financialmodelingprep.com had to be added to claude.ai → Settings → Capabilities → Allowed websites
  for local testing. sec.gov is not reachable from the Claude workspace (only from Supabase).
- FMP 429s if bursts exceed 300/min; `fmp.js` spaces calls at 200/min per function instance.
- Life Ledger's nightly Tiingo run fetches prices for watchlist names too (50/hour limit). Adding
  many watchlist names from the screener eats into that budget.

## Deploy (site)

Vercel project `stock-screener` from this repo, env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`
(same values as Life Ledger). Without them the site runs in demo mode with `public/sample.json`.
Add the screener's Vercel URL to Supabase → Authentication → URL Configuration → Redirect URLs so
password-reset emails work there too.
