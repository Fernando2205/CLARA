import { useEffect, useMemo, useRef, useState } from 'react'
import { getInventory } from './api'
import { deltaState } from './deltaState'
import { useSessionStore } from '../stores/session'

// Combina el inventario del servidor con los registros que ya están en la
// sesión local (Zustand). El backend confirma el conteo al guardar, pero eso
// puede tardar (red, cola offline); superponer el registro local encima deja
// que la fila se pinte gris → verde/amarillo/rojo al instante en cuanto Clara
// confirma el conteo por voz, sin esperar el siguiente fetch.
export function useLiveInventory({ warehouse, sessionId, enabled = true }) {
  const records = useSessionStore((state) => state.records)
  const [inventory, setInventory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [justCounted, setJustCounted] = useState(() => new Set())
  const previousStates = useRef(new Map())
  const flashTimeout = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    setLoading(true)
    setError('')
    getInventory({ warehouse, sessionId })
      .then((response) => { if (active) setInventory(response) })
      .catch(() => { if (active) setError('No pudimos cargar los productos de esta bodega.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [enabled, warehouse, sessionId])

  const latestByArticle = useMemo(() => {
    const map = new Map()
    for (const record of records) {
      if (record.articleId == null || map.has(record.articleId)) continue
      map.set(record.articleId, record)
    }
    return map
  }, [records])

  const items = useMemo(() => (inventory?.items || []).map((item) => {
    const local = latestByArticle.get(item.id)
    const cantidadActual = local ? Number(local.quantity) : item.cantidad_actual
    const contado = Boolean(local) || item.contado_en_sesion
    return {
      ...item,
      cantidad_actual: cantidadActual,
      contado_en_sesion: contado,
      badge: local?.badge,
      countState: contado ? deltaState(cantidadActual, item.stock_sistema) : 'pending',
    }
  }), [inventory, latestByArticle])

  // Marca las filas que acaban de cambiar de estado para darles un pulso
  // visual breve (el "pintado al instante").
  useEffect(() => {
    const changed = new Set()
    items.forEach((item) => {
      const previous = previousStates.current.get(item.id)
      if (previous && previous !== item.countState && item.countState !== 'pending') changed.add(item.id)
      previousStates.current.set(item.id, item.countState)
    })
    if (changed.size) {
      setJustCounted(changed)
      window.clearTimeout(flashTimeout.current)
      flashTimeout.current = window.setTimeout(() => setJustCounted(new Set()), 900)
    }
    return () => window.clearTimeout(flashTimeout.current)
  }, [items])

  const countedTotal = useMemo(() => items.filter((item) => item.contado_en_sesion).length, [items])

  return {
    items,
    summary: inventory?.resumen,
    countedTotal,
    total: inventory?.resumen?.total ?? items.length,
    loading,
    error,
    justCounted,
  }
}
