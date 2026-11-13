import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

// Light / Dark / Auto (follows the device). Saved in this browser; index.html applies it before the page draws.
const KEY = 'screener.theme'
const MODES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'auto', label: 'Auto', icon: Monitor },
]
const read = () => { try { return localStorage.getItem(KEY) || 'auto' } catch { return 'auto' } }
function apply(mode) {
  const el = document.documentElement
  if (mode === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', mode)
}

export function useTheme() {
  const [mode, setMode] = useState(read)
  useEffect(() => {
    apply(mode)
    try { localStorage.setItem(KEY, mode) } catch { /* private window: this visit only */ }
    window.dispatchEvent(new CustomEvent('screener-theme', { detail: mode }))
  }, [mode])
  // Keep the two switches (sidebar and phone bar) in step.
  useEffect(() => {
    const on = (e) => setMode((m) => (m === e.detail ? m : e.detail))
    window.addEventListener('screener-theme', on)
    return () => window.removeEventListener('screener-theme', on)
  }, [])
  return [mode, setMode]
}

// Segmented control for the sidebar.
export default function ThemeSwitch() {
  const [mode, setMode] = useTheme()
  return (
    <div className="grid grid-cols-3 rounded-full bg-side-active p-0.5" role="radiogroup" aria-label="Appearance">
      {MODES.map((m) => (
        <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} title={m.id === 'auto' ? 'Follow this device' : `${m.label} mode`}
          className={`flex items-center justify-center gap-1 rounded-full py-1 text-[12px] ${mode === m.id ? 'bg-surface text-fg font-medium shadow-sm' : 'text-muted hover:text-fg'}`}>
          <m.icon size={13} /> {m.label}
        </button>
      ))}
    </div>
  )
}

// One button for the phone bar: each tap moves Light → Dark → Auto.
export function ThemeButton() {
  const [mode, setMode] = useTheme()
  const i = MODES.findIndex((m) => m.id === mode)
  const M = MODES[i] || MODES[2]
  const next = MODES[(i + 1) % MODES.length]
  return (
    <button onClick={() => setMode(next.id)} title={`Appearance: ${M.label}. Tap for ${next.label}.`} aria-label={`Appearance: ${M.label}`}
      className="w-8 h-8 grid place-items-center rounded-full text-muted hover:text-fg hover:bg-side-active">
      <M.icon size={16} />
    </button>
  )
}
