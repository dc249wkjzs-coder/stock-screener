import { Link } from 'react-router-dom'
import { TERMS } from '@/lib/glossary'

// A label that links to its plain-language definition on the Definitions page.
// Usage: <Term id="peg">PEG</Term>, or <Term id="peg" /> to show the term's own name.
export default function Term({ id, children, className = '' }) {
  const t = TERMS[id]
  if (!t) return children ?? null
  return (
    <Link to={`/learn#${id}`} onClick={(e) => e.stopPropagation()} title={`${t.term}: ${t.what}`}
      className={`underline decoration-dotted decoration-faint underline-offset-[3px] hover:decoration-accent hover:text-accent ${className}`}>
      {children ?? t.term}
    </Link>
  )
}

// A small "?" that links to a definition, for places where the label itself must stay clickable (sortable headers).
export function Info({ id }) {
  if (!TERMS[id]) return null
  return (
    <Link to={`/learn#${id}`} onClick={(e) => e.stopPropagation()} title={`What is ${TERMS[id].term}?`}
      className="ml-1 inline-grid place-items-center w-3.5 h-3.5 rounded-full border border-faint text-[9px] leading-none text-faint hover:border-accent hover:text-accent align-middle normal-case">?</Link>
  )
}
