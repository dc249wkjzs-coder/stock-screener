import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { SlidersHorizontal, List, Search, Activity, LogOut, BookOpen, Briefcase } from 'lucide-react'
import { useData } from '@/lib/data'
import { ago } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import StockCart from '@/components/StockCart'
import ThemeSwitch, { ThemeButton } from '@/components/ThemeSwitch'

// The three main pages are steps in order; the rest are reference pages you can open any time.
export const STEPS = [
  { to: '/', label: 'Stock finder', hint: 'Choose what you want', icon: SlidersHorizontal },
  { to: '/results', label: 'Results', hint: 'See the matches, add picks', icon: List },
  { to: '/portfolio', label: 'My portfolio', hint: 'Score your picks', icon: Briefcase, count: true },
]
export const REFERENCE = [
  { to: '/lookup', label: 'Look up a stock', icon: Search },
  { to: '/learn', label: 'Definitions', icon: BookOpen },
  { to: '/status', label: 'Data status', icon: Activity },
]
export const NAV = [...STEPS, ...REFERENCE]

export default function Layout() {
  const d = useData()
  const loc = useLocation()
  const page = NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))
  const title = ['/learn', '/status'].includes(loc.pathname) ? page?.label : null

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden lg:flex lg:w-60 shrink-0 flex-col glass text-side-fg sticky top-0 h-screen border-r border-line">
        <div className="px-5 pt-6 pb-5 flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="font-semibold tracking-tight text-[15px]">Screener</div>
            <div className="text-[11.5px] text-muted">Choose · Screen · Assess</div>
          </div>
        </div>
        <nav className="px-3">
          <div className="px-3 pb-1.5 text-[11px] font-semibold text-muted">Build a portfolio</div>
          <ol className="relative grid gap-0.5">
            {/* the line joining the three step numbers */}
            <span aria-hidden className="absolute left-[23px] top-5 bottom-5 w-px bg-accent/30" />
            {STEPS.map((n, i) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.to === '/'}
                  className={({ isActive }) => `relative flex items-center gap-3 rounded-[10px] px-3 py-2 ${isActive ? 'bg-side-active' : 'hover:bg-side-active/60'}`}>
                  {({ isActive }) => (<>
                    <span className={`relative z-10 w-[22px] h-[22px] shrink-0 grid place-items-center rounded-full text-[12px] font-semibold num ${isActive ? 'bg-accent text-accent-fg' : 'bg-surface text-accent ring-1 ring-accent/40'}`}>{i + 1}</span>
                    <span className="min-w-0">
                      <span className={`block text-[13.5px] leading-tight ${isActive ? 'font-semibold' : ''}`}>{n.label}</span>
                      <span className="block text-[11.5px] text-muted leading-tight mt-0.5">{n.hint}</span>
                    </span>
                    {n.count && d.portfolio.length > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] text-accent-fg num font-semibold">{d.portfolio.length}</span>}
                  </>)}
                </NavLink>
              </li>
            ))}
          </ol>
          <div className="mx-3 my-3 border-t border-line" />
          <div className="px-3 pb-1.5 text-[11px] font-semibold text-muted">Reference</div>
          <div className="grid gap-0.5">
            {REFERENCE.map((n) => (
              <NavLink key={n.to} to={n.to}
                className={({ isActive }) => `flex items-center gap-3 rounded-[10px] px-3 py-[7px] text-[13.5px] ${isActive ? 'bg-side-active font-semibold' : 'text-muted hover:text-fg hover:bg-side-active/60'}`}>
                {({ isActive }) => (<><n.icon size={16} strokeWidth={1.8} className={isActive ? 'text-accent' : ''} />{n.label}</>)}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="mt-auto px-5 pb-5 text-[12px] text-muted grid gap-2">
          <ThemeSwitch />
          <div>Scores updated {ago(d.lastScored)}</div>
          {!d.demo && <button className="flex items-center gap-2 hover:text-fg" onClick={() => supabase.auth.signOut()}><LogOut size={14} /> Sign out</button>}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="lg:hidden glass text-side-fg sticky top-0 z-40 border-b border-line" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
            <Logo small />
            <span className="font-semibold">Screener</span>
            <div className="ml-auto flex items-center gap-2">
              <ThemeButton />
              <StockCart />
              {!d.demo && <button className="text-[12px] text-muted flex items-center gap-1" onClick={() => supabase.auth.signOut()}><LogOut size={13} /> Sign out</button>}
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2">
            {STEPS.map((n, i) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `shrink-0 inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1 text-[13px] ${isActive ? 'bg-fg text-bg font-medium' : 'text-fg'}`}>
                {({ isActive }) => (<><span className={`w-5 h-5 grid place-items-center rounded-full text-[11px] font-semibold num ${isActive ? 'bg-accent text-accent-fg' : 'text-accent ring-1 ring-accent/40'}`}>{i + 1}</span>{n.label}{n.count && d.portfolio.length > 0 ? ` (${d.portfolio.length})` : ''}</>)}
              </NavLink>
            ))}
            <span aria-hidden className="shrink-0 mx-1 h-5 w-px bg-line" />
            {REFERENCE.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-[13px] ${isActive ? 'bg-fg text-bg font-medium' : 'text-muted'}`}>{n.label}</NavLink>
            ))}
          </nav>
        </div>

        {d.demo && <div className="bg-accent-soft text-accent text-[13px] font-medium px-4 py-2 text-center">Demo mode: sample stocks only.</div>}

        <div className="hidden lg:flex sticky top-0 z-40 justify-end px-6 pt-4 pointer-events-none">
          <div className="pointer-events-auto"><StockCart /></div>
        </div>
        <main className="mx-auto max-w-[1440px] py-6 lg:pt-2 lg:pb-8 px-4 lg:px-6">
          {title && <h1 className="text-2xl font-semibold tracking-tight mb-6">{title}</h1>}
          {d.error && <div className="card bg-loss-soft text-loss px-4 py-3 mb-6 text-[13.5px]">Couldn't load the screener: {d.error}</div>}
          {d.loading ? <div className="text-muted py-20 text-center">Loading…</div> : <Outlet />}
        </main>
      </div>

      {d.toast && (
        <div className="fixed z-50 left-1/2 -translate-x-1/2" style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          <div className={`rounded-full px-5 py-2.5 text-[13.5px] font-medium shadow-lg ${d.toast.kind === 'error' ? 'bg-loss text-white' : d.toast.kind === 'warn' ? 'bg-warn text-white' : 'bg-fg text-bg'}`}>{d.toast.msg}</div>
        </div>
      )}
    </div>
  )
}

function Logo({ small }) {
  const s = small ? 22 : 30
  const id = small ? 'logo-g-sm' : 'logo-g'
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#409CFF" /><stop offset="1" stopColor="#0071E3" /></linearGradient></defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <path d="M8 10h16l-6 7v6l-4 2v-8z" fill="#fff" />
    </svg>
  )
}
