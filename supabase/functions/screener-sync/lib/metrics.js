// Turns raw FMP responses for one stock into the numbers the mandate needs.
// Every field may be null when FMP has no data; the pillars treat null as "no data".

const arr = (x) => (Array.isArray(x) ? x : []);
const one = (x) => arr(x)[0] || null;
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const stdev = (xs) => { const v = xs.filter((x) => x != null); if (v.length < 2) return null; const m = avg(v); return Math.sqrt(avg(v.map((x) => (x - m) ** 2))); };
const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 864e5;

// Prospectus/registration forms that mean a raise happened or is ready to happen.
const RAISE_FORMS = /^(424B[1-8]|S-1|S-1\/A|F-1|F-1\/A)$/;
const SHELF_FORMS = /^(S-3|S-3ASR|S-3\/A|F-3|F-3ASR)$/;

// Forward EPS: blend of the next two fiscal-year consensus estimates, weighted by time,
// so it always covers the next 12 months (NTM).
export function forwardEps(estimates, today = new Date()) {
  const est = arr(estimates).filter((e) => num(e.epsAvg) != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const t = today.toISOString().slice(0, 10);
  const i1 = est.findIndex((e) => e.date >= t);
  if (i1 < 0) return null;
  const fy1 = est[i1], fy2 = est[i1 + 1] || null, fy0 = est[i1 - 1] || null;
  const w = Math.min(1, Math.max(0, daysBetween(t, fy1.date) / 365));
  const ntm = fy2 ? w * fy1.epsAvg + (1 - w) * fy2.epsAvg : fy1.epsAvg;
  // Expected growth: 2-year annualised from the last completed year (FY0) to FY2, all consensus (adjusted) EPS.
  let growth = null, growthBasis = null;
  if (fy0 && fy2 && fy0.epsAvg > 0 && fy2.epsAvg > 0) { growth = Math.sqrt(fy2.epsAvg / fy0.epsAvg) - 1; growthBasis = `FY${fy0.date.slice(0, 4)}→FY${fy2.date.slice(0, 4)} consensus EPS, annualised`; }
  else if (fy0 && fy1 && fy0.epsAvg > 0 && fy1.epsAvg > 0) { growth = fy1.epsAvg / fy0.epsAvg - 1; growthBasis = `FY${fy0.date.slice(0, 4)}→FY${fy1.date.slice(0, 4)} consensus EPS`; }
  return {
    ntmEps: ntm, growth, growthBasis,
    fy0: fy0 && { date: fy0.date, eps: fy0.epsAvg },
    fy1: { date: fy1.date, eps: fy1.epsAvg, analysts: fy1.numAnalystsEps },
    fy2: fy2 && { date: fy2.date, eps: fy2.epsAvg },
  };
}

// Return on operating capital for one fiscal year (income row + balance row, FMP field names).
// After-tax EBIT ÷ (total assets − cash & investments − goodwill & intangibles − non-debt current liabilities),
// with the capital floored at 10% of tangible operating assets; clamped to ±100%.
export function roicOf(inc, b) {
  if (!inc || !b || inc.ebit == null) return null;
  const taxRate = inc.incomeBeforeTax > 0 ? Math.min(0.35, Math.max(0, inc.incomeTaxExpense / inc.incomeBeforeTax)) : 0.21;
  const nopat = inc.ebit * (1 - taxRate);
  const cash = (b.cashAndShortTermInvestments ?? b.cashAndCashEquivalents ?? 0) + (b.longTermInvestments || 0);
  const tangibleOpAssets = (b.totalAssets || 0) - cash - (b.goodwillAndIntangibleAssets || 0);
  const freeCredit = Math.max(0, (b.totalCurrentLiabilities || 0) - (b.shortTermDebt || 0));
  const capital = Math.max(tangibleOpAssets - freeCredit, tangibleOpAssets * 0.10);
  if (!(capital > 0)) return null;
  return Math.max(-1, Math.min(1, nopat / capital));
}

export function buildMetrics(raw, uni, today = new Date()) {
  const profile = one(raw.profile);
  const income = arr(raw.income).slice().sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  const km = arr(raw.keyMetrics).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const ratios = arr(raw.ratios).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const kmT = one(raw.kmTtm) || {};
  const rT = one(raw.ratiosTtm) || {};
  const scores = one(raw.scores) || {};
  const dcfRow = one(raw.dcf) || {};
  const price = num(uni?.price) ?? num(profile?.price);

  // --- Currency. Foreign companies listed in New York (ASML, TSM) report EPS and estimates in their home
  // currency per ordinary share, while the price is in US dollars per listed share. FMP's own trailing P/E
  // is already consistent, so price ÷ (P/E × reported EPS) gives the factor that turns reported EPS into
  // dollars per listed share (covers both the exchange rate and the ADR ratio).
  const reportedCurrency = income[0]?.reportedCurrency || 'USD';
  const foreign = reportedCurrency !== 'USD';
  const peTtm = num(rT.priceToEarningsRatioTTM);
  const epsReported = num(rT.netIncomePerShareTTM);
  const fx = !foreign ? 1 : peTtm > 0 && epsReported > 0 && price ? price / (peTtm * epsReported) : null;
  const toUsd = (x) => (x == null || fx == null ? null : x * fx);

  // --- EPS lens
  const fwdRaw = forwardEps(raw.estimates, today);
  const fwd = fwdRaw && fx != null ? {
    ...fwdRaw, ntmEps: toUsd(fwdRaw.ntmEps),
    fy0: fwdRaw.fy0 && { ...fwdRaw.fy0, eps: toUsd(fwdRaw.fy0.eps) },
    fy1: { ...fwdRaw.fy1, eps: toUsd(fwdRaw.fy1.eps) },
    fy2: fwdRaw.fy2 && { ...fwdRaw.fy2, eps: toUsd(fwdRaw.fy2.eps) },
  } : null;
  const forwardPE = fwd && fwd.ntmEps > 0 && price ? price / fwd.ntmEps : null;
  const epsTtm = foreign ? toUsd(epsReported) : epsReported;
  const gaapLossTtm = epsReported != null ? epsReported < 0 : null;
  const lastFy = income[0], prevFy = income[1];
  const gaapEpsGrowthLastFy = lastFy && prevFy && prevFy.epsDiluted > 0 ? lastFy.epsDiluted / prevFy.epsDiluted - 1 : null;
  const peg = forwardPE != null && fwd?.growth > 0 ? forwardPE / (fwd.growth * 100) : null;

  // 5-year average trailing P/E (fiscal-year-end prices), positive years only.
  const pes = ratios.map((r) => num(r.priceToEarningsRatio)).filter((x) => x != null && x > 0);
  const pe5yAvg = pes.length >= 3 ? avg(pes) : null;
  const peVs5y = peTtm != null && peTtm > 0 && pe5yAvg ? peTtm / pe5yAvg - 1 : null;

  // --- EBITDA lens
  const ebitdaMargin = num(rT.ebitdaMarginTTM);
  const evToEbitda = num(kmT.evToEBITDATTM);
  const ebitdaGrowth = lastFy && prevFy && prevFy.ebitda > 0 ? lastFy.ebitda / prevFy.ebitda - 1 : null;

  // --- Sales growth, free cash flow, dividends (all ratios, so the reporting currency doesn't matter)
  const revenueGrowth = lastFy && prevFy && prevFy.revenue > 0 && lastFy.revenue > 0 ? lastFy.revenue / prevFy.revenue - 1 : null;
  const rev3 = income[3];
  const revenueGrowth3y = lastFy && rev3?.revenue > 0 && lastFy.revenue > 0 ? (lastFy.revenue / rev3.revenue) ** (1 / 3) - 1 : null;
  const fcfYield = num(kmT.freeCashFlowYieldTTM);
  const fcfMargin = num(rT.freeCashFlowPerShareTTM) != null && num(rT.revenuePerShareTTM) > 0 ? rT.freeCashFlowPerShareTTM / rT.revenuePerShareTTM : null;
  const dividendYield = num(rT.dividendYieldTTM);
  const payoutRatio = num(rT.dividendPayoutRatioTTM);
  const operatingMargin = num(rT.operatingProfitMarginTTM);
  const grossMargin = num(rT.grossProfitMarginTTM);

  // --- Debt
  const netDebtToEbitda = num(kmT.netDebtToEBITDATTM);
  const interestCoverage = num(rT.interestCoverageRatioTTM);

  // --- Moat inputs (5 annual years)
  // Return on operating capital: after-tax EBIT ÷ the capital the business actually runs on =
  // total assets − cash & investments − goodwill & intangibles − non-debt current liabilities
  // (payables, deferred revenue). Excess cash and acquisition goodwill are left out, so cash-rich
  // and acquisitive companies are measured on the business itself. A floor of 10% of tangible
  // operating assets stops tiny denominators from producing meaningless percentages.
  const balance = arr(raw.balance);
  const roicYears = income.slice(0, 5).map((inc) => roicOf(inc, balance.find((x) => x.date === inc.date))).filter((x) => x != null);
  const roicReportedYears = km.map((r) => num(r.returnOnInvestedCapital)).filter((x) => x != null);
  const grossMarginYears = income.slice(0, 5).map((r) => (r.revenue > 0 ? r.grossProfit / r.revenue : null)).filter((x) => x != null);
  const opMarginYears = income.slice(0, 5).map((r) => (r.revenue > 0 ? (r.operatingIncome ?? r.ebit) / r.revenue : null)).filter((x) => x != null);

  // --- Financing (pillar 6)
  const cutoff = new Date(today.getTime() - 90 * 864e5).toISOString().slice(0, 10);
  const recent = arr(raw.filings).filter((f) => (f.filingDate || '').slice(0, 10) >= cutoff);
  // raw.filingKinds maps a filing link to what its cover says is being sold (see classifyFiling).
  const kinds = raw.filingKinds || {};
  const raises = recent.filter((f) => RAISE_FORMS.test(f.formType)).map((f) => {
    const link = f.finalLink || f.link;
    return { form: f.formType, date: f.filingDate.slice(0, 10), link, kind: kinds[link]?.kind || 'unread', note: kinds[link]?.note || null };
  });
  const shelves = recent.filter((f) => SHELF_FORMS.test(f.formType)).map((f) => ({ form: f.formType, date: f.filingDate.slice(0, 10), link: f.finalLink || f.link }));

  // --- Magic formula inputs
  const ebitTtm = num(rT.ebitMarginTTM) != null && num(scores.revenue) ? rT.ebitMarginTTM * scores.revenue : null;
  const evTtm = num(kmT.enterpriseValueTTM);
  const earningsYieldEbit = ebitTtm != null && evTtm > 0 ? ebitTtm / evTtm : null;

  const ipoDate = profile?.ipoDate || null;
  const yearsListed = ipoDate ? daysBetween(ipoDate, today) / 365 : null;
  // FMP's DCF for foreign reporters mixes currencies (ASML came out at a fifth of its price), so it's left out.
  const dcf = foreign ? null : num(dcfRow.dcf);
  const pt = one(raw.priceTarget) || {};

  return {
    symbol: raw.symbol,
    name: profile?.companyName || uni?.companyName || null,
    sector: profile?.sector || uni?.sector || null,
    industry: profile?.industry || uni?.industry || null,
    marketCap: num(uni?.marketCap) ?? num(profile?.marketCap),
    price, priceDate: today.toISOString().slice(0, 10), reportedCurrency, fxToUsd: foreign ? fx : null,
    beta: num(uni?.beta) ?? num(profile?.beta),
    ipoDate, yearsListed,
    company: profile ? { description: profile.description || null, ceo: profile.ceo || null, website: profile.website || null, employees: num(Number(profile.fullTimeEmployees)) , hq: [profile.city, profile.state].filter(Boolean).join(', ') || null } : null,
    revenue: lastFy ? num(lastFy.revenue) : null,
    revenueTtm: num(scores.revenue),
    // value
    forwardPE, peg, peTtm, pe5yAvg, peVs5y,
    epsGrowth: fwd?.growth ?? null, epsGrowthBasis: fwd?.growthBasis ?? null,
    ntmEps: fwd?.ntmEps ?? null, estimates: fwd ? { fy0: fwd.fy0, fy1: fwd.fy1, fy2: fwd.fy2 } : null,
    // eps
    epsTtm, gaapLossTtm, gaapEpsGrowthLastFy, lastFyDate: lastFy?.date || null,
    // ebitda
    ebitdaMargin, evToEbitda, ebitdaGrowth, operatingMargin, grossMargin,
    revenueGrowth, revenueGrowth3y, fcfYield, fcfMargin, dividendYield, payoutRatio,
    // debt
    netDebtToEbitda, interestCoverage,
    // moat inputs
    roicYears, roicAvg: avg(roicYears), roicYearsAbove10: roicYears.filter((x) => x > 0.10).length,
    roicMedian: roicYears.length ? [...roicYears].sort((a, b) => a - b)[Math.floor((roicYears.length - 1) / 2)] : null,
    roicYearsAbove15: roicYears.filter((x) => x > 0.15).length,
    // Years with an operating loss in the last five (a moat should show up as steady profits).
    lossYears: income.slice(0, 5).filter((r) => (r.operatingIncome ?? r.ebit) < 0).length,
    incomeYears: Math.min(5, income.length),
    roicReportedAvg: avg(roicReportedYears),
    grossMarginYears, grossMarginAvg: avg(grossMarginYears), grossMarginStdev: stdev(grossMarginYears), opMarginYears,
    roicTtm: num(kmT.returnOnInvestedCapitalTTM),
    // financing
    recentRaises: raises, recentShelves: shelves,
    // extras
    piotroski: num(scores.piotroskiScore), altmanZ: num(scores.altmanZScore),
    dcf, dcfUpside: dcf != null && price ? dcf / price - 1 : null,
    // analysts' 12-month price targets
    targetConsensus: num(pt.targetConsensus), targetHigh: num(pt.targetHigh), targetLow: num(pt.targetLow), targetMedian: num(pt.targetMedian),
    earningsYieldEbit,
    dataGaps: ['profile', 'income', 'balance', 'keyMetrics', 'ratios', 'kmTtm', 'ratiosTtm', 'estimates', 'scores', 'dcf', 'filings']
      .filter((k) => !Array.isArray(raw[k]) || (raw[k].__error)),
  };
}
