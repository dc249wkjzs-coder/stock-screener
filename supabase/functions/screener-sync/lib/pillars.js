// Jameson's stock mandate as code. Each pillar returns { status, why } where status is
// 'pass' | 'warn' | 'fail' | 'info' | 'nodata'. Thresholds are editable in the site's settings.

export const DEFAULT_RULES = {
  moatPass: 7,                 // P1: moat >= 7 passes
  moatException: 6,            // P1: moat 6 passes only with elite value...
  eliteValueForwardPE: 12,     //     ...= forward P/E at or below this
  eliteValuePEG: 1,            //     ...or PEG below this
  pegPass: 2,                  // P2: PEG < 2 passes
  pegFail: 3,                  // P2: PEG > 3 fails; 2-3 passes only with elite margin or strong moat
  eliteEbitdaMargin: 0.40,     // P2: "elite margins (40%+)" (EBITDA margin, TTM)
  pegMoatException: 8,         // P2: moat >= 8 also unlocks the 2-3 band
  valueSignalVs5y: -0.20,      // P2 flag: P/E 20%+ below its own 5-yr average
  epsGrowthMin: 0.10,          // P3: expected EPS growth >= 10% a year
  ebitdaThin: 0.10,            // P4: below 10% EBITDA margin = thin
  debtPass: 3,                 // P5: net debt / EBITDA <= 3 passes
  debtYellow: 5,               // P5: 3-5 needs moat >= debtMoatException
  debtMoatException: 8,
  debtBreaker: 7,              // P5: above this always fails (TDG breaker)
  strongCoverage: 8,           // P5: 5-7x can pass as yellow with interest coverage >= this
  financingDays: 90,           // P6
  newCompanyYears: 3,          // P8: listed within this many years = "new company"
  // Entry plan (not pillars): Fibonacci-only entries, as the mandate says.
  buyZonePct: 0.03,            // "in the buy zone" = within 3% of a Fibonacci level
  ladderMinRatio: 0.382,       // entry levels: 38.2% retracement and deeper (23.6% is too shallow)
  ladderRungs: 3,              // split the satellite guide across up to 3 levels
  confirmRsi: 30,              // bounce confirmed: close above the 20-day average AND RSI above this
  extendedRetrace: 0.236,      // less than a 23.6% pullback from the swing high = "extended"
  fairPECap: 60,               // cap on the mandate-allowed P/E used for fair value
  satellitePct: 0.03,          // satellite guide = 3% of the stock book
};

export const PILLARS = [
  ['moat', '1 · Moat'], ['value', '2 · Value'], ['eps', '3 · EPS'], ['ebitda', '4 · EBITDA'],
  ['debt', '5 · Debt'], ['financing', '6 · Financing'], ['knife', '7 · Falling knife'], ['newco', '8 · New company'],
];

const x = (v, d = 1) => (v == null ? 'n/a' : `${v.toFixed(d)}x`);
const p = (v, d = 0) => (v == null ? 'n/a' : `${(v * 100).toFixed(d)}%`);

export function marginTier(m) {
  if (m == null) return 'n/a';
  if (m >= 0.6) return 'elite'; if (m >= 0.4) return 'excellent'; if (m >= 0.25) return 'solid';
  if (m >= 0.15) return 'normal'; if (m >= 0.10) return 'below normal'; return 'thin';
}

export function evaluate(s, rules = DEFAULT_RULES) {
  const R = { ...DEFAULT_RULES, ...rules };
  const moat = s.moatOverride ?? s.moat?.score ?? null;
  const out = {};
  const eliteValue = (s.forwardPE != null && s.forwardPE > 0 && s.forwardPE <= R.eliteValueForwardPE) || (s.peg != null && s.peg < R.eliteValuePEG);

  // 1 Moat
  if (moat == null) out.moat = { status: 'nodata', why: s.moat?.reason || 'No moat score yet' };
  else if (moat >= R.moatPass) out.moat = { status: 'pass', why: `Moat ${moat}/10` };
  else if (moat >= R.moatException && eliteValue) out.moat = { status: 'pass', why: `Moat ${moat}/10, allowed by elite value (fwd P/E ${x(s.forwardPE)}, PEG ${x(s.peg, 2)})` };
  else out.moat = { status: 'fail', why: `Moat ${moat}/10 (needs ${R.moatPass}+${moat >= R.moatException ? ', or elite value' : ''})` };

  // 2 Value
  const signal = s.peVs5y != null && s.peVs5y <= R.valueSignalVs5y ? ` · value signal: P/E ${p(-s.peVs5y)} below 5-yr avg` : '';
  if (s.forwardPE == null) out.value = { status: s.ntmEps != null && s.ntmEps <= 0 ? 'fail' : 'nodata', why: s.ntmEps != null && s.ntmEps <= 0 ? 'Forward EPS is negative' : 'No forward estimates' };
  else if (s.peg == null) out.value = { status: 'fail', why: `Fwd P/E ${x(s.forwardPE)}, no expected EPS growth` };
  else if (s.peg < R.pegPass) out.value = { status: 'pass', why: `Fwd P/E ${x(s.forwardPE)} · PEG ${x(s.peg, 2)}${signal}` };
  else if (s.peg <= R.pegFail) {
    const elite = s.ebitdaMargin != null && s.ebitdaMargin >= R.eliteEbitdaMargin;
    const strongMoat = moat != null && moat >= R.pegMoatException;
    out.value = elite || strongMoat
      ? { status: 'pass', why: `PEG ${x(s.peg, 2)}, allowed by ${elite ? `${p(s.ebitdaMargin)} EBITDA margin` : `moat ${moat}`}${signal}` }
      : { status: 'fail', why: `PEG ${x(s.peg, 2)} (2-3 needs ${p(R.eliteEbitdaMargin)}+ margin or moat ${R.pegMoatException}+)` };
  } else out.value = { status: 'fail', why: `Fwd P/E ${x(s.forwardPE)} · PEG ${x(s.peg, 2)} (over ${R.pegFail})` };
  if (out.value) out.value.signal = !!signal;

  // 3 EPS
  if (s.gaapLossTtm) out.eps = { status: 'fail', why: `GAAP loss (TTM EPS ${s.epsTtm?.toFixed(2)})` };
  else if (s.epsGrowth == null) out.eps = { status: 'nodata', why: 'No EPS growth estimate' };
  else if (s.epsGrowth >= R.epsGrowthMin) out.eps = { status: 'pass', why: `EPS growth ${p(s.epsGrowth)}/yr expected` };
  else out.eps = { status: 'fail', why: `EPS growth ${p(s.epsGrowth)}/yr (needs ${p(R.epsGrowthMin)})` };

  // 4 EBITDA (tiers are information; only "thin" is flagged)
  if (s.ebitdaMargin == null) out.ebitda = { status: 'nodata', why: 'No EBITDA margin' };
  else {
    const tier = marginTier(s.ebitdaMargin);
    const extra = ` · EV/EBITDA ${x(s.evToEbitda)} · growth ${p(s.ebitdaGrowth)}`;
    out.ebitda = { status: s.ebitdaMargin < R.ebitdaThin ? 'warn' : 'pass', why: `${p(s.ebitdaMargin)} (${tier})${extra}`, tier };
  }

  // 5 Debt
  const nd = s.netDebtToEbitda;
  if (nd == null) out.debt = { status: 'nodata', why: 'No net debt / EBITDA' };
  else if (nd <= R.debtPass) out.debt = { status: 'pass', why: nd < 0 ? 'Net cash' : `Net debt/EBITDA ${x(nd)}` };
  else if (nd > R.debtBreaker) out.debt = { status: 'fail', why: `Net debt/EBITDA ${x(nd)} (over ${R.debtBreaker}x breaker)` };
  else if (nd <= R.debtYellow) out.debt = moat != null && moat >= R.debtMoatException
    ? { status: 'warn', why: `Net debt/EBITDA ${x(nd)}, held by moat ${moat}` }
    : { status: 'fail', why: `Net debt/EBITDA ${x(nd)} (3-5x needs moat ${R.debtMoatException}+)` };
  else out.debt = s.interestCoverage != null && s.interestCoverage >= R.strongCoverage
    ? { status: 'warn', why: `Net debt/EBITDA ${x(nd)}, interest covered ${x(s.interestCoverage)}` }
    : { status: 'fail', why: `Net debt/EBITDA ${x(nd)}, coverage ${x(s.interestCoverage)}` };

  // 6 Financing: stock sales, converts and ATM programs fail; plain bond issues don't count.
  const raises = s.recentRaises || [];
  const equity = raises.find((r) => ['equity', 'convert', 'atm'].includes(r.kind));
  const unclear = raises.find((r) => r.kind === 'unknown' || r.kind === 'unread');
  const debtOnly = raises.length && raises.every((r) => r.kind === 'debt');
  const label = { equity: 'Stock offering', convert: 'Convertible', atm: 'ATM program' };
  if (equity) out.financing = { status: 'fail', why: `${label[equity.kind]} filed ${equity.date} (${equity.form})` };
  else if (unclear) out.financing = { status: 'warn', why: `Prospectus filed ${unclear.date} (${unclear.form}), type not confirmed` };
  else if (s.recentShelves?.length) out.financing = { status: 'warn', why: `Shelf registration ${s.recentShelves[0].date} (${s.recentShelves[0].form}), no offering yet` };
  else if (debtOnly) out.financing = { status: 'pass', why: `Bond issue only (${raises[0].date}), no stock sold` };
  else out.financing = { status: 'pass', why: `No offering filings in ${R.financingDays} days` };

  // 7 Falling knife: never excludes
  out.knife = { status: 'info', why: s.offHigh == null ? 'No price history' : `${p(s.offHigh)} from 52-wk high` };

  // 8 New company: information only
  out.newco = { status: 'info', why: s.yearsListed != null && s.yearsListed < R.newCompanyYears ? `New: listed ${s.ipoDate}` : s.ipoDate ? `Listed ${s.ipoDate.slice(0, 4)}` : 'n/a' };

  // Overall: first failed pillar in mandate order stops the verdict.
  const order = ['moat', 'value', 'eps', 'ebitda', 'debt', 'financing'];
  const firstFail = order.find((k) => out[k].status === 'fail') || null;
  const missing = order.filter((k) => out[k].status === 'nodata');
  const overall = firstFail ? 'fail' : missing.length ? 'incomplete' : order.some((k) => out[k].status === 'warn') ? 'pass-warn' : 'pass';
  return { pillars: out, firstFail, missing, overall, moat };
}
