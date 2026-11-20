import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import PortfolioButton from '@/components/PortfolioButton'
import PlanPanel from '@/components/PlanPanel'
import FibPanel from '@/components/FibPanel'
import Term from '@/components/Term'
import { DEMO, supabase } from '@/lib/supabase'
import { Panel, Badge } from '@/components/ui'
import { fp, fn, usd, cap } from '@/components/pillarUi'
import { date as fdate } from '@/lib/format'

// An ETF's page: what it costs, what it holds (by sector and country), and the same chart, buy levels and
// entry timing as a stock. No moat, fair value or P/E: a basket of hundreds of companies has no single set of earnings.
export default function EtfView({ s }) {
  const [detail, setDetail] = useState(null)
  useEffect(() => {
    if (DEMO) { setDetail({ prices: s.pricesSample || [], info: null }); return }
    Promise.all([
      supabase.from('scr_prices').select('dates,closes').eq('symbol', s.symbol).maybeSingle(),
      supabase.from('scr_etfs').select('description,website').eq('symbol', s.symbol).maybeSingle(),
    ]).then(([p, i]) => setDetail({
      prices: p.data ? p.data.dates.map((dt, k) => ({ date: dt, close: p.data.closes[k] })) : [],
      info: i.data || null,
    }))
  }, [s.symbol]) // eslint-disable-line

  const er = s.expenseRatio
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/etfs" className="text-[13px] text-muted hover:text-fg inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> ETF finder</Link>
          <h1 className="text-2xl font-semibold tracking-tight flex flex-wrap items-center gap-2">
            {s.symbol} <span className="text-muted font-normal text-lg">{s.name}</span>
            <Badge tone="accent">ETF</Badge>
          </h1>
          <div className="text-[13px] text-muted mt-1">
            <Term id="etf-category">{s.category}</Term>{s.category === 'Sector' && s.topSector ? ` · ${s.topSector}` : ''} · {s.issuer || 'fund company n/a'} · <Term id="fund-size">{cap(s.aum)}</Term> in the fund
          </div>
        </div>
        <div className="text-right">
          <div className="num text-2xl font-semibold">{usd(s.price)}</div>
          <div className="text-[12.5px] text-muted">{s.priceDate ? `close ${fdate(s.priceDate)}` : 'price history loading'}</div>
          <div className="mt-2 flex flex-wrap justify-end gap-2 items-center"><PortfolioButton symbol={s.symbol} full /></div>
        </div>
      </div>

      {s.leveraged && (
        <div className="rounded-xl border border-loss/40 bg-loss-soft px-4 py-3 text-[13.5px]">
          <b>Leveraged or inverse fund.</b> It aims to multiply (or reverse) one day's move of an index. Held for weeks or months it can lose money even when the index ends where it started. <Term id="leveraged-etf">How this works</Term>
        </div>
      )}

      <div id="plan" className="scroll-mt-28"><PlanPanel s={s} /></div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="The fund" subtitle="From the fund company's figures, refreshed weekly.">
          <table className="w-full text-[13.5px]">
            <tbody>
              {[
                [<Term key="t" id="expense-ratio">Cost per year</Term>, er == null ? '—' : <>{fp(er, 2)} <span className="text-muted">· ${(er * 10000).toFixed(er * 10000 < 10 ? 2 : 0)} per $10,000</span></>],
                [<Term key="t" id="fund-size">Fund size</Term>, cap(s.aum)],
                ['Companies or bonds held', s.holdingsCount ? s.holdingsCount.toLocaleString() : '—'],
                [<Term key="t" id="dividend-yield">Dividend yield</Term>, s.dividendYield ? fp(s.dividendYield, 2) : 'None'],
                [<Term key="t" id="beta">Beta</Term>, fn(s.beta, 2)],
                ['Share in US companies', s.usShare == null ? '—' : fp(s.usShare, 0)],
                ['Asset class', s.assetClass || '—'],
                ['Started', s.inception ? fdate(s.inception) : '—'],
                ['Fund company', s.issuer || '—'],
              ].map(([k, v], i) => (
                <tr key={i} className="border-t border-line/60 first:border-0"><td className="py-1.5 text-muted pr-3">{k}</td><td className="py-1.5 text-right num">{v}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-line text-center">
            {[['1 month', s.chg1m], ['3 months', s.chg3m], ['6 months', s.chg6m], ['1 year', s.chg1y]].map(([k, v]) => (
              <div key={k}><div className="text-[11.5px] text-muted">{k}</div><div className={`num font-semibold ${v > 0 ? 'text-gain' : v < 0 ? 'text-loss' : ''}`}>{fp(v, 1)}</div></div>
            ))}
          </div>
          <div className="text-[12px] text-faint mt-2">Price change only (dividends not included). <Term id="off-high">Below 52-week high</Term>: {fp(s.offHigh == null ? null : -s.offHigh, 1)}.</div>
          {detail?.info?.description && <p className="text-[13px] text-muted mt-4 leading-relaxed line-clamp-6">{detail.info.description}</p>}
          {detail?.info?.website && <a href={detail.info.website} target="_blank" rel="noreferrer" className="text-accent text-[13px] inline-flex items-center gap-1 mt-2">Fund website <ExternalLink size={12} /></a>}
        </Panel>

        <div className="grid gap-5 content-start">
          <Mix title="By sector" rows={(s.sectors || []).map((x) => ({ name: x.s, w: x.w }))}
            empty={s.category === 'Bonds' ? 'A bond fund: no stock sectors.' : 'The fund company gives no sector split.'}
            note={s.category === 'Bonds' ? 'For bond funds these are bond types, not company sectors.' : null} />
          <Mix title="By country" rows={(s.countries || []).map((x) => ({ name: x.c, w: x.w }))} empty="No country split given." />
          <p className="text-[12px] text-faint px-1">The list of individual holdings isn't included in the data plan, so the site can't show which companies the fund owns or how much it overlaps with your stocks.</p>
        </div>
      </div>

      <FibPanel s={s} prices={detail?.prices} />
      <p className="text-[12.5px] text-faint">Data from Financial Modeling Prep. Not investment advice.</p>
    </div>
  )
}

function Mix({ title, rows, empty, note }) {
  const top = rows.slice(0, 10)
  return (
    <Panel title={title}>
      {top.length ? (
        <div className="grid gap-2">
          {top.map((x) => (
            <div key={x.name}>
              <div className="flex justify-between text-[13px]"><span>{x.name}</span><span className="num">{fp(x.w, 1)}</span></div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, x.w * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      ) : <p className="text-[13px] text-muted">{empty}</p>}
      {note && <p className="text-[12px] text-faint mt-3">{note}</p>}
    </Panel>
  )
}
