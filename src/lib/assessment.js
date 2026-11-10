// Strengths and weaknesses read straight from a stock's numbers, each with the definition it relates to.
// Facts only: every line states a figure and the threshold it was compared with.
const p = (v, d = 0) => `${(v * 100).toFixed(d)}%`
const x = (v) => `${v.toFixed(1)}x`

export function assess(s) {
  const good = [], bad = []
  const add = (list, text, term) => list.push({ text, term })
  const m = s.moatUsed

  if (m >= 8) add(good, `Strong moat (${m}/10): high, steady returns on capital and margins above its industry.`, 'moat')
  else if (m != null && m <= 5) add(bad, `Weak moat by the numbers (${m}/10): returns or margins don't stand out from competitors.`, 'moat')
  if (s.moat?.score == null && s.moatOverride == null) add(bad, 'Too little financial history to calculate a moat; it needs your judgement.', 'new-company')

  if (s.ebitdaMargin >= 0.4) add(good, `${s.ebitdaMargin >= 0.6 ? 'Elite' : 'Excellent'} EBITDA margin of ${p(s.ebitdaMargin)}: lots of cash from each dollar of sales.`, 'ebitda-margin')
  else if (s.ebitdaMargin != null && s.ebitdaMargin < 0.15) add(bad, `Thin EBITDA margin of ${p(s.ebitdaMargin)}: little room for mistakes or price pressure.`, 'ebitda-margin')

  if (s.epsGrowth >= 0.15) add(good, `Analysts expect earnings to grow ${p(s.epsGrowth)} a year.`, 'eps-growth')
  else if (s.epsGrowth != null && s.epsGrowth < 0.10) add(bad, `Expected earnings growth is only ${p(s.epsGrowth)} a year (your minimum is 10%).`, 'eps-growth')
  if (s.gaapLossTtm) add(bad, 'Loses money under GAAP accounting over the last 12 months.', 'gaap-adjusted')

  if (s.netDebtToEbitda != null && s.netDebtToEbitda < 0) add(good, 'Net cash: it holds more cash than debt.', 'net-debt')
  else if (s.netDebtToEbitda != null && s.netDebtToEbitda <= 1) add(good, `Low debt: net debt is ${x(s.netDebtToEbitda)} EBITDA.`, 'net-debt-ebitda')
  else if (s.netDebtToEbitda > 3) add(bad, `High debt: net debt is ${x(s.netDebtToEbitda)} EBITDA (your comfort line is 3x).`, 'net-debt-ebitda')
  if (s.interestCoverage != null && s.interestCoverage > 0 && s.interestCoverage < 3) add(bad, `Profit covers interest only ${x(s.interestCoverage)}.`, 'interest-coverage')

  if (s.piotroski >= 7) add(good, `Strong financial health checklist (Piotroski ${s.piotroski}/9).`, 'piotroski')
  else if (s.piotroski != null && s.piotroski <= 3) add(bad, `Weak financial health checklist (Piotroski ${s.piotroski}/9).`, 'piotroski')
  if (s.altmanZ != null && s.altmanZ < 1.8) add(bad, `Altman Z-Score ${s.altmanZ.toFixed(1)} is in the distress zone (below 1.8).`, 'altman')

  if (s.peg != null && s.peg < 1) add(good, `Cheap for its growth: PEG ${s.peg.toFixed(2)}.`, 'peg')
  else if (s.peg > 3) add(bad, `Expensive for its growth: PEG ${s.peg.toFixed(2)} (your mandate fails above 3).`, 'peg')
  if (s.eval?.pillars?.value?.signal) add(good, `P/E is ${p(-s.peVs5y)} below its own 5-year average.`, 'value-signal')
  if (s.fair?.vsMid <= -0.15) add(good, `Trades ${p(-s.fair.vsMid)} below the middle of its fair value range.`, 'fair-value')
  else if (s.fair?.vsMid >= 0.2) add(bad, `Trades ${p(s.fair.vsMid)} above the middle of its fair value range.`, 'fair-value')

  if (s.price && s.sma50 && s.sma200 && s.price < s.sma50 && s.price < s.sma200) add(bad, 'In a downtrend: below both its 50-day and 200-day averages.', 'sma')
  else if (s.price && s.sma50 && s.sma200 && s.price > s.sma50 && s.sma50 > s.sma200) add(good, 'In an uptrend: above its 50-day average, which is above the 200-day.', 'sma')
  if (s.beta > 1.8) add(bad, `Volatile: beta ${s.beta.toFixed(2)}, so it tends to move ${s.beta.toFixed(1)}× the market.`, 'beta')
  const raise = (s.recentRaises || []).find((r) => ['equity', 'convert', 'atm'].includes(r.kind))
  if (raise) add(bad, `Raised money by selling stock or converts on ${raise.date}.`, 'financing')
  return { good, bad }
}
