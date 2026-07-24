import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, DoorOpen } from 'lucide-react'
import { StatTile, TopBar } from '../../components/ui'
import { CATEGORY_ICON_PATHS, categorize, categoryLabel } from '../../lib/categories'
import { balancedGroups, sliceTreemap } from '../../lib/treemap'
import { getInventory } from '../../lib/api'
import { useSessionStore } from '../../stores/session'

const POLL_MS = 5000
const STATE_RANK = { pending: 0, ok: 1, warn: 2, bad: 3 }
const WING_COUNT = 2
const WING_HEIGHT = 480

function computeState(item) {
  if (!item.contado_en_sesion) return 'pending'
  if (item.cantidad_actual < 0) return 'bad'
  if (item.stock_sistema > 0) {
    const relDelta = Math.abs(item.cantidad_actual - item.stock_sistema) / item.stock_sistema
    if (relDelta <= 0.08) return 'ok'
    if (relDelta <= 0.25) return 'warn'
    return 'bad'
  }
  return item.cantidad_actual === 0 ? 'ok' : 'warn'
}

function CategoryIcon({ id, size = 15 }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: CATEGORY_ICON_PATHS[id] || CATEGORY_ICON_PATHS.general }}
    />
  )
}

function ArrowEdge({ side }) {
  return (
    <span className={`plan-arrow plan-arrow-${side}`} aria-hidden="true">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none">
        <line x1="4" y1="5" x2="96" y2="5" />
        <path d="M4 5 9 2M4 5 9 8" />
        <path d="M96 5 91 2M96 5 91 8" />
      </svg>
    </span>
  )
}

function Zone({ cat, rect, pulsing, wingWidth }) {
  const narrow = rect.w < 16 && rect.h > rect.w * 1.3
  const tiny = rect.w * rect.h < 45
  const pxW = (wingWidth * rect.w) / 100
  const pxH = (WING_HEIGHT * rect.h) / 100
  const count = cat.items.length
  const columns = Math.max(1, Math.round(Math.sqrt((count * pxW) / Math.max(pxH, 1))))
  const rows = Math.max(1, Math.ceil(count / columns))

  return (
    <div
      className={`plan-zone ${narrow ? 'plan-zone-narrow' : ''} ${pulsing ? 'zone-pulse' : ''}`}
      style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
    >
      {!narrow && !tiny && wingWidth > 0 && (
        <div
          className="plan-zone-ticks"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        >
          {cat.items.map((item) => (
            <span
              key={item.id}
              className={`tick tick-${item.state}`}
              title={`${item.nombre} · ${item.cantidad_actual} ${item.unidad}${item.state === 'pending' ? ' · pendiente' : ''}`}
            />
          ))}
        </div>
      )}
      <div className="plan-zone-label">
        <header>
          <CategoryIcon id={cat.id} size={narrow ? 12 : 14} />
          <h3>{cat.label}</h3>
        </header>
        <span className="plan-zone-count">{cat.counted}/{cat.total}</span>
      </div>
    </div>
  )
}

function Wing({ categories, pulsingCat }) {
  const wingRef = useRef(null)
  const [wingWidth, setWingWidth] = useState(0)

  useEffect(() => {
    const node = wingRef.current
    if (!node || !window.ResizeObserver) return undefined
    const observer = new ResizeObserver((entries) => {
      setWingWidth(entries[0].contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const rects = useMemo(() => {
    const items = categories.map((cat) => ({ id: cat.id, value: Math.max(cat.total, 1) }))
    return sliceTreemap(items, 0, 0, 100, 100)
  }, [categories])
  const rectById = useMemo(() => Object.fromEntries(rects.map((rect) => [rect.id, rect])), [rects])

  return (
    <div className="plan-wing" ref={wingRef}>
      <ArrowEdge side="top" />
      <ArrowEdge side="bottom" />
      <span className="plan-entrance"><DoorOpen size={12} /></span>
      {categories.map((cat) => (
        <Zone key={cat.id} cat={cat} rect={rectById[cat.id]} pulsing={cat.id === pulsingCat} wingWidth={wingWidth} />
      ))}
    </div>
  )
}

export default function MapaBodega({ onBack, onProfile }) {
  const warehouse = useSessionStore((state) => state.bodega)
  const bodegaLabel = useSessionStore((state) => state.bodegaLabel)
  const sessionId = useSessionStore((state) => state.sessionId)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [pulsingCat, setPulsingCat] = useState(null)
  const previousStates = useRef(new Map())
  const pulseTimeout = useRef(null)

  useEffect(() => {
    let active = true
    const load = () => {
      getInventory({ warehouse, sessionId })
        .then((response) => {
          if (!active) return
          const withState = response.items.map((item) => ({
            ...item,
            category: categorize(item.nombre),
            state: computeState(item),
          }))
          let changedCat = null
          withState.forEach((item) => {
            const previous = previousStates.current.get(item.id)
            if (previous && previous !== item.state) changedCat = item.category
            previousStates.current.set(item.id, item.state)
          })
          if (changedCat) {
            setPulsingCat(changedCat)
            window.clearTimeout(pulseTimeout.current)
            pulseTimeout.current = window.setTimeout(() => setPulsingCat(null), 1500)
          }
          setItems(withState)
          setError('')
        })
        .catch(() => { if (active) setError('No pudimos cargar el inventario en vivo de esta bodega.') })
    }
    load()
    const interval = window.setInterval(load, POLL_MS)
    return () => { active = false; window.clearInterval(interval); window.clearTimeout(pulseTimeout.current) }
  }, [warehouse, sessionId])

  const categories = useMemo(() => {
    const byCategory = new Map()
    items.forEach((item) => {
      if (!byCategory.has(item.category)) byCategory.set(item.category, [])
      byCategory.get(item.category).push(item)
    })
    return Array.from(byCategory.entries())
      .map(([id, catItems]) => ({
        id,
        label: categoryLabel(id),
        items: catItems,
        total: catItems.length,
        counted: catItems.filter((item) => item.state !== 'pending').length,
        worst: catItems.reduce((acc, item) => (STATE_RANK[item.state] > STATE_RANK[acc] ? item.state : acc), 'pending'),
      }))
      .sort((a, b) => b.total - a.total)
  }, [items])

  const wings = useMemo(() => balancedGroups(categories, WING_COUNT), [categories])

  const totals = useMemo(() => ({
    total: items.length,
    counted: items.filter((item) => item.state !== 'pending').length,
    flagged: items.filter((item) => item.state === 'warn' || item.state === 'bad').length,
  }), [items])
  const pct = totals.total ? Math.round((totals.counted / totals.total) * 100) : 0

  return (
    <main className="mapa-screen">
      <TopBar title={`Mapa · ${bodegaLabel}`} onBack={onBack} backLabel="Bodegas" onProfile={onProfile} />
      <div className="mapa-layout">
        <div className="mapa-stats">
          <StatTile value={`${pct}%`} label="Avance del conteo" />
          <StatTile value={`${totals.counted} / ${totals.total || '—'}`} label="Referencias contadas" />
          <StatTile value={totals.total - totals.counted || 0} label="Pendientes" />
          <StatTile icon={AlertTriangle} value={totals.flagged} label="Requieren revisión" />
        </div>

        {error && <p className="mapa-error">{error}</p>}

        <div className="plan-board" aria-label="Mapa esquemático de la bodega, por zonas">
          {wings.map((wing, index) => (
            <Wing key={index} categories={wing} pulsingCat={pulsingCat} />
          ))}
        </div>

        <div className="legend-row">
          <span><span className="dot"></span>Pendiente</span>
          <span><span className="dot state-ok"></span>Coincide con el sistema</span>
          <span><span className="dot state-warn"></span>Diferencia leve — revisar</span>
          <span><span className="dot state-bad"></span>Anomalía</span>
        </div>
      </div>
    </main>
  )
}
