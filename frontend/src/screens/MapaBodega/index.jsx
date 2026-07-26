import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  MapPinned,
  PackageSearch,
  Route,
  Search,
  Warehouse,
} from 'lucide-react'
import WarehouseVoiceAgent from '../../components/WarehouseVoiceAgent'
import { Button, CategoryIcon, StatTile, TopBar } from '../../components/ui'
import { categorize, categoryLabel } from '../../lib/categories'
import { getInventory } from '../../lib/api'
import {
  computeInventoryState,
  isInventoryReviewPending,
  summarizeInventoryStates,
  zoneVisualState,
} from '../../lib/inventoryStatus'
import { getWarehouseReviewItems } from '../../lib/warehouseAgent'
import { useSessionStore } from '../../stores/session'

const POLL_MS = 5000
const UNIT_LABELS = {
  Kilogram: 'kg',
  Liter: 'L',
  Unidad: 'unid.',
  Portion: 'porc.',
}
const STATE_LABELS = {
  pending: 'Pendiente',
  ok: 'Coincide',
  warn: 'Revisar',
  bad: 'Anomalía',
}
const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'counted', label: 'Contados' },
  { id: 'review_pending', label: 'Por revisar' },
  { id: 'review', label: 'Diferencias' },
  { id: 'system', label: 'Saldos del sistema' },
]
const ZONE_VISUAL_LABELS = {
  pending: 'Pendiente',
  active: 'En conteo',
  ok: 'Completa',
  warn: 'Revisar',
  bad: 'Anomalía',
}
const WAREHOUSE_ZONE_LAYOUT = {
  frutas_verduras: { column: '1 / span 3', row: '1 / span 4', shortLabel: 'Frutas y verduras' },
  lacteos: { column: '4 / span 3', row: '1 / span 2', shortLabel: 'Lácteos y huevos' },
  carnes: { column: '7 / span 3', row: '1 / span 2', shortLabel: 'Carnes y aves' },
  bebidas: { column: '10 / span 3', row: '1 / span 4', shortLabel: 'Bebidas' },
  granos: { column: '4 / span 4', row: '3 / span 5', shortLabel: 'Granos y abarrotes' },
  panaderia: { column: '1 / span 3', row: '5 / span 3', shortLabel: 'Panadería' },
  general: { column: '8 / span 2', row: '3 / span 3', shortLabel: 'Otros' },
  limpieza: { column: '10 / span 3', row: '5 / span 2', shortLabel: 'Limpieza' },
  desechables: { column: '8 / span 2', row: '6 / span 2', shortLabel: 'Desechables' },
}

function formatAmount (value) {
  return Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

function matchesFilter (item, filter) {
  if (filter === 'pending') return item.state === 'pending'
  if (filter === 'counted') return item.state !== 'pending'
  if (filter === 'review_pending') return isInventoryReviewPending(item)
  if (filter === 'review') return item.state === 'warn' || item.state === 'bad'
  if (filter === 'system') return Number(item.stock_sistema) < 0
  return true
}

function getRackStates (category) {
  const rackCount = Math.min(10, Math.max(5, Math.ceil(category.total / 14)))
  if (!category.items.length) return Array(rackCount).fill('pending')

  const ordered = [...category.items].sort((a, b) => {
    const priority = { bad: 0, warn: 1, ok: 2, pending: 3 }
    return priority[a.state] - priority[b.state]
  })
  const states = Array.from({ length: rackCount }, (_, index) => {
    const itemIndex = Math.min(
      ordered.length - 1,
      Math.floor(((index + 0.5) / rackCount) * ordered.length)
    )
    return ordered[itemIndex].state
  })

  const representedPhysicalStates = ['bad', 'warn', 'ok']
    .filter((state) => category[state] > 0)
  representedPhysicalStates.forEach((state, index) => {
    if (!states.includes(state)) states[index] = state
  })
  return states
}

function WarehouseZone ({ category, selected, onSelect }) {
  const layout = WAREHOUSE_ZONE_LAYOUT[category.id]
  if (!layout) return null
  const progress = category.total
    ? Math.round((category.counted / category.total) * 100)
    : 0
  const visualState = zoneVisualState(category)
  const rackStates = getRackStates(category)

  return (
    <button
      type='button'
      className={`mapa-floor-zone is-${visualState} ${selected ? 'is-selected' : ''}`}
      style={{ gridColumn: layout.column, gridRow: layout.row }}
      onClick={() => onSelect(category.id)}
      aria-pressed={selected}
      aria-label={`${category.label}: ${category.counted} de ${category.total} referencias contadas`}
    >
      <span className='mapa-floor-zone-head'>
        <span className='mapa-floor-zone-icon'>
          <CategoryIcon id={category.id} size={16} />
        </span>
        <span>
          <strong>{layout.shortLabel}</strong>
          <small>{category.total} referencias</small>
        </span>
        <em>{progress}%</em>
      </span>
      <span className='mapa-rack-grid' aria-hidden='true'>
        {rackStates.map((state, index) => (
          <i className={`rack-${state}`} key={`${category.id}-${index}`} />
        ))}
      </span>
      <span className='mapa-floor-zone-foot'>
        <span>{ZONE_VISUAL_LABELS[visualState]}</span>
        <b>{category.pending} pendientes</b>
      </span>
    </button>
  )
}

function ZoneCard ({ category, active, onSelect }) {
  const progress = category.total
    ? Math.round((category.counted / category.total) * 100)
    : 0

  return (
    <button
      type='button'
      className={`mapa-zone-card ${active ? 'active' : ''}`}
      onClick={() => onSelect(category.id)}
      aria-pressed={active}
    >
      <span className='mapa-zone-icon'>
        {category.id === 'all'
          ? <Boxes size={20} />
          : <CategoryIcon id={category.id} size={20} />}
      </span>
      <span className='mapa-zone-copy'>
        <span className='mapa-zone-title'>
          <strong>{category.label}</strong>
          <em>{progress}%</em>
        </span>
        <span className='mapa-zone-progress' aria-label={`${progress}% contado`}>
          <i style={{ width: `${progress}%` }} />
        </span>
        <span className='mapa-zone-meta'>
          <span>{category.counted}/{category.total} contadas</span>
          <span>{category.pending} pendientes</span>
          {category.issues > 0 && (
            <span className='has-issue'>{category.issues} diferencias</span>
          )}
          {category.reviewPending > 0 && (
            <span className='has-issue'>{category.reviewPending} por revisar</span>
          )}
          {category.systemIssues > 0 && (
            <span className='system-issue'>{category.systemIssues} saldos del sistema</span>
          )}
        </span>
      </span>
      <ArrowRight size={18} aria-hidden='true' />
    </button>
  )
}

export default function MapaBodega ({ onBack, onProfile, onStart, onClose }) {
  const warehouse = useSessionStore((state) => state.bodega)
  const bodegaLabel = useSessionStore((state) => state.bodegaLabel)
  const sessionId = useSessionStore((state) => state.sessionId)
  const records = useSessionStore((state) => state.records)
  const [serverItems, setServerItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [pulseCategory, setPulseCategory] = useState(null)
  const previousStates = useRef(new Map())
  const pulseTimeout = useRef(null)
  const inventoryExplorerRef = useRef(null)

  useEffect(() => {
    let active = true
    const load = ({ initial = false } = {}) => {
      if (initial) setLoading(true)
      getInventory({ warehouse, sessionId })
        .then((response) => {
          if (!active) return
          setServerItems(response.items)
          setUpdatedAt(new Date())
          setError('')
        })
        .catch(() => {
          if (active) setError('No pudimos actualizar el inventario de esta bodega.')
        })
        .finally(() => {
          if (active && initial) setLoading(false)
        })
    }

    load({ initial: true })
    const interval = window.setInterval(load, POLL_MS)
    return () => {
      active = false
      window.clearInterval(interval)
      window.clearTimeout(pulseTimeout.current)
    }
  }, [warehouse, sessionId])

  const latestByArticle = useMemo(() => {
    const latest = new Map()
    records.forEach((record) => {
      if (record.articleId == null || latest.has(record.articleId)) return
      latest.set(record.articleId, record)
    })
    return latest
  }, [records])

  const items = useMemo(() => serverItems.map((item) => {
    const local = latestByArticle.get(item.id)
    const counted = Boolean(local) || item.contado_en_sesion
    const current = local ? Number(local.quantity) : item.cantidad_actual
    const merged = {
      ...item,
      cantidad_actual: current,
      contado_en_sesion: counted,
      corregido: Boolean(local?.reviewResolved || item.corregido),
      reviewResolved: Boolean(local?.reviewResolved || item.corregido),
      category: categorize(item.nombre),
    }
    return { ...merged, state: computeInventoryState(merged) }
  }), [latestByArticle, serverItems])

  useEffect(() => {
    let changed = null
    items.forEach((item) => {
      const previous = previousStates.current.get(item.id)
      if (previous && previous !== item.state) changed = item.category
      previousStates.current.set(item.id, item.state)
    })
    if (!changed) return undefined
    setPulseCategory(changed)
    window.clearTimeout(pulseTimeout.current)
    pulseTimeout.current = window.setTimeout(() => setPulseCategory(null), 1500)
    return () => window.clearTimeout(pulseTimeout.current)
  }, [items])

  const categories = useMemo(() => {
    const grouped = new Map()
    items.forEach((item) => {
      if (!grouped.has(item.category)) grouped.set(item.category, [])
      grouped.get(item.category).push(item)
    })

    const makeCategory = (id, label, categoryItems) => ({
      id,
      label,
      items: categoryItems,
      ...summarizeInventoryStates(categoryItems),
    })

    const zoneCategories = Array.from(grouped.entries())
      .map(([id, categoryItems]) => makeCategory(id, categoryLabel(id), categoryItems))
      .sort((a, b) => b.total - a.total)

    return [
      makeCategory('all', 'Todo el inventario', items),
      ...zoneCategories,
    ]
  }, [items])

  const selected = useMemo(
    () => categories.find((category) => category.id === selectedCategory) || categories[0],
    [categories, selectedCategory]
  )

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-CO')
    return (selected?.items || []).filter((item) => {
      const matchesQuery = !normalizedQuery ||
        item.nombre.toLocaleLowerCase('es-CO').includes(normalizedQuery) ||
        String(item.sku || '').toLocaleLowerCase('es-CO').includes(normalizedQuery)
      return matchesQuery && matchesFilter(item, statusFilter)
    })
  }, [query, selected, statusFilter])

  const totals = useMemo(() => {
    const summary = summarizeInventoryStates(items)
    return {
      ...summary,
      progress: summary.total ? Math.round((summary.counted / summary.total) * 100) : 0,
    }
  }, [items])

  const reviewItems = useMemo(() => getWarehouseReviewItems(items), [items])

  const mapCategories = useMemo(
    () => categories.filter((category) => category.id !== 'all' && WAREHOUSE_ZONE_LAYOUT[category.id]),
    [categories]
  )

  const selectedMapCategory = selected?.id === 'all' ? categories[0] : selected
  const selectedMapState = zoneVisualState(selectedMapCategory)
  const selectedMapProgress = selectedMapCategory?.total
    ? Math.round((selectedMapCategory.counted / selectedMapCategory.total) * 100)
    : 0
  const nextPending = (selectedMapCategory?.items || [])
    .filter((item) => item.state === 'pending')
    .slice(0, 3)

  const selectCategory = (id) => {
    setSelectedCategory(id)
    setStatusFilter('all')
    setQuery('')
  }

  const showSelectedProducts = () => {
    inventoryExplorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const showSystemBalances = () => {
    setSelectedCategory('all')
    setStatusFilter('system')
    setQuery('')
    window.requestAnimationFrame(() => {
      inventoryExplorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const focusAgentItem = (item) => {
    setSelectedCategory(item.category)
    setStatusFilter('all')
    setQuery(item.nombre)
    window.requestAnimationFrame(() => {
      inventoryExplorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const showAgentReviews = () => {
    setSelectedCategory('all')
    setStatusFilter('review_pending')
    setQuery('')
    window.requestAnimationFrame(() => {
      inventoryExplorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const showAllInventory = () => {
    setSelectedCategory('all')
    setStatusFilter('all')
    setQuery('')
    window.requestAnimationFrame(() => {
      inventoryExplorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <main className='mapa-screen'>
      <TopBar title={`Inventario · ${bodegaLabel}`} onBack={onBack} backLabel='Bodegas' onProfile={onProfile} />

      <div className='mapa-layout'>
        <header className='mapa-command-head'>
          <div>
            <span className='eyebrow'>Control de inventario</span>
            <h1>Inventario y conteo físico</h1>
            <p>Consulta el saldo registrado y compáralo con las cantidades contadas.</p>
          </div>
          <div className='mapa-command-actions'>
            {onClose && sessionId && records.length > 0 && (
              <Button variant='secondary' onClick={onClose}>
                Cerrar y firmar
              </Button>
            )}
            {onStart && (
              <Button icon={ArrowRight} onClick={onStart}>
                {sessionId ? 'Continuar conteo' : 'Iniciar conteo'}
              </Button>
            )}
          </div>
        </header>

        <div className='mapa-stats'>
          <StatTile value={totals.total || '—'} label='Referencias iniciales' />
          <StatTile value={`${totals.progress}%`} label='Avance físico' />
          <StatTile icon={CheckCircle2} value={totals.ok} label='Coinciden' />
          <StatTile value={totals.pending} label='Pendientes' />
          <StatTile icon={AlertTriangle} value={totals.reviewPending} label='Revisiones pendientes' />
          <StatTile icon={Database} value={totals.systemIssues} label='Saldos del sistema' />
        </div>

        {error && <p className='mapa-error'>{error}</p>}

        {totals.systemIssues > 0 && (
          <aside className='mapa-system-note'>
            <span className='mapa-system-note-icon'><Database size={20} /></span>
            <div>
              <strong>{totals.systemIssues} saldos negativos en el sistema</strong>
              <p>
                Se muestran por separado y no cambian una zona a anomalía hasta registrar el conteo físico.
              </p>
            </div>
            <button type='button' onClick={showSystemBalances}>Revisar saldos</button>
          </aside>
        )}

        <section className='mapa-visual' aria-labelledby='mapa-visual-title'>
          <header className='mapa-visual-head'>
            <div className='mapa-visual-title'>
              <span className='mapa-visual-symbol'><MapPinned size={22} /></span>
              <div>
                <span className='eyebrow'>Distribución por zonas</span>
                <h2 id='mapa-visual-title'>Plano de almacenamiento</h2>
                <p>Selecciona una zona para conocer su avance y revisar sus productos.</p>
              </div>
            </div>
            <button
              type='button'
              className={`mapa-overview-button ${selected?.id === 'all' ? 'active' : ''}`}
              aria-pressed={selected?.id === 'all'}
              onClick={() => selectCategory('all')}
            >
              <Warehouse size={17} />
              Vista general
            </button>
          </header>

          <div className='mapa-visual-body'>
            <div className='mapa-floor-wrap'>
              <div className='mapa-floor-toolbar'>
                <span><Route size={15} />Plano superior · flujo de recorrido</span>
                <div className='mapa-floor-legend' aria-label='Estados del mapa'>
                  <span><i className='rack-pending' />Pendiente</span>
                  <span><i className='rack-ok' />Coincide</span>
                  <span><i className='rack-warn' />Revisar</span>
                  <span><i className='rack-bad' />Anomalía</span>
                </div>
              </div>

              <div className='mapa-floor' aria-label='Plano interactivo de la bodega'>
                <span className='mapa-floor-axis mapa-floor-axis-top'>Pasillo norte</span>
                <span className='mapa-floor-axis mapa-floor-axis-left'>Recepción</span>
                <div className='mapa-floor-grid'>
                  {mapCategories.map((category) => (
                    <WarehouseZone
                      key={category.id}
                      category={category}
                      selected={category.id === selected?.id}
                      onSelect={selectCategory}
                    />
                  ))}
                </div>
                <div className='mapa-floor-route' aria-hidden='true'>
                  <i /><i /><i /><i />
                </div>
                <div className='mapa-floor-entry'>
                  <ArrowDown size={15} />
                  Entrada y despacho
                </div>
              </div>
            </div>

            <aside className={`mapa-zone-inspector is-${selectedMapState}`} aria-live='polite'>
              <div className='mapa-zone-inspector-hero'>
                <span className='mapa-zone-inspector-icon'>
                  {selectedMapCategory?.id === 'all'
                    ? <Warehouse size={24} />
                    : <CategoryIcon id={selectedMapCategory?.id} size={24} />}
                </span>
                <span className={`mapa-zone-health is-${selectedMapState}`}>
                  {ZONE_VISUAL_LABELS[selectedMapState]}
                </span>
                <span className='eyebrow'>
                  {selectedMapCategory?.id === 'all' ? 'Toda la bodega' : 'Zona seleccionada'}
                </span>
                <h3>{selectedMapCategory?.label}</h3>
                <p>
                  {selectedMapCategory?.id === 'all'
                    ? 'Saldos, avance y pendientes de todas las zonas.'
                    : 'Referencias pendientes y resultados de esta zona.'}
                </p>
              </div>

              <div className='mapa-zone-progress-ring-row'>
                <div
                  className='mapa-zone-progress-ring'
                  style={{ '--zone-progress': `${selectedMapProgress * 3.6}deg` }}
                  role='img'
                  aria-label={`${selectedMapProgress}% contado`}
                >
                  <span><strong>{selectedMapProgress}%</strong><small>contado</small></span>
                </div>
                <div className='mapa-zone-inspector-metrics'>
                  <span><strong>{selectedMapCategory?.total || 0}</strong><small>Referencias</small></span>
                  <span><strong>{selectedMapCategory?.ok || 0}</strong><small>Coinciden</small></span>
                  <span><strong>{selectedMapCategory?.pending || 0}</strong><small>Pendientes</small></span>
                  <span><strong>{selectedMapCategory?.issues || 0}</strong><small>Diferencias</small></span>
                </div>
              </div>

              {selectedMapCategory?.systemIssues > 0 && (
                <div className='mapa-zone-system-note'>
                  <Database size={15} />
                  <span>
                    <strong>{selectedMapCategory.systemIssues} saldos negativos del sistema</strong>
                    <small>No definen el resultado físico de esta zona.</small>
                  </span>
                </div>
              )}

              <div className='mapa-next-items'>
                <span className='mapa-next-items-label'>Próximos por contar</span>
                {nextPending.length
                  ? nextPending.map((item) => (
                    <span className='mapa-next-item' key={item.id}>
                      <span><strong>{item.nombre}</strong><small>{item.sku ? `SKU ${item.sku}` : 'Sin SKU'}</small></span>
                    </span>
                  ))
                  : <p>Esta zona no tiene productos pendientes.</p>}
              </div>

              <button type='button' className='mapa-zone-inspector-cta' onClick={showSelectedProducts}>
                Ver productos de esta zona
                <ArrowDown size={17} />
              </button>
            </aside>
          </div>
        </section>

        <div className='mapa-workspace'>
          <aside className='mapa-zone-rail' aria-label='Zonas del inventario'>
            <div className='mapa-zone-rail-head'>
              <div>
                <span className='eyebrow'>Zonas</span>
                <h2>¿Qué quieres revisar?</h2>
              </div>
              {updatedAt && (
                <span className='mapa-updated'>
                  <Clock3 size={13} />
                  {updatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className='mapa-zone-list'>
              {categories.map((category) => (
                <ZoneCard
                  key={category.id}
                  category={category}
                  active={category.id === selected?.id}
                  onSelect={selectCategory}
                />
              ))}
            </div>
          </aside>

          <section className='mapa-explorer' aria-labelledby='mapa-explorer-title' ref={inventoryExplorerRef}>
            <div className='mapa-explorer-head'>
              <span className={`mapa-category-mark ${pulseCategory === selected?.id ? 'zone-pulse' : ''}`}>
                {selected?.id === 'all'
                  ? <Boxes size={22} />
                  : <CategoryIcon id={selected?.id} size={22} />}
              </span>
              <div>
                <span className='eyebrow'>Detalle de inventario</span>
                <h2 id='mapa-explorer-title'>{selected?.label || 'Inventario'}</h2>
                <p>
                  {selected?.ok || 0} coinciden · {selected?.pending || 0} pendientes · {selected?.issues || 0} diferencias
                </p>
              </div>
            </div>

            <div className='mapa-tools'>
              <label className='mapa-search'>
                <Search size={18} aria-hidden='true' />
                <span className='sr-only'>Buscar producto o SKU</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder='Buscar producto o SKU'
                />
              </label>
              <div className='mapa-filter-bar' aria-label='Filtrar por estado'>
                {FILTERS.map((filter) => (
                  <button
                    type='button'
                    key={filter.id}
                    className={statusFilter === filter.id ? 'active' : ''}
                    aria-pressed={statusFilter === filter.id}
                    onClick={() => setStatusFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className='mapa-inventory-table'>
              <div className='mapa-inventory-row mapa-inventory-row-head'>
                <span>Producto</span>
                <span>Sistema</span>
                <span>Físico</span>
                <span>Estado</span>
              </div>

              <div className='mapa-inventory-body' aria-live='polite'>
                {loading
                  ? (
                    <div className='mapa-table-state'>
                      <span className='processing-dots'><i /><i /><i /></span>
                      <p>Cargando inventario inicial…</p>
                    </div>
                    )
                  : visibleItems.length
                    ? visibleItems.map((item) => (
                      <div className='mapa-inventory-row' key={item.id}>
                        <span className='mapa-product'>
                          <strong>{item.nombre}</strong>
                          <small>{item.sku ? `SKU ${item.sku}` : 'Sin código SKU'}</small>
                        </span>
                        <span className={`mapa-amount ${item.stock_sistema < 0 ? 'is-negative' : ''}`}>
                          <strong>{formatAmount(item.stock_sistema)}</strong>
                          <small>{UNIT_LABELS[item.unidad] || item.unidad}</small>
                          {item.stock_sistema < 0 && <em>Saldo negativo del sistema</em>}
                        </span>
                        <span className={`mapa-amount ${item.state === 'pending' ? 'mapa-amount-pending' : ''}`}>
                          <strong>{item.state === 'pending' ? '—' : formatAmount(item.cantidad_actual)}</strong>
                          <small>{item.state === 'pending' ? 'Sin contar' : (UNIT_LABELS[item.unidad] || item.unidad)}</small>
                        </span>
                        <span className={`mapa-state ${item.reviewResolved ? 'mapa-state-corrected' : `mapa-state-${item.state}`}`}>
                          {item.reviewResolved ? 'Corregido' : STATE_LABELS[item.state]}
                        </span>
                      </div>
                    ))
                    : (
                      <div className='mapa-table-state'>
                        <PackageSearch size={28} />
                        <strong>No hay productos con estos filtros</strong>
                        <p>Prueba otra zona, estado o término de búsqueda.</p>
                      </div>
                      )}
              </div>
            </div>

            <footer className='mapa-explorer-foot'>
              <span>{visibleItems.length} productos visibles</span>
              <span><i className='state-ok' />Coincide</span>
              <span><i className='state-warn' />Revisar</span>
              <span><i className='state-bad' />Anomalía</span>
            </footer>
          </section>
        </div>
      </div>
      <WarehouseVoiceAgent
        reviewItems={reviewItems}
        warehouse={warehouse}
        warehouseLabel={bodegaLabel}
        onFocusItem={focusAgentItem}
        onShowReviews={showAgentReviews}
        onShowAll={showAllInventory}
      />
    </main>
  )
}
