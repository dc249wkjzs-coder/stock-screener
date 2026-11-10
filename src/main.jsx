import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { DEMO, supabase } from './lib/supabase'
import { DataProvider } from './lib/data'
import Layout from './components/Layout'
import Login from './pages/Login'
import Screener from './pages/Screener'
import Stock from './pages/Stock'
import Rules from './pages/Rules'
import Status from './pages/Status'
import Learn from './pages/Learn'

const arrivedToSetPassword = /type=(invite|recovery)/.test(window.location.hash)

function App() {
  const [session, setSession] = useState(undefined)
  const [setPw, setSetPw] = useState(arrivedToSetPassword)

  useEffect(() => {
    if (DEMO) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setSetPw(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!DEMO) {
    if (session === undefined) return null
    if (!session) return <Login />
    if (setPw) return <Login mode="setpw" onDone={() => { setSetPw(false); history.replaceState(null, '', '/') }} />
  }

  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Screener />} />
            <Route path="stock/:symbol" element={<Stock />} />
            <Route path="rules" element={<Rules />} />
            <Route path="status" element={<Status />} />
            <Route path="learn" element={<Learn />} />
            <Route path="*" element={<Screener />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
