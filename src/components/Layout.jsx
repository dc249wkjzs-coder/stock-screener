import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { SlidersHorizontal, List, Search, Activity, LogOut, BookOpen, Briefcase } from 'lucide-react'
import { useData } from '@/lib/data'
import { ago } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import StockCart from '@/components/StockCart'
import ThemeSwitch, { ThemeButton } from '@/components/ThemeSwitch'

export const NAV = [
  { to: '/', label: 'Stock finder', icon: SlidersHorizontal },
  { to: '/results', label: 'Results', icon: List },
  { to: '/lookup', label: 'Look up a stock', icon: Search },
  { to: '/portfolio', label: 'My portfolio', icon: Briefcase, count: true },
  { to: '/learn', label: 'Definitions', icon: BookOpen },
  { to: '/status', label: 'Data status', icon: Activity },
]

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
        <nav className="px-3 grid gap-0.5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex items-center gap-3 rounded-[10px] px-3 py-[7px] text-[13.5px] ${isActive ? 'bg-side-active font-semibold' : 'font-normal hover:bg-side-active/60'}`}>
              {({ isActive }) => (<><n.icon size={17} strokeWidth={1.8} className={isActive ? 'text-accent' : 'text-accent/80'} />{n.label}{n.count && d.portfolio.length > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] text-accent-fg num font-semibold">{d.portfolio.length}</span>}</>)}
            </NavLink>
          ))}
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
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-[13px] ${isActive ? 'bg-fg text-bg font-medium' : 'text-muted'}`}>{n.label}{n.count && d.portfolio.length > 0 ? ` (${d.portfolio.length})` : ''}</NavLink>
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
