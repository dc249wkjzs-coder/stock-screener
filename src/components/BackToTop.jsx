import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

// Phone only (hidden from the lg breakpoint up, where the desktop layout is used): a round button in the bottom-right
// corner that appears once you've scrolled down about a screen and takes you back to the top.
// lift: px to add above the bottom edge, for pages with their own fixed bottom bar (Stock finder).
export default function BackToTop({ lift = 0 }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > Math.max(400, window.innerHeight * 0.8))
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const toTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }
  return (
    <button type="button" onClick={toTop} aria-label="Back to top" tabIndex={show ? 0 : -1}
      className={`lg:hidden fixed z-40 right-4 w-11 h-11 grid place-items-center rounded-full glass text-accent border border-line shadow-lg transition-opacity duration-200 ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={{ bottom: `calc(${20 + lift}px + env(safe-area-inset-bottom, 0px))` }}>
      <ArrowUp size={20} strokeWidth={2.2} />
    </button>
  )
}
