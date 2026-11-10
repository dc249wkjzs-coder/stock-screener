# Stock screener: handover notes

Jameson's stock screener. It grades every US-listed stock above $500M market cap (US companies plus foreign companies on NYSE/Nasdaq such as ASML, TSM) against his written mandate
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
  closes), `fundamentals` every 2 min (25 stocks × 12 calls, `scr_run('fundamentals','&limit=25')`; refreshes anything older than 7 days),
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
- `supabase/functions/stock-news/` – live quote + FMP stock news for one symbol, called by the stock page
  (`verify_jwt: true` and it also checks the caller is a signed-in user, so the public key alone can't use it).
- `supabase/schema.sql` – tables, RLS, helper functions. `supabase/jobs.sql` – schedules.
- `src/` – the site. Pillars are evaluated in the browser so rule changes (Mandate rules page,
  saved per user in `scr_user_settings`) apply instantly. Moat overrides: `scr_overrides`.
  "Add to watchlist" inserts a Life Ledger `positions` row (`status = 'prospect'`, target = next Fib level).
- `shared/valuation.js` – fair value range (DCF, own 5-yr P/E, mandate PEG-2 P/E, analyst target; median = middle),
  downside reference levels, entry status (fail / incomplete / extended / wait / zone / zone-confirmed / below)
  and the Fibonacci buy ladder. Confirmation = close above 20-day avg AND RSI > 30; zone = within 3% of a level.
- `src/lib/glossary.js` + `src/pages/Learn.jsx` – Definitions page (57 terms). `<Term id>` / `<Info id>` link
  any label to `/learn#id`; add a glossary entry for every new number shown on the site.
- `src/lib/assessment.js` – strengths/weaknesses lines, each a figure vs a fixed threshold.
- `scripts/calibrate.mjs` – pulls live FMP data for given tickers and prints the verdicts
  (`FMP_API_KEY=... NODE_USE_ENV_PROXY=1 node scripts/calibrate.mjs NVDA FTNT ...`);
  with `SAMPLE_OUT=public/sample.json` it rebuilds the demo data.
- AI impact (`scr_ai`): AI risk 1–10 and AI benefit 1–10 with reasons, written by Claude **in chat** (no API key:
  Jameson chose not to fund an Anthropic API account). Source of truth `data/ai-ratings.json`; `node scripts/load-ai-ratings.mjs [SYM ...]`
  prints the upsert SQL to run with the Supabase connector. Rated so far: his holdings + watchlist (34, 2026-11-10).
  Next agreed step: rate the stocks that pass the mandate once the full data load finishes; others on request.
- Foreign companies report EPS/estimates in home currency per ordinary share; `metrics.js` converts with
  fx = price ÷ (FMP trailing P/E × reported EPS) (covers currency and ADR ratio). FMP DCF is dropped for them.
  Share classes: FMP lists one (GOOG, not GOOGL); `src/lib/data.jsx` ALIASES maps positions to it.
- `tests/` – `npm test` (RSI, Fibonacci, calibration rules, prospectus classifier, forward EPS).

## Definitions (also shown on the Mandate rules page)

- Forward P/E = latest close ÷ next-12-month consensus EPS (time-weighted FY1/FY2).
- PEG = forward P/E ÷ expected EPS growth (annualised consensus FY0 → FY2).
- Value signal = trailing P/E ≥20% below its own 5-yr average (Starter has no forward-P/E history).
- Moat v3 (1–10, see header of `shared/crossSection.js`) = return on operating capital 5-yr median (0–3)
  + durability, second-worst year (0–2) + consistency, years >15% (0–1) + pricing power, gross margin vs
  industry median (0–2) + operating margin premium over industry median (0–2) − erosion (margins/returns
  falling, up to −2) − loss years (−1 each in last 3, −0.5 in years 4–5). Banks/insurers/REITs: no score.
  Calibrated with `scripts/moat-eval.mjs` (Morningstar wide-moat list vs no-moat industries): ~94% of 7+
  scores are wide-moat names; blind spots are slumping brands, SBC-heavy software, low-margin defense.
  v2 gave DXCM 9 (no pricing-power or erosion check). Calculated scores are capped at 8 (Jameson's scale:
  9–10 only for near-irreplaceable positions like ASML, set by him as overrides). Gross margin ≥99.5% = no cost
  of revenue reported (Mastercard) → scored as industry level. Operating capital = total assets − cash/investments − goodwill/intangibles − non-debt current liabilities,
  floored at 10% of tangible operating assets. Fewer than 4 years of financials → no score (owner sets it).
  History: v1 used tangible equity capital, which gave cash-rich PLTR-type companies capped ±100% returns.
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
