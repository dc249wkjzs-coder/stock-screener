import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Login({ mode: initialMode = 'signin', onDone }) {
  const [mode, setMode] = useState(initialMode) // signin | forgot | setpw
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setMsg({ ok: true, text: 'Check your email for a link to set a new password.' })
      } else {
        if (pw.length < 8) throw new Error('Use at least 8 characters.')
        const { error } = await supabase.auth.updateUser({ password: pw })
        if (error) throw error
        onDone?.()
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-side px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 grid gap-4">
        <div>
          <div className="text-xl font-semibold">Screener</div>
          <div className="text-muted text-[13px] mt-1">
            {mode === 'signin' ? 'Sign in with your Life Ledger account.' : mode === 'forgot' ? 'We will email you a reset link.' : 'Choose a new password.'}
          </div>
        </div>
        {mode !== 'setpw' && (
          <label className="grid gap-1">
            <span className="text-[12.5px] font-semibold text-muted">Email</span>
            <input id="login-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {mode !== 'forgot' && (
          <label className="grid gap-1">
            <span className="text-[12.5px] font-semibold text-muted">{mode === 'setpw' ? 'New password' : 'Password'}</span>
            <input id="login-pw" className="input" type="password" autoComplete={mode === 'setpw' ? 'new-password' : 'current-password'} required value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
        )}
        {msg && <div className={`text-[13px] ${msg.ok ? 'text-gain' : 'text-loss'}`}>{msg.text}</div>}
        <button className="btn btn-primary justify-center py-2.5" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Send reset link' : 'Save password'}
        </button>
        {mode === 'signin' && <button type="button" className="text-[13px] text-muted hover:text-fg" onClick={() => setMode('forgot')}>Forgot password?</button>}
        {mode === 'forgot' && <button type="button" className="text-[13px] text-muted hover:text-fg" onClick={() => setMode('signin')}>Back to sign in</button>}
      </form>
    </div>
  )
}
