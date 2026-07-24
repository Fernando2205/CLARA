import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { listQueued, queueRecord, queueSize, removeQueued } from '../lib/offline'
import { saveInventoryRecord } from '../lib/api'

const initialRecords = [
  { id: 5, name: 'ACEITE', quantity: 12, unit: 'litros', catalogUnit: 'Liter', stock: 851.43, sku: '7290', badge: 'sincronizado' },
  { id: 4, name: 'HUEVO AA', quantity: 35, unit: 'unidades', catalogUnit: 'Unidad', stock: 40, sku: '7432', badge: 'corregido' },
  { id: 3, name: 'GUISO CRIOLLO', quantity: 45, unit: 'porciones', catalogUnit: 'Portion', stock: -12, sku: null, badge: 'sincronizado' },
  { id: 2, name: 'ARROZ', quantity: 18, unit: 'kilogramos', catalogUnit: 'Kilogram', stock: 210.02, sku: '6005', badge: 'sincronizado' },
  { id: 1, name: 'AZUCAR', quantity: 8, unit: 'kilogramos', catalogUnit: 'Kilogram', stock: 9, sku: '6012', badge: 'sincronizado' },
]

// Marca `id` como sincronizado si sigue existiendo en la sesión actual
// (pudo haber cambiado de bodega/sesión mientras estaba en la cola).
function markSynced(set, id) {
  set((state) => ({
    records: state.records.map((record) => (
      record.id === id && record.badge === 'pendiente'
        ? { ...record, badge: 'sincronizado' }
        : record
    )),
  }))
}

function markPending(set, id) {
  set((state) => ({
    records: state.records.map((record) => (
      record.id === id ? { ...record, badge: 'pendiente' } : record
    )),
  }))
}

export const useSessionStore = create(persist((set, get) => ({
  bodega: 'STOCK RESTAURANTE FUENTES AYB',
  bodegaLabel: 'Restaurante Fuentes · AyB',
  mode: 'toma',
  totalRefs: 344,
  baselineCount: 42,
  records: initialRecords,
  online: true,
  pendingSyncCount: 0,
  corrections: 3,
  alertsResolved: 3,
  signature: null,
  sessionId: null,
  setSessionId: (sessionId) => set({ sessionId }),
  setSignature: (signature) => set({ signature }),
  setBodega: (bodega, bodegaLabel) => set((state) => ({
    bodega,
    bodegaLabel,
    sessionId: state.bodega === bodega ? state.sessionId : null,
  })),
  setMode: (mode) => set({ mode }),
  setOnline: (online) => {
    set({ online })
    if (online) get().flushPendientesSync()
  },
  toggleOnline: () => get().setOnline(!get().online),
  // §7.3: intenta guardar contra el backend; si falla o no hay red, encola
  // en IndexedDB (lib/offline.js) para reintentar cuando vuelva la conexión.
  addRecord: (record, apiPayload) => {
    const id = Date.now()
    const { online, sessionId } = get()
    set((state) => ({
      records: [{ ...record, id, badge: online ? 'sincronizado' : 'pendiente' }, ...state.records],
      alertsResolved: state.alertsResolved + (record.resolvedAlertCount || 0),
    }))
    if (apiPayload && sessionId) {
      if (online) {
        saveInventoryRecord(sessionId, apiPayload).catch(() => {
          markPending(set, id)
          get().enqueueForSync(sessionId, apiPayload, id)
        })
      } else {
        get().enqueueForSync(sessionId, apiPayload, id)
      }
    }
    return id
  },
  updateRecord: (id, updates, apiPayload) => {
    const { online, sessionId } = get()
    set((state) => ({
      records: state.records.map((record) => (
        record.id === id
          ? { ...record, ...updates, badge: 'corregido' }
          : record
      )),
      corrections: state.corrections + 1,
      alertsResolved: state.alertsResolved + (updates.resolvedAlertCount || 0),
    }))
    if (apiPayload && sessionId) {
      if (online) {
        saveInventoryRecord(sessionId, apiPayload).catch(() => get().enqueueForSync(sessionId, apiPayload, id))
      } else {
        get().enqueueForSync(sessionId, apiPayload, id)
      }
    }
  },
  enqueueForSync: async (sessionId, apiPayload, recordId) => {
    await queueRecord(sessionId, apiPayload, recordId)
    set({ pendingSyncCount: await queueSize() })
  },
  // Procesa la cola en orden de llegada; se detiene en el primer fallo
  // (backend sigue caído) y deja el resto encolado para el próximo intento.
  flushPendientesSync: async () => {
    const items = await listQueued()
    for (const item of items) {
      try {
        await saveInventoryRecord(item.sessionId, item.payload)
        await removeQueued(item.localId)
        markSynced(set, item.recordId)
      } catch {
        break
      }
    }
    set({ pendingSyncCount: await queueSize() })
  },
  refreshPendingSyncCount: async () => set({ pendingSyncCount: await queueSize() }),
  undoLast: () => set((state) => ({ records: state.records.slice(1) })),
  reset: () => set({
    records: initialRecords,
    corrections: 3,
    alertsResolved: 3,
    signature: null,
    sessionId: null,
  }),
}), {
  name: 'clara-session',
  partialize: (state) => ({
    bodega: state.bodega,
    bodegaLabel: state.bodegaLabel,
    mode: state.mode,
    records: state.records,
    online: state.online,
    corrections: state.corrections,
    alertsResolved: state.alertsResolved,
    signature: state.signature,
    sessionId: state.sessionId,
  }),
}))

// Riesgo operativo "sin red en el recinto" (§10): cuando el navegador
// recupera la conexión real, se sincroniza automáticamente lo encolado.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useSessionStore.getState().setOnline(true))
  window.addEventListener('offline', () => useSessionStore.getState().setOnline(false))
  useSessionStore.getState().refreshPendingSyncCount()
  if (navigator.onLine) useSessionStore.getState().flushPendientesSync()
}
