# Stock screener: handover notes

Jameson's stock screener, redesigned 2026-11-13 as a generic "choose your own" screener (no personal data on it):
**Stock finder** (`/`, category boxes + presets + live risk meter) → **Results** (`/results?…`, bookmarkable) →
stock page; **Look up a stock** (`/lookup`) library search; Definitions; Data status. Covers every US-listed stock
above $500M (US companies plus foreign companies on NYSE/Nasdaq such as ASML, TSM). Private: behind a Supabase login.
**Licensing:** FMP Starter is personal use only; FMP says showing its data to anyone else (free or not) needs a Data
Display and Licensing Agreement. Jameson knows; he doesn't want it public. Don't open sign-ups or make it public without that.
Sister project of Life Ledger (same Supabase project and login). Last updated: 2026-11-13.
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
  `backfill` every 3 min offset 1 (price history for new listings), `score` hourly at :50 (no FMP calls),
  `history` odd minutes (8 stocks, 60 calls/min) and `replay` every 5 min (see `supabase/jobs.sql` for the full-reload recipe).
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
- `shared/criteria.js` – the screen: industry THEMES, BLANK criteria, built-in PRESETS, `checks()`/`matches()`,
  `riskProfile()` (risk meter: median beta, % loss-makers, median debt, median fwd P/E, median deepest 2-yr drop,
  median moat; each 0–4, averaged → Lower/Moderate/High/Very high), URL params. Tests in `tests/criteria.test.js`.
- `src/` – the site. The screen being built is kept in localStorage; saved presets per user in `scr_presets`
  (Jameson's "My mandate" = moat 7+, PEG ≤2, EPS growth 10%+, debt ≤3x, profitable, no recent share sales).
  Moat overrides per user: `scr_overrides`. No Life Ledger positions are read any more. `shared/pillars.js`
  (`evaluate`, the old 8-pillar verdict) is no longer used by the site; DEFAULT_RULES still feeds valuation.js.
- `shared/valuation.js` – fair value range (DCF, own 5-yr P/E, mandate PEG-2 P/E, analyst target; median = middle),
  downside reference levels, entry status (fail / incomplete / extended / wait / zone / zone-confirmed / below)
  and the Fibonacci buy ladder. Confirmation = close above 20-day avg AND RSI > 30; zone = within 3% of a level.
- `src/lib/glossary.js` + `src/pages/Learn.jsx` – Definitions page (69 terms, beginner level, in 11 sections ordered as a learning path; each entry: simple, like, example, rule, watch, where). `<Term id>` / `<Info id>` link
  any label to `/learn#id`; add a glossary entry for every new number shown on the site.
- `shared/picks.js` + `src/components/BestMatches.jsx` – "Best matches" above the Results list: the matching stocks
  ranked against each other (0–100 within the group) in six categories: all-round (quality 30 / growth 25 / value 25 /
  balance sheet 10 / entry 10), best price to buy now (in Fibonacci zone), value (profitable, moat 5+), quality, growth,
  dividend (≥1.5%, payout ≤75%). Each pick lists the figures and their within-group rank. Tests in `tests/picks.test.js`.
- **My portfolio** (`/portfolio`, `src/pages/Portfolio.jsx`, `shared/portfolio.js`, table `scr_portfolio` per user with optional
  weight %): a planning list filled with the +/− `PortfolioButton` (Results rows, Best matches, Look up, stock page) and the
  **Stock cart** (`src/components/StockCart.jsx`, top right: count badge, add by ticker, remove, "Check out" → /portfolio).
  Score 0–100 = quality 30 / growth 20 / value 20 / balance sheet 10 (each holding ranked vs the whole universe,
  weight-averaged) + diversification 20 (effective number of stocks, largest sector). Strengths/weaknesses are
  figures vs fixed thresholds or market medians. Unset weights share what's left equally. Tests `tests/portfolio.test.js`.
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
- **Backtest** (`/backtest?…`, button on Results): `shared/replay.js` + `shared/backtest.js`. Jobs: `history`
  (odd minutes, 30 stocks × 5 calls: 12 annual income/balance/cash-flow statements + weekly split-adjusted and
  dividend-adjusted closes since 2016, into `scr_history`; SPY = benchmark; refreshed every 30 days) and `replay`
  (every 5 min: pass 1 builds each stock's point-in-time snapshot at 21 quarterly dates using only reports with
  filingDate ≤ date; pass 2 builds per-date column-wise records with that date's industry medians + moat into
  `scr_replay`). Edge Function `backtest` (verify_jwt + user check) runs a screen: equal weight, quarterly,
  dividends reinvested, vs SPY and all screener stocks. Approximations listed in `replayable()`; survivorship bias
  (only today's listed companies). Deployed `backtest/lib` uses slim stubs for metrics/crossSection; deploying the
  full copies from `scripts/sync-function-lib.sh` also works.
- New measures (2026-11-13): sales growth (1y, 3y), free cash flow yield/margin, dividend yield/payout (from TTM
  ratios; no extra FMP calls); boxes in the Stock finder and columns in Results.
- `tests/` – `npm test` (RSI, Fibonacci, calibration rules, prospectus classifier, forward EPS).

## Definitions (also shown on the Mandate rules page)

- Forward P/E = latest close ÷ next-12-month consensus EPS (time-weighted FY1/FY2).
- PEG = forward P/E ÷ expected EPS growth (annualised consensus FY0 → FY2).
- Value signal = trailing P/E ≥20% below its own 5-yr average (Starter has no forward-P/E history).
- Moat v4 (calculated 1–8, `shared/crossSection.js`): uses up to 10 annual reports (from `scr_history.fy`, the backtest
  download; falls back to the 5 years in metrics) with **stock-based pay added back** to operating profit (`moatInputs`).
  Parts: return on operating capital, median (0–3) + durability, weakest year after setting aside one bad year per five
  (0–2) + consistency, share of years >15% (≥90% = 1, ≥70% = 0.5) + pricing power, gross margin vs industry median (0–2)
  + operating margin premium over industry median (0–2) − erosion (3 oldest vs 3 newest years when 6+; up to −2)
  − loss years (−1 each in last 3, older −0.5 each, max −1). Banks/insurers/REITs and <4 years of data: no score.
  Capped at 8 (Jameson's scale: 9–10 only for near-irreplaceable positions like ASML). Gross margin ≥99.5% = no cost
  of revenue reported (Mastercard) → industry level. Operating capital = total assets − cash/investments −
  goodwill/intangibles − non-debt current liabilities, floored at 10% of tangible operating assets.
  Calibration (`scripts/moat-eval.mjs`, Morningstar wide-moat list vs no-moat industries): 7+ catches 37/56 wide-moat
  names (v3: 30) and 1/29 no-moat names. Known misses: merger accounting (LIN 2018 → 4–5), turnaround years (GEV).
- **Written moat assessment** (`scr_moat_review`, source of truth `data/moat-reviews.json`, SQL via
  `node scripts/load-moat-reviews.mjs`): Claude rates 1–9 in chat on Morningstar's five sources (brand/patents,
  switching costs, network effect, cost advantage, efficient scale; each 0–2) with a one-line reason.
  Site moat = override ?? blendMoat(calc, review) = round(0.6 × review + 0.4 × calc), capped at 9; review alone when
  there's no calculated score. Rated so far: holdings + watchlist + the 300 largest companies (333, 2026-11-13; VYLR skipped, unknown). Others on request.
  The backtest uses only the calculated score (written reviews are today's judgement).
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
