import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEMO, supabase } from './supabase'
import { DEFAULT_RULES } from '@shared/pillars.js'
import { fairValue, entrySetup } from '@shared/valuation.js'
import { BLANK } from '@shared/criteria.js'
import { blendMoat } from '@shared/crossSection.js'

// FMP lists one share class per company; map the other class to it (GOOGL → GOOG).
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

// The visitor's current screen is remembered in this browser only.
const SCREEN_KEY = 'screener.screen.v1'
const loadScreen = () => { try { return { ...BLANK, ...JSON.parse(localStorage.getItem(SCREEN_KEY) || 'null') } } catch { return { ...BLANK } } }

// In demo mode the portfolio lives in this browser only.
const DEMO_PF_KEY = 'screener.portfolio.demo'
const loadDemoPortfolio = () => { try { return JSON.parse(localStorage.getItem(DEMO_PF_KEY) || '[]') } catch { return [] } }
const saveDemoPortfolio = (pf) => { try { localStorage.setItem(DEMO_PF_KEY, JSON.stringify(pf)) } catch { /* ignore */ } }

// Entry levels are worked out for every stock, independent of any screen.
const PASS = { overall: 'pass', pillars: {}, missing: [] }

export function DataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, cards: [], pending: [], overrides: {}, ai: {}, reviews: {}, presets: [], portfolio: [], lastScored: null })
  const [screen, setScreenState] = useState(loadScreen)
  const [toast, setToast] = useState(null)
  const flash = useCallback((msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200) }, [])
  const setScreen = useCallback((next) => {
    setScreenState(next)
    try { localStorage.setItem(SCREEN_KEY, JSON.stringify(next)) } catch { /* private window: keep it in memory */ }
  }, [])

  const load = useCallback(async () => {
    try {
      if (DEMO) {
        const sample = await fetch('/sample.json').then((r) => r.json())
        setState({ loading: false, error: null, cards: sample.cards, ai: sample.ai || {}, pending: [], overrides: {}, presets: [], portfolio: loadDemoPortfolio(), lastScored: sample.scoredAt })
        return
      }
      const [rows, pending, overrides, ai, presets, reviews, portfolio] = await Promise.all([
        selectAll('scr_stocks', 'symbol,card,scored_at,fundamentals_at,roic:metrics->roicMedian', (q) => q.eq('active', true).not('card', 'is', null).order('symbol')),
        // Stocks in the universe whose financials haven't been downloaded and scored yet.
        selectAll('scr_stocks', 'symbol,name', (q) => q.eq('active', true).is('card', null).order('symbol')),
        selectAll('scr_overrides', 'symbol,moat,note'),
        selectAll('scr_ai', 'symbol,risk,benefit,risk_reasons,benefit_reasons,summary,rated_at,rated_by').catch(() => []),
        supabase.from('scr_presets').select('id,name,criteria').order('name').then((r) => r.data || []),
        selectAll('scr_moat_review', 'symbol,rating,sources,why,rated_at,rated_by').catch(() => []),
        supabase.from('scr_portfolio').select('symbol,weight,added_at').order('added_at').then((r) => r.data || []),
      ])
      setState({
        loading: false, error: null,
        cards: rows.map((r) => ({ ...r.card, roic: r.roic == null ? null : Number(r.roic), fundamentalsAt: r.fundamentals_at })),
        pending,
        ai: Object.fromEntries(ai.map((a) => [a.symbol, a])),
        overrides: Object.fromEntries(overrides.map((o) => [o.symbol, o])),
        presets,
        portfolio: portfolio.map((p) => ({ symbol: p.symbol, weight: p.weight == null ? null : Number(p.weight) })),
        reviews: Object.fromEntries(reviews.map((r) => [r.symbol, r])),
        lastScored: rows.reduce((m, r) => (r.scored_at > m ? r.scored_at : m), ''),
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || String(e) }))
    }
  }, [])
  useEffect(() => { load() }, [load])

  // Every stock with its moat (override first), AI scores, fair value range and entry status.
  const stocks = useMemo(() => state.cards.map((c) => {
    const o = state.overrides[c.symbol]
    const a = state.ai?.[c.symbol]
    const s = { ...c, moatOverride: o?.moat ?? null, ai: a || null, aiRisk: a?.risk ?? null, aiBenefit: a?.benefit ?? null }
    s.moatReview = state.reviews?.[c.symbol] || null
    s.moatBlend = blendMoat(c.moat?.score ?? null, s.moatReview)
    s.moatUsed = s.moatOverride ?? s.moatBlend
    // PEG from growth above 100% is a base effect (earnings bouncing back from a very weak year), not a cheap price.
    if (s.peg != null && s.epsGrowth > 1) { s.pegRaw = s.peg; s.peg = null; s.pegNote = `PEG left out: expected growth of ${Math.round(s.epsGrowth * 100)}% starts from a very weak year` }
    return { ...s, fair: fairValue(s, DEFAULT_RULES), setup: entrySetup(s, PASS, DEFAULT_RULES, null) }
  }), [state.cards, state.overrides, state.ai, state.reviews])

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

  // Your saved screens. Saving under an existing name replaces it.
  async function savePreset(name, criteria) {
    name = name.trim()
    if (!name) return flash('Give the preset a name', 'warn')
    let row = { id: `demo-${name}`, name, criteria }
    if (!DEMO) {
      const { data, error } = await supabase.from('scr_presets').upsert({ name, criteria, updated_at: new Date().toISOString() }, { onConflict: 'user_id,name' }).select('id,name,criteria').single()
      if (error) return flash(error.message, 'error')
      row = data
    }
    setState((s) => ({ ...s, presets: [...s.presets.filter((p) => p.name !== name), row].sort((a, b) => a.name.localeCompare(b.name)) }))
    flash(`Saved "${name}"`)
  }
  async function deletePreset(p) {
    if (!DEMO) {
      const { error } = await supabase.from('scr_presets').delete().eq('id', p.id)
      if (error) return flash(error.message, 'error')
    }
    setState((s) => ({ ...s, presets: s.presets.filter((x) => x.id !== p.id) }))
    flash(`Deleted "${p.name}"`)
  }

  // My portfolio: a list of stocks being considered (not real holdings), each with an optional weight in %.
  const inPortfolio = useCallback((symbol) => state.portfolio.some((p) => p.symbol === symbol), [state.portfolio])
  function setPortfolio(next) { setState((s) => ({ ...s, portfolio: next })); if (DEMO) saveDemoPortfolio(next) }
  async function addToPortfolio(symbol) {
    if (inPortfolio(symbol)) return
    if (!DEMO) {
      const { error } = await supabase.from('scr_portfolio').upsert({ symbol }, { onConflict: 'user_id,symbol' })
      if (error) return flash(error.message, 'error')
    }
    setPortfolio([...state.portfolio, { symbol, weight: null }])
    flash(`${symbol} added to your stock cart`)
  }
  async function removeFromPortfolio(symbol) {
    if (!DEMO) {
      const { error } = await supabase.from('scr_portfolio').delete().eq('symbol', symbol)
      if (error) return flash(error.message, 'error')
    }
    setPortfolio(state.portfolio.filter((p) => p.symbol !== symbol))
    flash(`${symbol} removed from your stock cart`)
  }
  async function setWeights(changes) {   // { SYMBOL: weight% or null }
    if (!DEMO) {
      for (const [symbol, weight] of Object.entries(changes)) {
        const { error } = await supabase.from('scr_portfolio').update({ weight }).eq('symbol', symbol)
        if (error) return flash(error.message, 'error')
      }
    }
    setPortfolio(state.portfolio.map((p) => (p.symbol in changes ? { ...p, weight: changes[p.symbol] } : p)))
  }
  async function clearPortfolio() {
    if (!DEMO) {
      const { error } = await supabase.from('scr_portfolio').delete().in('symbol', state.portfolio.map((p) => p.symbol))
      if (error) return flash(error.message, 'error')
    }
    setPortfolio([])
    flash('Stock cart emptied')
  }

  const value = { ...state, demo: DEMO, stocks, bySymbol, screen, setScreen, toast, flash, reload: load, saveOverride, savePreset, deletePreset, inPortfolio, addToPortfolio, removeFromPortfolio, setWeights, clearPortfolio }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
