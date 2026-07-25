import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  MinusCircle,
  PackageCheck,
  Search,
  X,
} from 'lucide-react'
import { useLiveInventory } from '../lib/useLiveInventory'
import { Progress, Tangram } from './ui'

const filters = [
  { value: 'todos', label: 'Todos' },
  { value: 'con_stock', label: 'Con existencias' },
  { value: 'sin_stock', label: 'En cero' },
  { value: 'negativo', label: 'Saldo negativo' },
  { value: 'contado', label: 'Contados ahora' },
]

const unitLabels = {
  Unidad: 'unidades',
  Kilogram: 'kg',
  Liter: 'litros',
  Portion: 'porciones',
}

function formatNumber (value) {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

function ItemStatus ({ item }) {
  if (item.countState === 'ok') {
    return <span className='inventory-status status-ok'><CheckCircle2 size={14} />Coincide</span>
  }
  if (item.countState === 'warn') {
    return <span className='inventory-status status-warn'><AlertTriangle size={14} />Revisar</span>
  }
  if (item.countState === 'bad') {
    return <span className='inventory-status status-bad'><AlertTriangle size={14} />Incongruencia</span>
  }
  return <span className='inventory-status status-pending'><MinusCircle size={14} />Pendiente</span>
}

export default function InventoryDrawer ({
  open,
  onClose,
  warehouse,
  warehouseLabel,
  sessionId,
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos')
  const searchRef = useRef(null)
  const { items: mergedItems, summary, countedTotal, loading, error, justCounted } = useLiveInventory({
    warehouse,
    sessionId,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    window.setTimeout(() => searchRef.current?.focus(), 120)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-CO')
    return mergedItems.filter((item) => {
      const matchesQuery = !normalized ||
        item.nombre.toLocaleLowerCase('es-CO').includes(normalized) ||
        String(item.sku || '').includes(normalized)
      const matchesFilter = filter === 'todos' ||
        (filter === 'con_stock' && item.cantidad_actual > 0) ||
        (filter === 'sin_stock' && item.cantidad_actual === 0) ||
        (filter === 'negativo' && item.cantidad_actual < 0) ||
        (filter === 'contado' && item.contado_en_sesion)
      return matchesQuery && matchesFilter
    })
  }, [filter, mergedItems, query])

  if (!open) return null

  return (
    <div className='inventory-overlay' role='presentation' onMouseDown={onClose}>
      <section
        className='inventory-drawer'
        role='dialog'
        aria-modal='true'
        aria-labelledby='inventory-title'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className='inventory-drawer-head'>
          <div className='inventory-title-mark'><Tangram size={30} /></div>
          <div>
            <span className='eyebrow'>Catálogo y existencias</span>
            <h2 id='inventory-title'>Todo lo que tenemos</h2>
            <p>{warehouseLabel}</p>
          </div>
          <button className='inventory-close' onClick={onClose} aria-label='Cerrar inventario'>
            <X size={24} />
          </button>
        </header>

        <div className='inventory-summary' aria-label='Resumen del inventario'>
          <article>
            <Database size={20} />
            <div><strong>{summary?.total ?? '—'}</strong><span>Referencias</span></div>
          </article>
          <article>
            <PackageCheck size={20} />
            <div><strong>{summary?.con_existencias ?? '—'}</strong><span>Con existencias</span></div>
          </article>
          <article>
            <MinusCircle size={20} />
            <div><strong>{summary?.sin_existencias ?? '—'}</strong><span>En cero</span></div>
          </article>
          <article>
            <AlertTriangle size={20} />
            <div><strong>{summary?.saldo_negativo ?? '—'}</strong><span>Por verificar</span></div>
          </article>
        </div>

        <div className='inventory-toolbar'>
          <label className='inventory-search'>
            <Search size={19} />
            <span className='sr-only'>Buscar producto o SKU</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Buscar producto o SKU'
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label='Limpiar búsqueda'><X size={17} /></button>
            )}
          </label>
          <div className='inventory-filters' aria-label='Filtrar inventario'>
            {filters.map((item) => (
              <button
                key={item.value}
                className={filter === item.value ? 'active' : ''}
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className='inventory-results-meta' aria-live='polite'>
          <div className='inventory-results-meta-row'>
            <span>
              {loading
                ? 'Consultando inventario…'
                : `Mostrando ${visibleItems.length} de ${summary?.total ?? 0} referencias`}
            </span>
            <span>El conteo físico tiene prioridad sobre el saldo del sistema.</span>
          </div>
          <div className='inventory-progress' aria-label='Productos contados en esta sesión'>
            <span className='inventory-progress-label'>Productos contados</span>
            <Progress current={countedTotal} total={summary?.total || mergedItems.length || 1} />
          </div>
        </div>

        <div className='inventory-table' role='table' aria-label='Inventario completo'>
          <div className='inventory-row inventory-table-head' role='row'>
            <span role='columnheader'>Artículo</span>
            <span role='columnheader'>SKU</span>
            <span role='columnheader'>Cantidad actual</span>
            <span role='columnheader'>Estado</span>
          </div>
          <div className='inventory-table-body'>
            {error && (
              <div className='inventory-empty' role='alert'>
                <AlertTriangle size={28} />
                <strong>No pudimos abrir el inventario</strong>
                <span>{error}</span>
              </div>
            )}
            {!error && !loading && visibleItems.map((item) => (
              <article
                className={`inventory-row inventory-row-${item.countState} ${justCounted.has(item.id) ? 'row-flash' : ''}`}
                role='row'
                key={item.id}
              >
                <span className='inventory-product' role='cell'>
                  <strong>{item.nombre}</strong>
                  <small>{item.bodega}</small>
                </span>
                <span className='inventory-sku' role='cell'>{item.sku || 'Sin código'}</span>
                <span className='inventory-amount' role='cell'>
                  <strong>{formatNumber(item.cantidad_actual)}</strong>
                  <small>{unitLabels[item.unidad] || item.unidad}</small>
                </span>
                <span role='cell'><ItemStatus item={item} /></span>
              </article>
            ))}
            {!error && !loading && !visibleItems.length && (
              <div className='inventory-empty'>
                <Search size={28} />
                <strong>No encontramos resultados</strong>
                <span>Prueba con otro nombre, SKU o filtro.</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
