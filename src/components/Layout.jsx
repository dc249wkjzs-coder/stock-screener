import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { SlidersHorizontal, List, Search, Activity, LogOut, BookOpen } from 'lucide-react'
import { useData } from '@/lib/data'
import { ago } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export const NAV = [
  { to: '/', label: 'Build your screen', icon: SlidersHorizontal },
  { to: '/results', label: 'Results', icon: List },
  { to: '/lookup', label: 'Look up a stock', icon: Search },
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
      <aside className="hidden lg:flex lg:w-60 shrink-0 flex-col bg-side text-side-fg sticky top-0 h-screen">
        <div className="px-5 pt-6 pb-5 flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="text-white font-semibold tracking-tight">Screener</div>
            <div className="text-[11.5px] text-side-fg/70">Choose · Screen · Assess</div>
          </div>
        </div>
        <nav className="px-3 grid gap-0.5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium ${isActive ? 'bg-side-active text-white' : 'hover:bg-side-active/60 hover:text-white'}`}>
              {({ isActive }) => (<><n.icon size={16} className={isActive ? 'text-[var(--c-metals)]' : ''} />{n.label}</>)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-5 pb-5 text-[12px] text-side-fg/70 grid gap-2">
          <div>Scores updated {ago(d.lastScored)}</div>
          {!d.demo && <button className="flex items-center gap-2 hover:text-white" onClick={() => supabase.auth.signOut()}><LogOut size={14} /> Sign out</button>}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="lg:hidden bg-side text-side-fg" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
            <Logo small />
            <span className="text-white font-semibold">Screener</span>
            {!d.demo && <button className="ml-auto text-[12px] flex items-center gap-1" onClick={() => supabase.auth.signOut()}><LogOut size={13} /> Sign out</button>}
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium ${isActive ? 'bg-side-active text-white' : ''}`}>{n.label}</NavLink>
            ))}
          </nav>
        </div>

        {d.demo && <div className="bg-accent-soft text-accent text-[13px] font-medium px-4 py-2 text-center">Demo mode: sample stocks only.</div>}

        <main className="mx-auto max-w-[1440px] py-6 lg:py-8 px-4 lg:px-6">
          {title && <h1 className="text-2xl font-semibold tracking-tight mb-6">{title}</h1>}
          {d.error && <div className="card bg-loss-soft text-loss px-4 py-3 mb-6 text-[13.5px]">Couldn't load the screener: {d.error}</div>}
          {d.loading ? <div className="text-muted py-20 text-center">Loading…</div> : <Outlet />}
        </main>
      </div>

      {d.toast && (
        <div className="fixed z-50 left-1/2 -translate-x-1/2" style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          <div className={`rounded-lg px-4 py-2.5 text-[13.5px] font-medium shadow-lg ${d.toast.kind === 'error' ? 'bg-loss text-white' : d.toast.kind === 'warn' ? 'bg-warn text-white' : 'bg-fg text-bg'}`}>{d.toast.msg}</div>
        </div>
      )}
    </div>
  )
}

function Logo({ small }) {
  const s = small ? 22 : 30
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1f2738" />
      <path d="M8 10h16l-6 7v6l-4 2v-8z" fill="#D9AE5A" />
    </svg>
  )
}
