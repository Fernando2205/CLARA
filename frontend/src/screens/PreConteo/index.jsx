import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList, Mic, PackageCheck, Search } from 'lucide-react'
import { Button, CategoryIcon, StatTile, TopBar } from '../../components/ui'
import { categorize, categoryLabel } from '../../lib/categories'
import { getInventory } from '../../lib/api'
import { useSessionStore } from '../../stores/session'

const unitLabels = {
  Unidad: 'unidades',
  Kilogram: 'kg',
  Liter: 'litros',
  Portion: 'porciones',
}

export default function PreConteo({ onBack, onStart, onProfile }) {
  const warehouse = useSessionStore((state) => state.bodega)
  const bodegaLabel = useSessionStore((state) => state.bodegaLabel)
  const sessionId = useSessionStore((state) => state.sessionId)
  const [inventory, setInventory] = useState(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getInventory({ warehouse, sessionId })
      .then((response) => { if (active) setInventory(response) })
      .catch(() => { if (active) setError('No pudimos cargar los productos de esta bodega.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [warehouse, sessionId])

  const items = inventory?.items || []
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-CO')
    if (!normalized) return items
    return items.filter((item) => item.nombre.toLocaleLowerCase('es-CO').includes(normalized))
  }, [items, query])

  const contadas = items.filter((item) => item.contado_en_sesion).length

  return (
    <main className="preconteo-screen">
      <TopBar title={bodegaLabel} onBack={onBack} backLabel="Bodegas" onProfile={onProfile} />
      <div className="preconteo-layout">
        <div className="preconteo-heading">
          <span className="eyebrow"><ClipboardList size={15} /> Antes de empezar</span>
          <h1>Estos son los productos que vas a contar</h1>
          <p>Clara escuchará tu voz y validará cada producto contra este catálogo mientras dictas el conteo.</p>
        </div>

        <div className="mapa-stats">
          <StatTile icon={PackageCheck} value={inventory?.resumen?.total ?? '—'} label="Referencias en esta bodega" />
          <StatTile icon={ClipboardList} value={contadas} label="Ya contadas en esta sesión" />
          <StatTile icon={AlertTriangle} value={inventory?.resumen?.saldo_negativo ?? '—'} label="Por verificar" />
        </div>

        {error && <p className="mapa-error">{error}</p>}

        <label className="preconteo-search">
          <Search size={18} />
          <span className="sr-only">Buscar producto</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar producto en esta bodega"
          />
        </label>

        <div className="preconteo-list" role="table" aria-label="Productos a contar">
          <div className="preconteo-row preconteo-row-head" role="row">
            <span role="columnheader">Producto</span>
            <span role="columnheader">Sistema</span>
            <span role="columnheader">Estado</span>
          </div>
          <div className="preconteo-list-body">
            {loading && <p className="preconteo-status">Cargando productos…</p>}
            {!loading && !error && !visibleItems.length && (
              <p className="preconteo-status">No encontramos productos con ese nombre.</p>
            )}
            {!loading && visibleItems.map((item) => (
              <article className="preconteo-row" role="row" key={item.id}>
                <span className="preconteo-product" role="cell">
                  <span className="preconteo-icon"><CategoryIcon id={categorize(item.nombre)} size={16} /></span>
                  <span>
                    <strong>{item.nombre}</strong>
                    <small>{categoryLabel(categorize(item.nombre))}{item.sku ? ` · SKU ${item.sku}` : ''}</small>
                  </span>
                </span>
                <span className="preconteo-amount" role="cell">
                  <strong>{Number(item.stock_sistema).toLocaleString('es-CO', { maximumFractionDigits: 2 })}</strong>
                  <small>{unitLabels[item.unidad] || item.unidad}</small>
                </span>
                <span role="cell">
                  {item.contado_en_sesion
                    ? <span className="preconteo-chip preconteo-chip-done">Contado</span>
                    : <span className="preconteo-chip">Pendiente</span>}
                </span>
              </article>
            ))}
          </div>
        </div>
      </div>
      <div className="preconteo-footer">
        <div>
          <strong>{items.length} referencias listas para contar</strong>
          <span>Clara te corregirá al instante si algo no cuadra.</span>
        </div>
        <Button onClick={onStart} icon={Mic}>Iniciar conteo</Button>
      </div>
    </main>
  )
}
