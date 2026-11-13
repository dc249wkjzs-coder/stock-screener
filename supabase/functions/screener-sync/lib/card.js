// The compact row the scorecard table loads for every stock: what evaluate() needs plus display fields.
export function makeCard(m, tech, moat, magic) {
  // Valuation follows the latest close, not the price on the day fundamentals were pulled.
  const px = tech?.lastClose ?? m.price;
  const forwardPE = m.ntmEps > 0 && px ? px / m.ntmEps : m.forwardPE;
  const peg = forwardPE != null && m.epsGrowth > 0 ? forwardPE / (m.epsGrowth * 100) : null;
  const peTtm = m.epsTtm > 0 && px ? px / m.epsTtm : m.peTtm;
  const peVs5y = peTtm != null && peTtm > 0 && m.pe5yAvg ? peTtm / m.pe5yAvg - 1 : null;
  m = { ...m, forwardPE, peg, peTtm, peVs5y };
  return {
    symbol: m.symbol, name: m.name, sector: m.sector, industry: m.industry,
    price: tech?.lastClose ?? m.price, priceDate: tech?.lastDate ?? m.priceDate, marketCap: m.marketCap, beta: m.beta,
    ipoDate: m.ipoDate, yearsListed: m.yearsListed,
    forwardPE: m.forwardPE, peg: m.peg, ntmEps: m.ntmEps, peTtm: m.peTtm, pe5yAvg: m.pe5yAvg, peVs5y: m.peVs5y,
    epsGrowth: m.epsGrowth, epsTtm: m.epsTtm, gaapLossTtm: m.gaapLossTtm, gaapEpsGrowthLastFy: m.gaapEpsGrowthLastFy,
    ebitdaMargin: m.ebitdaMargin, evToEbitda: m.evToEbitda, ebitdaGrowth: m.ebitdaGrowth,
    netDebtToEbitda: m.netDebtToEbitda, interestCoverage: m.interestCoverage,
    recentRaises: (m.recentRaises || []).map(({ form, date, kind }) => ({ form, date, kind })),
    recentShelves: (m.recentShelves || []).map(({ form, date }) => ({ form, date })),
    moat: moat ? { score: moat.score, reason: moat.reason || null } : null,
    offHigh: tech?.offHigh ?? null, rsi14: tech?.rsi14 ?? null, rsiMin10: tech?.rsiMin10 ?? null,
    sma20: tech?.sma20 ?? null, sma50: tech?.sma50 ?? null, sma200: tech?.sma200 ?? null,
    high52: tech?.high52 ?? null, low52: tech?.low52 ?? null,
    pullbackMax: tech?.pullbackMax ?? null, pullbackMedian: tech?.pullbackMedian ?? null, pullbackCount: tech?.pullbackCount ?? null,
    chg1m: tech?.chg1m ?? null, chg3m: tech?.chg3m ?? null, chg1y: tech?.chg1y ?? null,
    fibSupport: tech?.fib?.nextSupport ?? null, fibRetraced: tech?.fib?.retraced ?? null,
    dcf: m.dcf, dcfUpside: tech?.lastClose && m.dcf != null ? m.dcf / tech.lastClose - 1 : m.dcfUpside,
    targetConsensus: m.targetConsensus ?? null, targetHigh: m.targetHigh ?? null, targetLow: m.targetLow ?? null,
    revenueGrowth: m.revenueGrowth ?? null, revenueGrowth3y: m.revenueGrowth3y ?? null, fcfYield: m.fcfYield ?? null, fcfMargin: m.fcfMargin ?? null,
    dividendYield: m.dividendYield ?? null, payoutRatio: m.payoutRatio ?? null,
    piotroski: m.piotroski, altmanZ: m.altmanZ, magicRank: magic?.rank ?? null, magicOf: magic?.of ?? null,
  };
}
