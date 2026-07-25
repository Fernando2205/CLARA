import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { listQueued, queueRecord, queueSize, removeQueued } from '../lib/offline'
import { getSessionSummary, saveInventoryRecord } from '../lib/api'
import { isPermanentSaveError } from '../lib/syncPolicy'

const initialRecords = []

// Marca `id` como sincronizado si sigue existiendo en la sesión actual
// (pudo haber cambiado de bodega/sesión mientras estaba en la cola).
function markSynced (set, id) {
  set((state) => ({
    records: state.records.map((record) => (
      record.id === id && record.badge === 'pendiente'
        ? { ...record, badge: 'sincronizado' }
        : record
    )),
  }))
}

function markPending (set, id) {
  set((state) => ({
    records: state.records.map((record) => (
      record.id === id ? { ...record, badge: 'pendiente' } : record
    )),
  }))
}

function markRejected (set, id, message) {
  set((state) => ({
    records: state.records.map((record) => (
      record.id === id
        ? { ...record, badge: 'rechazado', syncError: message }
        : record
    )),
  }))
}

function markApplied (set, sessionId) {
  set((state) => ({
    records: state.records.map((record) => (
      record.sessionId === sessionId
        ? { ...record, badge: 'aplicado', masterApplied: true }
        : record
    )),
  }))
}

export const useSessionStore = create(persist((set, get) => ({
  bodega: 'STOCK RESTAURANTE FUENTES AYB',
  bodegaLabel: 'Restaurante Fuentes · AyB',
  mode: 'toma',
  totalRefs: 344,
  baselineCount: 0,
  records: initialRecords,
  online: true,
  pendingSyncCount: 0,
  corrections: 0,
  alertsResolved: 0,
  signature: null,
  sessionId: null,
  setSessionId: (sessionId) => set({ sessionId }),
  startSession: (sessionId) => set({
    sessionId,
    signature: null,
    records: [],
    corrections: 0,
    alertsResolved: 0,
  }),
  setSignature: (signature) => set({ signature }),
  setBodega: (bodega, bodegaLabel) => set((state) => ({
    bodega,
    bodegaLabel,
    sessionId: state.bodega === bodega ? state.sessionId : null,
    signature: state.bodega === bodega ? state.signature : null,
    records: state.bodega === bodega ? state.records : [],
    corrections: state.bodega === bodega ? state.corrections : 0,
    alertsResolved: state.bodega === bodega ? state.alertsResolved : 0,
  })),
  setMode: (mode) => set({ mode }),
  setOnline: (online) => {
    set({ online })
    if (online) get().flushPendientesSync()
  },
  toggleOnline: () => get().setOnline(!get().online),
  // §7.3: intenta guardar contra el backend; si falla o no hay red, encola
  // en IndexedDB (lib/offline.js) para reintentar cuando vuelva la conexión.
  addRecord: async (record, apiPayload) => {
    const id = Date.now()
    const { online, sessionId } = get()
    set((state) => ({
      records: [{ ...record, id, sessionId, badge: 'pendiente' }, ...state.records],
      alertsResolved: state.alertsResolved + (record.resolvedAlertCount || 0),
    }))
    if (!apiPayload || !sessionId) return { id, status: 'local' }
    if (!online) {
      await get().enqueueForSync(sessionId, apiPayload, id)
      return { id, status: 'queued' }
    }
    try {
      await saveInventoryRecord(sessionId, apiPayload)
      markSynced(set, id)
      return { id, status: 'synced' }
    } catch (error) {
      if (isPermanentSaveError(error)) {
        set((state) => ({
          records: state.records.filter((item) => item.id !== id),
          alertsResolved: Math.max(
            0,
            state.alertsResolved - (record.resolvedAlertCount || 0)
          ),
        }))
        return { id, status: 'rejected', error: error.message }
      }
      markPending(set, id)
      await get().enqueueForSync(sessionId, apiPayload, id)
      return { id, status: 'queued' }
    }
  },
  updateRecord: async (id, updates, apiPayload) => {
    const { online, sessionId } = get()
    const previousRecord = get().records.find((record) => record.id === id)
    const correctionPayload = apiPayload ? { ...apiPayload, corregido: true } : null
    set((state) => ({
      records: state.records.map((record) => (
        record.id === id
          ? { ...record, ...updates, sessionId, badge: 'pendiente', isCorrection: true }
          : record
      )),
      corrections: state.corrections + 1,
      alertsResolved: state.alertsResolved + (updates.resolvedAlertCount || 0),
    }))
    if (!correctionPayload || !sessionId) return { id, status: 'local' }
    if (!online) {
      await get().enqueueForSync(sessionId, correctionPayload, id)
      return { id, status: 'queued' }
    }
    try {
      await saveInventoryRecord(sessionId, correctionPayload)
      markSynced(set, id)
      return { id, status: 'synced' }
    } catch (error) {
      if (isPermanentSaveError(error)) {
        set((state) => ({
          records: state.records.map((record) => (
            record.id === id && previousRecord ? previousRecord : record
          )),
          corrections: Math.max(0, state.corrections - 1),
          alertsResolved: Math.max(
            0,
            state.alertsResolved - (updates.resolvedAlertCount || 0)
          ),
        }))
        return { id, status: 'rejected', error: error.message }
      }
      markPending(set, id)
      await get().enqueueForSync(sessionId, correctionPayload, id)
      return { id, status: 'queued' }
    }
  },
  correctRecord: async (record, apiPayload) => {
    const { online, sessionId } = get()
    const existing = get().records.find((item) => (
      record.articleId != null && item.articleId === record.articleId
    ))
    const previousRecord = existing ? { ...existing } : null
    const id = existing?.id ?? Date.now()
    const correctionPayload = apiPayload ? { ...apiPayload, corregido: true } : null
    set((state) => ({
      records: existing
        ? state.records.map((item) => (
          item.id === existing.id
            ? {
                ...item,
                ...record,
                id,
                sessionId,
                badge: 'pendiente',
                reviewResolved: true,
              }
            : item
        ))
        : [{
            ...record,
            id,
            sessionId,
            badge: 'pendiente',
            reviewResolved: true,
          }, ...state.records],
      corrections: state.corrections + 1,
      alertsResolved: state.alertsResolved + (record.resolvedAlertCount || 1),
    }))

    if (!correctionPayload || !sessionId) return { id, status: 'local' }
    if (!online) {
      await get().enqueueForSync(sessionId, correctionPayload, id)
      return { id, status: 'queued' }
    }
    try {
      await saveInventoryRecord(sessionId, correctionPayload)
      markSynced(set, id)
      return { id, status: 'synced' }
    } catch (error) {
      if (isPermanentSaveError(error)) {
        set((state) => ({
          records: previousRecord
            ? state.records.map((item) => item.id === id ? previousRecord : item)
            : state.records.filter((item) => item.id !== id),
          corrections: Math.max(0, state.corrections - 1),
          alertsResolved: Math.max(
            0,
            state.alertsResolved - (record.resolvedAlertCount || 1)
          ),
        }))
        return { id, status: 'rejected', error: error.message }
      }
      markPending(set, id)
      await get().enqueueForSync(sessionId, correctionPayload, id)
      return { id, status: 'queued' }
    }
  },
  enqueueForSync: async (sessionId, apiPayload, recordId) => {
    await queueRecord(sessionId, apiPayload, recordId)
    set({ pendingSyncCount: await queueSize() })
  },
  // Procesa la cola en orden de llegada. Solo conserva fallos recuperables:
  // una sesión cerrada o un payload inválido no mejorarán al reintentarlos.
  flushPendientesSync: async (onlySessionId = null) => {
    const queued = await listQueued()
    const items = onlySessionId
      ? queued.filter((item) => item.sessionId === onlySessionId)
      : queued
    const closedSessions = new Set()
    const missingSessions = new Set()
    const sessionIds = [...new Set(items.map((item) => item.sessionId))]
    for (const queuedSessionId of sessionIds) {
      try {
        const summary = await getSessionSummary(queuedSessionId)
        if (summary.firmada) closedSessions.add(queuedSessionId)
      } catch (error) {
        if (error?.status === 404) missingSessions.add(queuedSessionId)
      }
    }
    for (const item of items) {
      if (closedSessions.has(item.sessionId) || missingSessions.has(item.sessionId)) {
        await removeQueued(item.localId)
        markRejected(
          set,
          item.recordId,
          closedSessions.has(item.sessionId)
            ? 'La sesión ya fue firmada'
            : 'La sesión ya no existe'
        )
        continue
      }
      try {
        await saveInventoryRecord(item.sessionId, item.payload)
        await removeQueued(item.localId)
        markSynced(set, item.recordId)
      } catch (error) {
        if (isPermanentSaveError(error)) {
          await removeQueued(item.localId)
          markRejected(set, item.recordId, error.message)
        }
        // Los errores de red, timeout o servicio sí quedan para reintento.
      }
    }
    const remaining = await listQueued()
    set({ pendingSyncCount: remaining.length })
    return onlySessionId
      ? remaining.filter((item) => item.sessionId === onlySessionId).length
      : remaining.length
  },
  refreshPendingSyncCount: async () => set({ pendingSyncCount: await queueSize() }),
  markInventoryApplied: (sessionId) => markApplied(set, sessionId),
  undoLast: () => set((state) => ({ records: state.records.slice(1) })),
  reset: () => set({
    records: initialRecords,
    corrections: 0,
    alertsResolved: 0,
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
