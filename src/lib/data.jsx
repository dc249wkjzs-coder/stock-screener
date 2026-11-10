import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEMO, supabase } from './supabase'
import { DEFAULT_RULES, evaluate } from '@shared/pillars.js'
import { fairValue, entrySetup } from '@shared/valuation.js'

// FMP lists one share class per company; map the other class to it (you may hold GOOGL, the screener has GOOG).
export const ALIASES = { GOOGL: 'GOOG', 'BRK.B': 'BRK-B', 'BRK.A': 'BRK-B', 'BRK-A': 'BRK-B' }
export const canonical = (s) => ALIASES[s?.toUpperCase()] || s?.toUpperCase()

const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

async function selectAll(table, cols, filter) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

export function DataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, cards: [], pending: [], positions: [], overrides: {}, savedRules: {}, quotes: {}, lastScored: null })
  const [toast, setToast] = useState(null)
  const flash = useCallback((msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200) }, [])

  const load = useCallback(async () => {
    try {
      if (DEMO) {
        const sample = await fetch('/sample.json').then((r) => r.json())
        setState({ loading: false, error: null, cards: sample.cards, ai: sample.ai || {}, pending: [], positions: sample.positions, overrides: {}, savedRules: {}, quotes: {}, lastScored: sample.scoredAt })
        return
      }
      const [rows, pending, positions, overrides, settings, quotes, ai] = await Promise.all([
        selectAll('scr_stocks', 'symbol,card,scored_at,fundamentals_at', (q) => q.eq('active', true).not('card', 'is', null).order('symbol')),
        // Stocks in the universe whose financials haven't been downloaded and scored yet.
        selectAll('scr_stocks', 'symbol,name', (q) => q.eq('active', true).is('card', null).order('symbol')),
        selectAll('positions', 'id,symbol,status,shares,avg_cost,asset_class,name', (q) => q.eq('asset_class', 'stock')),
        selectAll('scr_overrides', 'symbol,moat,note'),
        supabase.from('scr_user_settings').select('rules').maybeSingle(),
        selectAll('quotes', 'symbol,price'),
        selectAll('scr_ai', 'symbol,risk,benefit,risk_reasons,benefit_reasons,summary,rated_at,rated_by').catch(() => []),
      ])
      setState({
        loading: false, error: null,
        cards: rows.map((r) => ({ ...r.card, fundamentalsAt: r.fundamentals_at })),
        pending,
        ai: Object.fromEntries(ai.map((a) => [a.symbol, a])),
        positions,
        overrides: Object.fromEntries(overrides.map((o) => [o.symbol, o])),
        savedRules: settings.data?.rules || {},
        quotes: Object.fromEntries(quotes.map((q) => [q.symbol, Number(q.price)])),
        lastScored: rows.reduce((m, r) => (r.scored_at > m ? r.scored_at : m), ''),
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || String(e) }))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const rules = useMemo(() => ({ ...DEFAULT_RULES, ...state.savedRules }), [state.savedRules])

  // Holdings: owned shares > 0 and watchlist names, by symbol.
  const held = useMemo(() => {
    const m = {}
    for (const p of state.positions) {
      if (!p.symbol) continue
      const k = canonical(p.symbol)
      m[k] ||= { shares: 0, cost: 0, watch: false }
      if (p.status === 'prospect') m[k].watch = true
      else { m[k].shares += Number(p.shares || 0); m[k].cost += Number(p.shares || 0) * Number(p.avg_cost || 0) }
    }
    return m
  }, [state.positions])

  // Stock book value (individual stocks only), for the satellite guide.
  const book = useMemo(() => {
    const px = Object.fromEntries(state.cards.map((c) => [c.symbol, c.price]))
    let v = 0
    for (const [sym, h] of Object.entries(held)) {
      if (!h.shares) continue
      const p = px[sym] ?? state.quotes[sym]
      if (p) v += h.shares * p
    }
    return v
  }, [held, state.cards, state.quotes])
  const guide = book * rules.satellitePct

  // Every stock with its mandate verdict, fair value range and entry status under the current rules.
  const stocks = useMemo(() => state.cards.map((c) => {
    const o = state.overrides[c.symbol]
    const a = state.ai?.[c.symbol]
    const s = { ...c, moatOverride: o?.moat ?? null, ai: a || null, aiRisk: a?.risk ?? null, aiBenefit: a?.benefit ?? null }
    const e = evaluate(s, rules)
    const h = held[c.symbol]
    const fair = fairValue(s, rules)
    const setup = entrySetup(s, e, rules, guide || null)
    return { ...s, eval: e, moatUsed: e.moat, owned: (h?.shares || 0) > 0, watch: !!h?.watch, shares: h?.shares || 0, fair, setup }
  }), [state.cards, state.overrides, state.ai, rules, held, guide])

  const bySymbol = useMemo(() => Object.fromEntries(stocks.map((s) => [s.symbol, s])), [stocks])

  async function saveOverride(symbol, moat, note) {
    if (DEMO) { setState((s) => ({ ...s, overrides: { ...s.overrides, [symbol]: moat == null ? undefined : { symbol, moat, note } } })); return }
    if (moat == null) {
      const { error } = await supabase.from('scr_overrides').delete().eq('symbol', symbol)
      if (error) return flash(error.message, 'error')
    } else {
      const { error } = await supabase.from('scr_overrides').upsert({ symbol, moat, note: note || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,symbol' })
      if (error) return flash(error.message, 'error')
    }
    setState((s) => {
      const o = { ...s.overrides }
      if (moat == null) delete o[symbol]; else o[symbol] = { symbol, moat, note }
      return { ...s, overrides: o }
    })
    flash(moat == null ? `${symbol}: back to the calculated moat score` : `${symbol}: moat set to ${moat}`)
  }

  async function saveRules(next) {
    const clean = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== DEFAULT_RULES[k]))
    if (!DEMO) {
      const { error } = await supabase.from('scr_user_settings').upsert({ rules: clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) return flash(error.message, 'error')
    }
    setState((s) => ({ ...s, savedRules: clean }))
    flash('Rules saved')
  }

  // "Add to watchlist" = a Life Ledger position with status 'prospect'.
  async function addToWatchlist(stock) {
    if (held[stock.symbol]?.watch) return flash(`${stock.symbol} is already on your watchlist`, 'warn')
    // Same shape as watchlist rows made in Life Ledger; the target is the next Fibonacci support.
    const target = stock.fibSupport?.price ? Math.round(stock.fibSupport.price * 100) / 100 : null
    const row = { symbol: stock.symbol, name: stock.name, asset_class: 'stock', status: 'prospect', shares: null, target_price: target }
    if (!DEMO) {
      const { data, error } = await supabase.from('positions').insert(row).select('id,symbol,status,shares,avg_cost,asset_class,name').single()
      if (error) return flash(error.message, 'error')
      setState((s) => ({ ...s, positions: [...s.positions, data] }))
    } else setState((s) => ({ ...s, positions: [...s.positions, { ...row, id: Math.random() }] }))
    flash(`${stock.symbol} added to your Life Ledger watchlist`)
  }

  const value = { ...state, demo: DEMO, rules, stocks, bySymbol, held, book, guide, toast, reload: load, saveOverride, saveRules, addToWatchlist }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
