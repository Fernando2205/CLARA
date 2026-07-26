import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, CheckCircle2, FileText, MinusCircle, Search } from 'lucide-react'
import { useLiveInventory } from '../lib/useLiveInventory'
import { Badge, Button, Progress } from './ui'

const unitLabels = {
  Unidad: 'unidades',
  Kilogram: 'kg',
  Liter: 'litros',
  Portion: 'porciones',
}

function formatNumber (value) {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

function CheckStateIcon ({ state }) {
  if (state === 'ok') return <CheckCircle2 size={16} />
  if (state === 'warn' || state === 'bad') return <AlertTriangle size={16} />
  return <MinusCircle size={16} />
}

export default function SessionPanel ({
  warehouse,
  sessionId,
  alerts,
  onClose,
  onReport,
  mobileOpen,
  onMobileToggle,
}) {
  const [query, setQuery] = useState('')
  const { items, countedTotal, total, loading, error, justCounted } = useLiveInventory({ warehouse, sessionId })

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-CO')
    if (!normalized) return items
    return items.filter((item) => (
      item.nombre.toLocaleLowerCase('es-CO').includes(normalized) ||
        String(item.sku || '').includes(normalized)
    ))
  }, [items, query])

  return (
    <aside className={`session-panel ${mobileOpen ? 'mobile-open' : ''}`}>
      <button className='mobile-sheet-handle' onClick={onMobileToggle} aria-label='Abrir lista de productos'>
        <span />
        <div>
          <strong>Inventario de la bodega</strong>
          <span>{countedTotal} de {total || '—'} productos</span>
        </div>
        <ChevronDown size={20} />
      </button>
      <div className='session-panel-head'>
        <div>
          <span className='eyebrow'>Conteo físico</span>
          <h2>Inventario de la bodega</h2>
        </div>
      </div>
      <Progress current={countedTotal} total={total || 1} alerts={alerts} />

      <label className='checklist-search'>
        <Search size={16} />
        <span className='sr-only'>Buscar producto en esta bodega</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Buscar en la lista de productos'
        />
      </label>

      <div className='checklist' aria-label='Todos los productos de esta bodega'>
        {error && <p className='checklist-error'>{error}</p>}
        {loading && !items.length && <p className='checklist-status'>Cargando productos…</p>}
        {!loading && !error && !visibleItems.length && (
          <p className='checklist-status'>No encontramos productos con ese nombre.</p>
        )}
        {visibleItems.map((item) => (
          <article
            className={`checklist-item checklist-item-${item.countState} ${justCounted.has(item.id) ? 'row-flash' : ''}`}
            key={item.id}
          >
            <span className='checklist-item-state'><CheckStateIcon state={item.countState} /></span>
            <div className='checklist-item-copy'>
              <strong>{item.nombre}</strong>
              <span>{item.sku ? `SKU ${item.sku}` : 'Sin código'}</span>
              {item.badge && <Badge type={item.badge} />}
            </div>
            <div className='checklist-item-quantity'>
              {item.contado_en_sesion
                ? (
                  <>
                    <strong>{formatNumber(item.cantidad_actual)}</strong>
                    <span>{unitLabels[item.unidad] || item.unidad}</span>
                  </>
                  )
                : (
                  <>
                    <strong>{formatNumber(item.stock_sistema)}</strong>
                    <span>{unitLabels[item.unidad] || item.unidad} · sistema</span>
                  </>
                  )}
            </div>
          </article>
        ))}
      </div>

      <div className='session-panel-foot'>
        <Button variant='secondary' onClick={onClose}>Cerrar y firmar</Button>
        <button className='report-shortcut' onClick={onReport}>
          <FileText size={16} /> Generar reporte con lo contado hasta ahora
        </button>
      </div>
    </aside>
  )
}
